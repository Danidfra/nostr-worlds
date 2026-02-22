import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { parseWorldState } from '@/lib/nostr/tags';
import type { WorldState } from '@/lib/nostr/types';
import { DEFAULT_GAME_RELAY } from '@/lib/nostr/config';

/**
 * Query WorldState events (kind 31415) for a specific author
 * 
 * @param pubkey - Author's public key (optional, returns empty array if not provided)
 * @returns Query result with WorldState array
 */
export function useWorldStates(pubkey?: string) {
  const { nostr } = useNostr();

  return useQuery({
    queryKey: ['worldstates', pubkey],
    queryFn: async () => {
      if (!pubkey) return [];

      // Query from default game relay
      const relay = nostr.relay(DEFAULT_GAME_RELAY);
      
      const events = await relay.query([
        {
          kinds: [31415],
          authors: [pubkey],
          limit: 100,
        },
      ]);

      // Parse and filter valid events
      const worlds: WorldState[] = [];
      for (const event of events) {
        const world = parseWorldState(event);
        if (world) {
          worlds.push(world);
        }
      }

      // Sort by created_at descending (newest first)
      worlds.sort((a, b) => b.event.created_at - a.event.created_at);

      return worlds;
    },
    enabled: !!pubkey,
  });
}
