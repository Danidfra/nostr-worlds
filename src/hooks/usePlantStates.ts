import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { parsePlantState } from '@/lib/nostr/tags';
import type { PlantState } from '@/lib/nostr/types';
import { DEFAULT_GAME_RELAY } from '@/lib/nostr/config';

/**
 * Query PlantState events (kind 31417) for a specific world and map
 * 
 * Per spec: Uses discovery tag (t) for efficient relay filtering,
 * then filters by world and map tags for final results.
 * 
 * @param worldId - World identifier
 * @param mapId - Map identifier (d tag from MapState)
 * @returns Query result with PlantState array
 */
export function usePlantStates(worldId?: string, mapId?: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['plantstates', worldId, mapId],
    queryFn: async () => {
      if (!worldId || !mapId) return [];

      // Query from default game relay using discovery tag
      const relay = nostr.relay(DEFAULT_GAME_RELAY);
      
      const events = await relay.query([
        {
          kinds: [31417],
          '#t': [worldId], // Discovery tag for efficient relay filtering
          limit: 500, // Allow for larger farms
        },
      ]);

      // Parse and filter by world and map
      const plants: PlantState[] = [];
      for (const event of events) {
        const plant = parsePlantState(event);
        if (plant && plant.worldId === worldId && plant.mapId === mapId) {
          plants.push(plant);
        }
      }

      return plants;
    },
    enabled: !!worldId && !!mapId,
  });
}
