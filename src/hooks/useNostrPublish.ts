import { useNostr } from "@nostrify/react";
import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import { useCurrentUser } from "./useCurrentUser";
import { publishToRelays, type PublishResult } from "@/lib/nostr/publish";
import { GAME_RELAYS } from "@/lib/nostr/config";

import type { NostrEvent } from "@nostrify/nostrify";

export function useNostrPublish(): UseMutationResult<NostrEvent, Error, Partial<Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>>> {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useMutation({
    mutationFn: async (t: Partial<Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>>) => {
      if (!user) {
        throw new Error("User is not logged in");
      }

      const tags = t.tags ?? [];

      // Add the client tag if it doesn't exist
      if (location.protocol === "https:" && !tags.some(([name]) => name === "client")) {
        tags.push(["client", location.hostname]);
      }

      // Sign the event once
      const event = await user.signer.signEvent({
        kind: t.kind!,
        content: t.content ?? "",
        tags,
        created_at: t.created_at ?? Math.floor(Date.now() / 1000),
      });

      // Publish to configured relays with detailed error handling
      const publishResult = await publishToRelays(nostr, event, GAME_RELAYS);

      // Store publish metadata for logging (but return event for backward compatibility)
      if (process.env.NODE_ENV === 'development') {
        console.debug('[useNostrPublish] Publish result:', {
          eventId: event.id,
          kind: event.kind,
          publishResult,
        });
      }

      return event;
    },
    onError: (error) => {
      // Enhanced error logging with relay details
      console.error("Failed to publish event:", error);
    },
    onSuccess: (event) => {
      // Log success
      console.log("Event published successfully:", {
        kind: event.kind,
        id: event.id,
      });
    },
  });
}