import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { parseSlotAction, parseSlotState, getSlotRevision } from '@/lib/nostr/tags';
import type { SlotState, SlotAction, CropMetadata } from '@/lib/nostr/types';
import { EXPIRATION_GRACE_PERIOD_SEC, computeGrowthStageWithWater, isRotten } from '@/lib/game/growth';

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

          // Find slot by exact d tag match
          let currentSlot = allSlots?.find((s) => s.id === action.slotD);

          // If slot not in cache, fetch from relay using indexable #t tag
          if (!currentSlot && relayUrl) {
            console.log('[SlotActionProcessor] Slot not in cache, fetching from relay...', {
              slotD: action.slotD,
              worldId: action.worldId,
            });

            const relay = nostr.relay(relayUrl);
            
            // Query all SlotStates for this world using indexable #t tag
            const slotEvents = await relay.query([
              {
                kinds: [31417],
                '#t': [action.worldId], // Use indexable tag instead of #d
                limit: 500,
              },
            ]);

            console.log('[SlotActionProcessor] Fetched SlotStates from relay', {
              relayUrl,
              worldId: action.worldId,
              totalFetched: slotEvents.length,
            });

            // Parse all events and find the one matching slotD
            const parsedSlots: SlotState[] = [];
            
            for (const event of slotEvents) {
              const parsed = parseSlotState(event);
              if (parsed) {
                parsedSlots.push(parsed);
                
                // Find exact match by d tag
                if (parsed.id === action.slotD) {
                  currentSlot = parsed;
                }
              }
            }

            if (currentSlot) {
              console.log('[SlotActionProcessor] Found slot from relay', {
                slotD: action.slotD,
                type: currentSlot.type,
                crop: currentSlot.crop,
              });

              // Update cache with all fetched slots for this world/map
              const mapSlots = parsedSlots.filter(
                (s) => s.worldId === action.worldId && s.mapId === action.mapId
              );
              if (mapSlots.length > 0) {
                queryClient.setQueryData(
                  ['slotstates', action.worldId, action.mapId],
                  mapSlots
                );
                console.log('[SlotActionProcessor] Updated cache with fetched slots', {
                  worldId: action.worldId,
                  mapId: action.mapId,
                  count: mapSlots.length,
                });
              }
            } else {
              console.warn('[SlotActionProcessor] SlotState not found on relay', {
                slotD: action.slotD,
                worldId: action.worldId,
                totalSlotsFetched: parsedSlots.length,
              });
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
              canRetry: validationResult.canRetry,
            });
            // Only mark as processed if it's not a retryable error
            // Retryable errors (like relay propagation delays) should be retried later
            if (!validationResult.canRetry) {
              processedActionsRef.current.add(actionKey);
            }
            continue;
          }

          console.log('[SlotActionProcessor] Valid action, applying...', {
            action: action.action,
            slotD: action.slotD,
            currentRev: currentSlot ? getSlotRevision(currentSlot) : 0,
          });

          // Apply action by publishing new SlotState to the same relay
          await applyAction(action, currentSlot, nostr, relayUrl, user);

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
  }, [actions, user, relayUrl, queryClient, nostr]);

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
): { valid: boolean; reason?: string; canRetry?: boolean } {
  if (action.action === 'harvest') {
    // Harvest validation
    if (!currentSlot) {
      return { 
        valid: false, 
        reason: 'SlotState not found on relay',
        canRetry: true // Don't mark as processed, allow retry in case of relay propagation delay
      };
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

  if (action.action === 'water') {
    // Water validation
    if (!currentSlot) {
      return {
        valid: false,
        reason: 'SlotState not found on relay',
        canRetry: true,
      };
    }

    if (currentSlot.type !== 'plant') {
      return { valid: false, reason: 'Slot is not a plant' };
    }

    if (!currentSlot.crop) {
      return { valid: false, reason: 'Slot has no crop' };
    }

    // Cannot water rotten plants
    if (currentSlot.status === 'rotten') {
      return { valid: false, reason: 'Cannot water rotten plant' };
    }

    // Validate expected_rev
    const currentRev = getSlotRevision(currentSlot);
    if (action.expectedRev !== currentRev) {
      return {
        valid: false,
        reason: `Revision mismatch: expected ${action.expectedRev}, got ${currentRev}`,
      };
    }

    return { valid: true };
  }

  if (action.action === 'clear') {
    // Clear validation
    if (!currentSlot) {
      return {
        valid: false,
        reason: 'SlotState not found on relay',
        canRetry: true,
      };
    }

    if (currentSlot.type !== 'plant') {
      return { valid: false, reason: 'Slot is not a plant' };
    }

    // Can only clear rotten plants
    if (currentSlot.status !== 'rotten') {
      return { valid: false, reason: 'Can only clear rotten plants' };
    }

    // Validate expected_rev
    const currentRev = getSlotRevision(currentSlot);
    if (action.expectedRev !== currentRev) {
      return {
        valid: false,
        reason: `Revision mismatch: expected ${action.expectedRev}, got ${currentRev}`,
      };
    }

    return { valid: true };
  }

  return { valid: false, reason: `Unknown action type: ${action.action}` };
}

/**
 * Apply a validated action by publishing updated SlotState
 * 
 * Publishes SlotState using canonical "slot:" format in d tag.
 * SlotState is addressable/replaceable, so this replaces any previous state for the same slot.
 */
async function applyAction(
  action: SlotAction,
  currentSlot: SlotState | undefined,
  nostr: ReturnType<typeof useNostr>['nostr'],
  relayUrl: string,
  user: NonNullable<ReturnType<typeof useCurrentUser>['user']>
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  console.log('[SlotActionProcessor] Publishing SlotState to relay', {
    relayUrl,
    action: action.action,
    slotD: action.slotD,
  });

  const relay = nostr.relay(relayUrl);

  if (action.action === 'harvest') {
    // Harvest: Convert plant slot to empty slot
    const event = await user.signer.signEvent({
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
      created_at: now,
    });

    await relay.event(event);

    console.log('[SlotActionProcessor] Published empty SlotState after harvest', {
      slotD: action.slotD,
      relayUrl,
      eventId: event.id,
    });
  } else if (action.action === 'plant') {
    // Plant: Create or update to plant slot
    if (!action.crop) {
      throw new Error('Missing crop for plant action');
    }

    const event = await user.signer.signEvent({
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
      created_at: now,
    });

    await relay.event(event);

    console.log('[SlotActionProcessor] Published plant SlotState', {
      slotD: action.slotD,
      crop: action.crop,
      relayUrl,
      eventId: event.id,
    });
  } else if (action.action === 'water') {
    // Water: Update wateredAt timestamp
    if (!currentSlot || currentSlot.type !== 'plant' || !currentSlot.crop) {
      throw new Error('Cannot water non-plant slot');
    }

    // Build tags for watered plant
    const tags: string[][] = [
      ['d', action.slotD],
      ['v', '1'],
      ['world', action.worldId],
      ['map', action.mapId],
      ['slot', action.slot.x.toString(), action.slot.y.toString()],
      ['type', 'plant'],
      ['crop', currentSlot.crop],
      ['stage', '0'], // Legacy
      ['planted_at', currentSlot.plantedAt?.toString() ?? now.toString()],
      ['watered_at', now.toString()], // Update water timestamp
      ['status', currentSlot.status ?? 'healthy'],
      ['t', action.worldId],
    ];

    // Preserve existing ready_at and expires_at if present
    if (currentSlot.readyAt) {
      tags.push(['ready_at', currentSlot.readyAt.toString()]);
    }
    if (currentSlot.expiresAt) {
      tags.push(['expires_at', currentSlot.expiresAt.toString()]);
    }

    const event = await user.signer.signEvent({
      kind: 31417,
      content: '',
      tags,
      created_at: now,
    });

    await relay.event(event);

    console.log('[SlotActionProcessor] Published watered SlotState', {
      slotD: action.slotD,
      wateredAt: now,
      relayUrl,
      eventId: event.id,
    });
  } else if (action.action === 'clear') {
    // Clear: Convert rotten plant to empty slot
    const event = await user.signer.signEvent({
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
      created_at: now,
    });

    await relay.event(event);

    console.log('[SlotActionProcessor] Published empty SlotState after clear', {
      slotD: action.slotD,
      relayUrl,
      eventId: event.id,
    });
  }
}
