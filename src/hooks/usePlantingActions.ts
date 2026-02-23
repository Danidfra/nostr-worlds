import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import type { SlotState } from '@/lib/nostr/types';

/**
 * Optimistic slot marker (temporary until published)
 */
export interface OptimisticSlot extends SlotState {
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

      // Generate unique slot ID
      const slotId = `slot:${worldId}:${mapId.split(':').pop()}:${slotX}:${slotY}`;
      const now = Math.floor(Date.now() / 1000);

      // Publish SlotState event (Kind 31417)
      await publishEvent({
        kind: 31417,
        content: '',
        tags: [
          ['d', slotId],
          ['v', '1'],
          ['world', worldId],
          ['map', mapId],
          ['slot', slotX.toString(), slotY.toString()],
          ['type', 'plant'],
          ['crop', cropId],
          ['stage', '0'],
          ['planted_at', now.toString()],
          ['t', worldId], // Discovery tag
        ],
      });

      return { slotId, worldId, mapId, slotX, slotY, cropId, now };
    },
    onMutate: async (params) => {
      const { worldId, mapId, slotX, slotY, cropId } = params;

      // Cancel ongoing queries
      await queryClient.cancelQueries({
        queryKey: ['slotstates', worldId, mapId],
      });

      // Get current slots
      const previousSlots = queryClient.getQueryData<SlotState[]>([
        'slotstates',
        worldId,
        mapId,
      ]);

      // Create optimistic slot
      const slotId = `slot:${worldId}:${mapId.split(':').pop()}:${slotX}:${slotY}`;
      const now = Math.floor(Date.now() / 1000);
      
      const optimisticSlot: OptimisticSlot = {
        event: {
          id: '',
          pubkey: '',
          created_at: now,
          kind: 31417,
          tags: [],
          content: '',
          sig: '',
        },
        id: slotId,
        version: '1',
        worldId,
        mapId,
        slot: { x: slotX, y: slotY },
        type: 'plant', // Slot type
        crop: cropId,
        stage: 0, // Legacy field
        plantedAt: now, // Authoritative timestamp for growth
        __pending: true,
      };

      // Add optimistic slot to cache
      queryClient.setQueryData<SlotState[]>(
        ['slotstates', worldId, mapId],
        (old) => [...(old || []), optimisticSlot]
      );

      // Return context for rollback
      return { previousSlots, worldId, mapId };
    },
    onError: (error, _params, context) => {
      // Rollback on error
      if (context?.previousSlots) {
        queryClient.setQueryData(
          ['slotstates', context.worldId, context.mapId],
          context.previousSlots
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
          queryKey: ['slotstates', context.worldId, context.mapId],
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
