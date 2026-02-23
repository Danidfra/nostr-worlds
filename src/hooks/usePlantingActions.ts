import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import type { PlantState } from '@/lib/nostr/types';

/**
 * Optimistic plant marker (temporary until published)
 */
export interface OptimisticPlant extends PlantState {
  __pending?: boolean;
}

interface PlantSeedParams {
  worldId: string;
  mapId: string;
  slotX: number;
  slotY: number;
  cropId: string;
}

/**
 * Hook for planting actions with optimistic updates
 */
export function usePlantingActions() {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const plantSeed = useMutation({
    mutationFn: async (params: PlantSeedParams) => {
      if (!user) {
        throw new Error('User must be logged in to plant');
      }

      const { worldId, mapId, slotX, slotY, cropId } = params;

      // Generate unique plant ID
      const plantId = `plant:${worldId}:${mapId.split(':').pop()}:${slotX}:${slotY}`;
      const now = Math.floor(Date.now() / 1000);

      // Publish PlantState event
      await publishEvent({
        kind: 31417,
        content: '',
        tags: [
          ['d', plantId],
          ['v', '1'],
          ['world', worldId],
          ['map', mapId],
          ['slot', slotX.toString(), slotY.toString()],
          ['crop', cropId],
          ['stage', '0'],
          ['planted_at', now.toString()],
          ['t', worldId], // Discovery tag
        ],
      });

      return { plantId, worldId, mapId, slotX, slotY, cropId, now };
    },
    onMutate: async (params) => {
      const { worldId, mapId, slotX, slotY, cropId } = params;

      // Cancel ongoing queries
      await queryClient.cancelQueries({
        queryKey: ['plantstates', worldId, mapId],
      });

      // Get current plants
      const previousPlants = queryClient.getQueryData<PlantState[]>([
        'plantstates',
        worldId,
        mapId,
      ]);

      // Create optimistic plant
      const plantId = `plant:${worldId}:${mapId.split(':').pop()}:${slotX}:${slotY}`;
      const now = Math.floor(Date.now() / 1000);
      
      const optimisticPlant: OptimisticPlant = {
        event: {
          id: '',
          pubkey: '',
          created_at: now,
          kind: 31417,
          tags: [],
          sig: '',
        },
        id: plantId,
        version: '1',
        worldId,
        mapId,
        slot: { x: slotX, y: slotY },
        crop: cropId,
        stage: 0, // Legacy field
        plantedAt: now, // Authoritative timestamp for growth
        __pending: true,
      };

      // Add optimistic plant to cache
      queryClient.setQueryData<PlantState[]>(
        ['plantstates', worldId, mapId],
        (old) => [...(old || []), optimisticPlant]
      );

      // Return context for rollback
      return { previousPlants, worldId, mapId };
    },
    onError: (error, _params, context) => {
      // Rollback on error
      if (context?.previousPlants) {
        queryClient.setQueryData(
          ['plantstates', context.worldId, context.mapId],
          context.previousPlants
        );
      }

      toast({
        variant: 'destructive',
        title: 'Failed to plant seed',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
    onSuccess: (_data, _params, context) => {
      // Invalidate and refetch to get the real event
      if (context) {
        queryClient.invalidateQueries({
          queryKey: ['plantstates', context.worldId, context.mapId],
        });
      }

      toast({
        title: 'Seed planted!',
        description: 'Your plant is now growing.',
      });
    },
  });

  return {
    plantSeed: plantSeed.mutateAsync,
    isPlanting: plantSeed.isPending,
  };
}
