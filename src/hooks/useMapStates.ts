import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { parseMapState } from '@/lib/nostr/tags';
import type { MapState } from '@/lib/nostr/types';
import { DEFAULT_GAME_RELAY } from '@/lib/nostr/config';

/**
 * Query MapState events (kind 31416) for a specific world
 * 
 * Per spec: Uses discovery tag (t) for efficient relay filtering,
 * then filters by world tag for final results.
 * 
 * @param worldId - World identifier from WorldState.id (d tag)
 * @param entryMapLayout - Optional preferred layout to select (from WorldState.entryMap)
 * @returns Query result with selected MapState (or null if not found)
 */
export function useMapStates(worldId?: string, entryMapLayout?: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['mapstates', worldId, entryMapLayout],
    queryFn: async () => {
      if (!worldId) return null;

      // Query from default game relay using discovery tag
      const relay = nostr.relay(DEFAULT_GAME_RELAY);
      
      const events = await relay.query([
        {
          kinds: [31416],
          '#t': [worldId], // Discovery tag for efficient relay filtering
          limit: 50,
        },
      ]);

      // Parse and filter by world tag
      const maps: MapState[] = [];
      for (const event of events) {
        const map = parseMapState(event);
        if (map && map.worldId === worldId) {
          maps.push(map);
        }
      }

      if (maps.length === 0) return null;

      // Selection logic:
      // 1. Prefer map whose layout matches entryMapLayout (if provided)
      // 2. Otherwise, return first valid map
      if (entryMapLayout) {
        const preferred = maps.find((m) => m.layout === entryMapLayout);
        if (preferred) return preferred;
      }

      // Return first map
      return maps[0];
    },
    enabled: !!worldId,
  });
}
