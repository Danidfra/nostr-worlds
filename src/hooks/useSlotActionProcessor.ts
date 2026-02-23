import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { parseSlotAction, parseSlotState, getSlotRevision } from '@/lib/nostr/tags';
import type { SlotState, SlotAction } from '@/lib/nostr/types';

/**
 * Hook for processing SlotAction events as a host/authority
 * 
 * This hook:
 * 1. Subscribes to SlotAction events (kind 14159)
 * 2. Deduplicates actions using (pubkey + client_nonce + slot_d + action)
 * 3. Validates expected_rev against current SlotState
 * 4. Validates action vs current SlotState
 * 5. Publishes updated SlotState (31417) for valid actions
 * 
 * @param worldId - World identifier to filter actions
 * @param relayUrl - Relay URL to use for querying actions and publishing states
 * @param enabled - Whether to enable the processor
 */
export function useSlotActionProcessor(worldId?: string, relayUrl?: string, enabled: boolean = true) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  
  // Track processed actions to prevent duplicates
  const processedActionsRef = useRef<Set<string>>(new Set());

  /**
   * Query SlotAction events
   */
  const { data: actions = [] } = useQuery({
    queryKey: ['slotactions', worldId, relayUrl],
    queryFn: async () => {
      if (!worldId || !relayUrl) return [];

      const relay = nostr.relay(relayUrl);
      
      const events = await relay.query([
        {
          kinds: [14159],
          '#t': [worldId],
          limit: 1000,
        },
      ]);

      // Parse and validate actions
      const parsedActions: SlotAction[] = [];
      for (const event of events) {
        const action = parseSlotAction(event);
        if (action) {
          parsedActions.push(action);
        }
      }

      console.log(`[SlotActionProcessor] Fetched ${parsedActions.length} actions for world ${worldId} from ${relayUrl}`);
      return parsedActions;
    },
    enabled: enabled && !!worldId && !!relayUrl && !!user,
    refetchInterval: 5000, // Poll every 5 seconds
  });

  /**
   * Process actions and apply to SlotState
   */
  useEffect(() => {
    if (!actions.length || !user || !relayUrl) return;

    const processActions = async () => {
      for (const action of actions) {
        // Create unique key for deduplication
        const actionKey = `${action.event.pubkey}:${action.clientNonce}:${action.slotD}:${action.action}`;

        // Skip if already processed
        if (processedActionsRef.current.has(actionKey)) {
          continue;
        }

        console.log('[SlotActionProcessor] Processing action', {
          action: action.action,
          slotD: action.slotD,
          pubkey: action.event.pubkey.substring(0, 8),
          clientNonce: action.clientNonce,
          expectedRev: action.expectedRev,
        });

        try {
          // Get current slot state from cache first
          const allSlots = queryClient.getQueryData<SlotState[]>([
            'slotstates',
            action.worldId,
            action.mapId,
          ]);

          let currentSlot = allSlots?.find((s) => s.id === action.slotD);

          // If slot not in cache, fetch from relay
          if (!currentSlot && relayUrl) {
            console.log('[SlotActionProcessor] Slot not in cache, fetching from relay...', {
              slotD: action.slotD,
            });

            const relay = nostr.relay(relayUrl);
            const slotEvents = await relay.query([
              {
                kinds: [31417],
                '#d': [action.slotD],
                limit: 1,
              },
            ]);

            if (slotEvents.length > 0) {
              const parsedSlot = parseSlotState(slotEvents[0]);
              if (parsedSlot) {
                currentSlot = parsedSlot;
                console.log('[SlotActionProcessor] Fetched slot from relay', {
                  slotD: action.slotD,
                  type: currentSlot.type,
                });
              }
            }
          }

          // Validate action
          const validationResult = validateAction(action, currentSlot);
          
          if (!validationResult.valid) {
            console.warn('[SlotActionProcessor] Invalid action', {
              reason: validationResult.reason,
              action: action.action,
              slotD: action.slotD,
              expectedRev: action.expectedRev,
              currentRev: currentSlot ? getSlotRevision(currentSlot) : 'undefined',
            });
            // Only mark as processed if it's truly invalid (not a cache miss issue)
            // If slot doesn't exist and action is plant with rev=0, it's valid
            if (validationResult.reason !== 'Slot not loaded yet') {
              processedActionsRef.current.add(actionKey);
            }
            continue;
          }

          console.log('[SlotActionProcessor] Valid action, applying...', {
            action: action.action,
            slotD: action.slotD,
            currentRev: currentSlot ? getSlotRevision(currentSlot) : 0,
          });

          // Apply action by publishing new SlotState
          await applyAction(action, currentSlot, publishEvent);

          // Mark as processed
          processedActionsRef.current.add(actionKey);

          console.log('[SlotActionProcessor] Action applied successfully', {
            action: action.action,
            slotD: action.slotD,
          });

          // Invalidate slot states to refetch
          queryClient.invalidateQueries({
            queryKey: ['slotstates', action.worldId, action.mapId],
          });
        } catch (error) {
          console.error('[SlotActionProcessor] Error processing action', error);
          // Don't mark as processed so it can be retried
        }
      }
    };

    processActions();
  }, [actions, user, relayUrl, queryClient, publishEvent, nostr]);

  return {
    actionsProcessed: processedActionsRef.current.size,
  };
}

