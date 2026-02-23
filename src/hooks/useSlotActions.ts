import { useMutation } from '@tanstack/react-query';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { getSlotRevision } from '@/lib/nostr/tags';
import type { SlotState } from '@/lib/nostr/types';

interface HarvestSlotParams {
  worldId: string;
  mapId: string;
  slotX: number;
  slotY: number;
  currentSlotState: SlotState;
}

interface PlantSlotParams {
  worldId: string;
  mapId: string;
  slotX: number;
  slotY: number;
  cropId: string;
  currentSlotState?: SlotState;
}

interface WaterSlotParams {
  worldId: string;
  mapId: string;
  slotX: number;
  slotY: number;
  currentSlotState: SlotState;
}

interface ClearSlotParams {
  worldId: string;
  mapId: string;
  slotX: number;
  slotY: number;
  currentSlotState: SlotState;
}

/**
 * Generate a UUID v4 for client_nonce
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Hook for publishing SlotAction events (kind 14159)
 * 
 * This hook publishes player intent (harvest, plant) as immutable action events.
 * The host/authority processes these actions and updates SlotState accordingly.
 */
export function useSlotActions() {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();

  /**
   * Harvest a planted slot
   * 
   * Publishes a SlotAction (kind 14159) with action="harvest"
   */
  const harvestSlot = useMutation({
    mutationFn: async (params: HarvestSlotParams) => {
      if (!user) {
        throw new Error('User must be logged in to harvest');
      }

      const { worldId, mapId, slotX, slotY, currentSlotState } = params;

      // Validate slot state
      if (currentSlotState.type !== 'plant') {
        throw new Error('Cannot harvest: slot is not a plant');
      }

      if (!currentSlotState.crop) {
        throw new Error('Cannot harvest: slot has no crop');
      }

      // Extract map suffix from full map ID (e.g., "map:world:farm01:farm" -> "farm")
      const mapSuffix = mapId.split(':').pop() || mapId;

      // Generate slot_d value
      const slotD = `slot:${worldId}:${mapSuffix}:${slotX}:${slotY}`;

      // Get current revision
      const expectedRev = getSlotRevision(currentSlotState);

      // Generate unique client nonce
      const clientNonce = generateUUID();

      // Publish SlotAction event (Kind 14159)
      await publishEvent({
        kind: 14159,
        content: '',
        tags: [
          ['v', '1'],
          ['world', worldId],
          ['map', mapId],
          ['slot', slotX.toString(), slotY.toString()],
          ['slot_d', slotD],
          ['action', 'harvest'],
          ['expected_rev', expectedRev.toString()],
          ['client_nonce', clientNonce],
          ['t', worldId], // Discovery tag
        ],
      });

      console.log('[SlotAction] Published harvest action', {
        slotD,
        expectedRev,
        clientNonce,
        crop: currentSlotState.crop,
      });

      return { slotD, worldId, mapId, slotX, slotY, clientNonce };
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to harvest',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
    onSuccess: () => {
      toast({
        title: 'Harvest requested',
        description: 'Waiting for host to process your harvest...',
      });
    },
  });

  /**
   * Plant a seed in a slot
   * 
   * Publishes a SlotAction (kind 14159) with action="plant"
   */
  const plantSlot = useMutation({
    mutationFn: async (params: PlantSlotParams) => {
      if (!user) {
        throw new Error('User must be logged in to plant');
      }

      const { worldId, mapId, slotX, slotY, cropId, currentSlotState } = params;

      // Extract map suffix from full map ID
      const mapSuffix = mapId.split(':').pop() || mapId;

      // Generate slot_d value
      const slotD = `slot:${worldId}:${mapSuffix}:${slotX}:${slotY}`;

      // Get current revision (0 if slot doesn't exist)
      const expectedRev = currentSlotState ? getSlotRevision(currentSlotState) : 0;

      // Generate unique client nonce
      const clientNonce = generateUUID();

      // Publish SlotAction event (Kind 14159)
      await publishEvent({
        kind: 14159,
        content: '',
        tags: [
          ['v', '1'],
          ['world', worldId],
          ['map', mapId],
          ['slot', slotX.toString(), slotY.toString()],
          ['slot_d', slotD],
          ['action', 'plant'],
          ['expected_rev', expectedRev.toString()],
          ['client_nonce', clientNonce],
          ['crop', cropId],
          ['t', worldId], // Discovery tag
        ],
      });

      console.log('[SlotAction] Published plant action', {
        slotD,
        expectedRev,
        clientNonce,
        crop: cropId,
      });

      return { slotD, worldId, mapId, slotX, slotY, cropId, clientNonce };
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to plant',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
    onSuccess: () => {
      toast({
        title: 'Plant requested',
        description: 'Waiting for host to process your planting...',
      });
    },
  });

  /**
   * Water a planted slot
   * 
   * Publishes a SlotAction (kind 14159) with action="water"
   */
  const waterSlot = useMutation({
    mutationFn: async (params: WaterSlotParams) => {
      if (!user) {
        throw new Error('User must be logged in to water');
      }

      const { worldId, mapId, slotX, slotY, currentSlotState } = params;

      // Validate slot state
      if (currentSlotState.type !== 'plant') {
        throw new Error('Cannot water: slot is not a plant');
      }

      // Extract map suffix
      const mapSuffix = mapId.split(':').pop() || mapId;
      const slotD = `slot:${worldId}:${mapSuffix}:${slotX}:${slotY}`;

      // Get current revision
      const expectedRev = getSlotRevision(currentSlotState);
      const clientNonce = generateUUID();

      // Publish SlotAction event (Kind 14159)
      await publishEvent({
        kind: 14159,
        content: '',
        tags: [
          ['v', '1'],
          ['world', worldId],
          ['map', mapId],
          ['slot', slotX.toString(), slotY.toString()],
          ['slot_d', slotD],
          ['action', 'water'],
          ['expected_rev', expectedRev.toString()],
          ['client_nonce', clientNonce],
          ['t', worldId],
        ],
      });

      console.log('[SlotAction] Published water action', {
        slotD,
        expectedRev,
        clientNonce,
      });

      return { slotD, worldId, mapId, slotX, slotY, clientNonce };
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to water',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
    onSuccess: () => {
      toast({
        title: 'Watered!',
        description: 'Your plant is growing...',
      });
    },
  });

  /**
   * Clear a rotten/expired plant
   * 
   * Publishes a SlotAction (kind 14159) with action="clear"
   */
  const clearSlot = useMutation({
    mutationFn: async (params: ClearSlotParams) => {
      if (!user) {
        throw new Error('User must be logged in to clear');
      }

      const { worldId, mapId, slotX, slotY, currentSlotState } = params;

      // Validate slot state
      if (currentSlotState.type !== 'plant') {
        throw new Error('Cannot clear: slot is not a plant');
      }

      if (currentSlotState.status !== 'rotten') {
        throw new Error('Cannot clear: plant is not rotten');
      }

      // Extract map suffix
      const mapSuffix = mapId.split(':').pop() || mapId;
      const slotD = `slot:${worldId}:${mapSuffix}:${slotX}:${slotY}`;

      // Get current revision
      const expectedRev = getSlotRevision(currentSlotState);
      const clientNonce = generateUUID();

      // Publish SlotAction event (Kind 14159)
      await publishEvent({
        kind: 14159,
        content: '',
        tags: [
          ['v', '1'],
          ['world', worldId],
          ['map', mapId],
          ['slot', slotX.toString(), slotY.toString()],
          ['slot_d', slotD],
          ['action', 'clear'],
          ['expected_rev', expectedRev.toString()],
          ['client_nonce', clientNonce],
          ['t', worldId],
        ],
      });

      console.log('[SlotAction] Published clear action', {
        slotD,
        expectedRev,
        clientNonce,
      });

      return { slotD, worldId, mapId, slotX, slotY, clientNonce };
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to clear',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
    onSuccess: () => {
      toast({
        title: 'Clearing rotten plant...',
        description: 'Waiting for host to process...',
      });
    },
  });

  return {
    harvestSlot: harvestSlot.mutateAsync,
    isHarvesting: harvestSlot.isPending,
    plantSlot: plantSlot.mutateAsync,
    isPlanting: plantSlot.isPending,
    waterSlot: waterSlot.mutateAsync,
    isWatering: waterSlot.isPending,
    clearSlot: clearSlot.mutateAsync,
    isClearing: clearSlot.isPending,
  };
}

