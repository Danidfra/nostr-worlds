import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { parseSlotState } from '@/lib/nostr/tags';
import type { SlotState } from '@/lib/nostr/types';
import { DEFAULT_GAME_RELAY } from '@/lib/nostr/config';

/**
 * Query SlotState events (kind 31417) for a specific world and map
 * 
 * Per spec: Uses discovery tag (t) for efficient relay filtering,
 * then filters by world and map tags for final results.
 * 
 * @param worldId - World identifier
 * @param mapId - Map identifier (d tag from MapState)
 * @returns Query result with SlotState array
 */
export function useSlotStates(worldId?: string, mapId?: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['slotstates', worldId, mapId],
    queryFn: async () => {
      if (!worldId || !mapId) return [];

      // Query from default game relay using discovery tag
      const relay = nostr.relay(DEFAULT_GAME_RELAY);
      
      const events = await relay.query([
        {
          kinds: [31417],
          '#t': [worldId], // Discovery tag for efficient relay filtering
          limit: 500, // Allow for large grids
        },
      ]);

      // Parse and filter by world and map
      const slots: SlotState[] = [];
      let parsedCount = 0;
      let filteredCount = 0;

      for (const event of events) {
        const slot = parseSlotState(event);
        if (slot) {
          parsedCount++;
          if (slot.worldId === worldId && slot.mapId === mapId) {
            slots.push(slot);
            filteredCount++;
          }
        }
      }

      // Debug logging
      console.debug(
        `[useSlotStates] Fetched: ${events.length}, Parsed: ${parsedCount}, Matched: ${filteredCount}`,
        { worldId, mapId }
      );

      return slots;
    },
    enabled: !!worldId && !!mapId,
  });
}