/**
 * Validate a SlotAction against current SlotState
 */
function validateAction(
  action: SlotAction,
  currentSlot?: SlotState
): { valid: boolean; reason?: string } {
  if (action.action === 'harvest') {
    // Harvest validation
    if (!currentSlot) {
      return { valid: false, reason: 'Slot does not exist' };
    }

    if (currentSlot.type !== 'plant') {
      return { valid: false, reason: 'Slot is not a plant' };
    }

    if (!currentSlot.crop) {
      return { valid: false, reason: 'Slot has no crop' };
    }

    // Validate expected_rev
    const currentRev = getSlotRevision(currentSlot);
    if (action.expectedRev !== currentRev) {
      return {
        valid: false,
        reason: `Revision mismatch: expected ${action.expectedRev}, got ${currentRev}`,
      };
    }

    // TODO: Validate crop is harvestable (requires crop metadata)

    return { valid: true };
  }

  if (action.action === 'plant') {
    // Plant validation
    if (!action.crop) {
      return { valid: false, reason: 'Missing crop identifier' };
    }

    // If slot exists, validate expected_rev
    if (currentSlot) {
      const currentRev = getSlotRevision(currentSlot);
      if (action.expectedRev !== currentRev) {
        return {
          valid: false,
          reason: `Revision mismatch: expected ${action.expectedRev}, got ${currentRev}`,
        };
      }

      // Slot must be empty to plant
      if (currentSlot.type !== 'empty') {
        return { valid: false, reason: 'Slot is not empty' };
      }
    } else {
      // New slot, expected_rev should be 0
      if (action.expectedRev !== 0) {
        return {
          valid: false,
          reason: `New slot must have expected_rev=0, got ${action.expectedRev}`,
        };
      }
    }

    return { valid: true };
  }

  return { valid: false, reason: `Unknown action type: ${action.action}` };
}

/**
 * Apply a validated action by publishing updated SlotState
 */
async function applyAction(
  action: SlotAction,
  currentSlot: SlotState | undefined,
  publishEvent: (event: { kind: number; content: string; tags: string[][] }) => Promise<unknown>
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  if (action.action === 'harvest') {
    // Harvest: Convert plant slot to empty slot
    await publishEvent({
      kind: 31417,
      content: '',
      tags: [
        ['d', action.slotD],
        ['v', '1'],
        ['world', action.worldId],
        ['map', action.mapId],
        ['slot', action.slot.x.toString(), action.slot.y.toString()],
        ['type', 'empty'],
        ['status', 'empty'],
        ['last_harvested_at', now.toString()],
        ['t', action.worldId],
      ],
    });

    console.log('[SlotActionProcessor] Published empty SlotState after harvest', {
      slotD: action.slotD,
    });
  } else if (action.action === 'plant') {
    // Plant: Create or update to plant slot
    if (!action.crop) {
      throw new Error('Missing crop for plant action');
    }

    await publishEvent({
      kind: 31417,
      content: '',
      tags: [
        ['d', action.slotD],
        ['v', '1'],
        ['world', action.worldId],
        ['map', action.mapId],
        ['slot', action.slot.x.toString(), action.slot.y.toString()],
        ['type', 'plant'],
        ['crop', action.crop],
        ['stage', '0'],
        ['planted_at', now.toString()],
        ['t', action.worldId],
      ],
    });

    console.log('[SlotActionProcessor] Published plant SlotState', {
      slotD: action.slotD,
      crop: action.crop,
    });
  }
}
