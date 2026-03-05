import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { parseSlotAction, parseSlotState, getSlotRevision } from '@/lib/nostr/tags';
import type { SlotState, SlotAction, CropsMetadata } from '@/lib/nostr/types';
import type { NostrEvent } from '@nostrify/nostrify';
import { isRotten, computeReadyTime, computeExpirationTime, isHarvestableSlot, computeGrowthStageWithWater, isWet, getWetUntil } from '@/lib/game/growth';

/** Default stage duration in seconds (5 minutes) */
const DEFAULT_STAGE_DURATION_SEC = 300;

/**
 * Deduplicate SlotState events by d tag, keeping only the latest event per slot
 * 
 * Relays may return multiple historical events for the same slot.
 * We must keep only the newest (highest created_at) to avoid re-processing old states.
 * 
 * @param events - Array of Nostr events (kind 31417)
 * @returns Deduplicated array with one event per d tag
 */
function deduplicateSlotStateEvents(events: NostrEvent[]): NostrEvent[] {
  const slotMap = new Map<string, NostrEvent>();
  
  for (const event of events) {
    const dTag = event.tags.find(([name]) => name === 'd')?.[1];
    if (!dTag) continue;
    
    const existing = slotMap.get(dTag);
    if (!existing || event.created_at > existing.created_at) {
      slotMap.set(dTag, event);
    }
  }
  
  return Array.from(slotMap.values());
}

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
 * @param cropsMetadata - Crop metadata for computing ready_at and expires_at
 * @param enabled - Whether to enable the processor
 */
export function useSlotActionProcessor(
  worldId?: string,
  relayUrl?: string,
  cropsMetadata?: CropsMetadata | null,
  enabled: boolean = true
) {
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
   * Query SlotStates to check for expiration
   */
  const { data: slotStates = [] } = useQuery({
    queryKey: ['slotstates-expiration-check', worldId, relayUrl],
    queryFn: async () => {
      if (!worldId || !relayUrl) return [];

      const relay = nostr.relay(relayUrl);
      
      const events = await relay.query([
        {
          kinds: [31417],
          '#t': [worldId],
          limit: 500,
        },
      ]);

      // Deduplicate events by d tag (keep only latest per slot)
      const dedupedEvents = deduplicateSlotStateEvents(events);

      // Parse slot states
      const parsedSlots: SlotState[] = [];
      for (const event of dedupedEvents) {
        const slot = parseSlotState(event);
        if (slot && slot.type === 'plant') {
          parsedSlots.push(slot);
        }
      }

      return parsedSlots;
    },
    enabled: enabled && !!worldId && !!relayUrl && !!user,
    refetchInterval: 30000, // Check every 30 seconds
  });

  /**
   * Check for expired plants, mark them as rotten, and advance growth stages
   */
  useEffect(() => {
    if (!slotStates.length || !user || !relayUrl || !cropsMetadata) return;

    const checkExpirationAndGrowth = async () => {
      const now = Math.floor(Date.now() / 1000);

      for (const slot of slotStates) {
        // Skip if already rotten
        if (slot.status === 'rotten') continue;

        // Get crop metadata for rotting check
        if (!slot.crop) continue;
        const slotCropMeta = cropsMetadata.crops?.[slot.crop];
        if (!slotCropMeta) continue;

        // Check if expired
        if (isRotten(slot, now, slotCropMeta)) {
          console.log('[SlotActionProcessor] Plant expired, marking as rotten', {
            slotD: slot.id,
            expiresAt: slot.expiresAt,
            now,
          });

          try {
            const relay = nostr.relay(relayUrl);

            // Publish updated SlotState with rotten status
            const tags: string[][] = [
              ['d', slot.id],
              ['v', '1'],
              ['world', slot.worldId],
              ['map', slot.mapId],
              ['slot', slot.slot.x.toString(), slot.slot.y.toString()],
              ['type', 'plant'],
              ['crop', slot.crop!],
              ['stage', (slot.stage ?? 0).toString()],
              ['stage_started_at', (slot.stageStartedAt ?? slot.plantedAt ?? now).toString()],
              ['planted_at', slot.plantedAt?.toString() ?? now.toString()],
              ['status', 'rotten'],
              ['t', slot.worldId],
            ];

            // Preserve existing timestamps
            if (slot.wateredAt) {
              tags.push(['watered_at', slot.wateredAt.toString()]);
            }
            if (slot.wetUntil) {
              tags.push(['wet_until', slot.wetUntil.toString()]);
            }
            if (slot.waterCount) {
              tags.push(['water_count', slot.waterCount.toString()]);
            }
            if (slot.readyAt) {
              tags.push(['ready_at', slot.readyAt.toString()]);
            }
            if (slot.expiresAt) {
              tags.push(['expires_at', slot.expiresAt.toString()]);
            }

            const event = await user.signer.signEvent({
              kind: 31417,
              content: '',
              tags,
              created_at: now,
            });

            await relay.event(event);

            console.log('[SlotActionProcessor] Published rotten SlotState', {
              slotD: slot.id,
              relayUrl,
              eventId: event.id,
            });

            // Invalidate slot states to refetch
            queryClient.invalidateQueries({
              queryKey: ['slotstates', slot.worldId, slot.mapId],
            });
            queryClient.invalidateQueries({
              queryKey: ['slotstates-expiration-check', worldId, relayUrl],
            });
          } catch (error) {
            console.error('[SlotActionProcessor] Error marking plant as rotten', error);
          }
          continue; // Skip growth check for rotten plants
        }

        // Check if plant can advance to next stage
        if (!slot.crop) continue;
        const cropMeta = cropsMetadata.crops?.[slot.crop];
        if (!cropMeta) continue;

        const currentStage = slot.stage ?? 0;

        // Use the new computeGrowthStageWithWater function (wetness model)
        const newStage = computeGrowthStageWithWater(slot, now, cropMeta);

        // If stage advanced, publish updated SlotState
        if (newStage > currentStage) {
          console.log('[SlotActionProcessor] Plant advanced to next stage', {
            slotD: slot.id,
            currentStage,
            newStage,
            now,
          });

          try {
            const relay = nostr.relay(relayUrl);

            // Build tags for advanced plant
            const tags: string[][] = [
              ['d', slot.id],
              ['v', '1'],
              ['world', slot.worldId],
              ['map', slot.mapId],
              ['slot', slot.slot.x.toString(), slot.slot.y.toString()],
              ['type', 'plant'],
              ['crop', slot.crop],
              ['stage', newStage.toString()], // AUTHORITATIVE: New stage
              ['stage_started_at', now.toString()], // NEW: Reset stage timer
              ['planted_at', slot.plantedAt?.toString() ?? now.toString()],
              ['water_count', (slot.waterCount ?? 0).toString()],
              ['status', slot.status ?? 'healthy'],
              ['t', slot.worldId],
            ];

            // Preserve existing timestamps
            if (slot.wateredAt) {
              tags.push(['watered_at', slot.wateredAt.toString()]);
            }
            if (slot.wetUntil) {
              tags.push(['wet_until', slot.wetUntil.toString()]);
            }
            if (slot.readyAt) {
              tags.push(['ready_at', slot.readyAt.toString()]);
            }
            if (slot.expiresAt) {
              tags.push(['expires_at', slot.expiresAt.toString()]);
            }

            const event = await user.signer.signEvent({
              kind: 31417,
              content: '',
              tags,
              created_at: now,
            });

            await relay.event(event);

            console.log('[SlotActionProcessor] Published advanced SlotState', {
              slotD: slot.id,
              newStage,
              relayUrl,
              eventId: event.id,
            });

            // Invalidate slot states to refetch
            queryClient.invalidateQueries({
              queryKey: ['slotstates', slot.worldId, slot.mapId],
            });
            queryClient.invalidateQueries({
              queryKey: ['slotstates-expiration-check', worldId, relayUrl],
            });
          } catch (error) {
            console.error('[SlotActionProcessor] Error advancing plant stage', error);
          }
        }
      }
    };

    checkExpirationAndGrowth();
  }, [slotStates, user, relayUrl, queryClient, nostr, worldId, cropsMetadata]);

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

            // Deduplicate events by d tag (keep only latest per slot)
            const dedupedEvents = deduplicateSlotStateEvents(slotEvents);

            console.log('[SlotActionProcessor] Deduplicated SlotStates', {
              before: slotEvents.length,
              after: dedupedEvents.length,
            });

            // Parse all events and find the one matching slotD
            const parsedSlots: SlotState[] = [];
            
            for (const event of dedupedEvents) {
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
          const validationResult = validateAction(action, currentSlot, cropsMetadata);
          
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
          await applyAction(action, currentSlot, nostr, relayUrl, user, cropsMetadata);

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
  }, [actions, user, relayUrl, queryClient, nostr, cropsMetadata]);

  return {
    actionsProcessed: processedActionsRef.current.size,
  };
}

/**
 * Validate a SlotAction against current SlotState
 */
function validateAction(
  action: SlotAction,
  currentSlot?: SlotState,
  cropsMetadata?: CropsMetadata | null
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

    // Validate crop is harvestable (requires crop metadata)
    if (cropsMetadata?.crops?.[currentSlot.crop]) {
      const cropMeta = cropsMetadata.crops[currentSlot.crop];
      const now = Math.floor(Date.now() / 1000);
      const harvestable = isHarvestableSlot(currentSlot, now, cropMeta);
      
      if (!harvestable) {
        return { 
          valid: false, 
          reason: 'Crop is not ready to harvest (not at final stage or is rotten)' 
        };
      }
    }

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
  user: NonNullable<ReturnType<typeof useCurrentUser>['user']>,
  cropsMetadata?: CropsMetadata | null
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

    // Build base tags - FRESHLY PLANTED CROPS START DRY
    const tags: string[][] = [
      ['d', action.slotD],
      ['v', '1'],
      ['world', action.worldId],
      ['map', action.mapId],
      ['slot', action.slot.x.toString(), action.slot.y.toString()],
      ['type', 'plant'],
      ['crop', action.crop],
      ['stage', '0'], // AUTHORITATIVE: Start at stage 0
      ['stage_started_at', now.toString()], // Per-stage timing reference
      ['planted_at', now.toString()],
      // CRITICAL: Do NOT set watered_at (plant starts DRY, needs watering to begin growth)
      ['water_count', '0'], // Initialize water count to 0
      ['status', 'healthy'],
      ['t', action.worldId],
    ];

    // Compute ready_at if crop metadata available
    const cropMeta = cropsMetadata?.crops?.[action.crop];
    if (cropMeta) {
      const readyAt = computeReadyTime(now, cropMeta);
      if (readyAt) {
        tags.push(['ready_at', readyAt.toString()]);
      }
      
      // CRITICAL: Do NOT set expires_at at plant time
      // Expiration is relative to watering (expires_at = watered_at + 2× stageDuration)
      // Plant starts dry, so no expiration until first watering

      console.log('[SlotActionProcessor] Planted crop (starts DRY)', {
        crop: action.crop,
        plantedAt: now,
        wateredAt: 'NOT SET (dry)',
        readyAt,
        needsWatering: true,
      });
    }

    const event = await user.signer.signEvent({
      kind: 31417,
      content: '',
      tags,
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
    // Water: Update wateredAt timestamp and increment water_count
    if (!currentSlot || currentSlot.type !== 'plant' || !currentSlot.crop) {
      throw new Error('Cannot water non-plant slot');
    }

    // Increment water count
    const waterCount = (currentSlot.waterCount ?? 0) + 1;

    // Get current stage and stage_started_at
    const currentStage = currentSlot.stage ?? 0;
    const currentStageStartedAt = currentSlot.stageStartedAt ?? currentSlot.plantedAt ?? now;

    // Get crop metadata to check if plant was dry before watering
    const cropMeta = cropsMetadata?.crops?.[currentSlot.crop];
    
    // Determine if stage_started_at should be reset
    // RULE: Only reset stage timer if plant was DRY before watering
    // If already wet, watering again should NOT reset the stage timer
    let newStageStartedAt = currentStageStartedAt;
    let wasDry = false;
    let newWetUntil = now;
    
    if (cropMeta) {
      // Check if plant was dry before this watering
      wasDry = !isWet(currentSlot, now, cropMeta);
      
      if (wasDry) {
        // Plant was dry → start the wet growth window
        newStageStartedAt = now;
        console.log('[SlotActionProcessor] Plant was dry, starting wet growth window', {
          slotD: action.slotD,
          currentStage,
          waterCount,
          stageStartedAt: newStageStartedAt,
        });
      } else {
        // Plant was already wet → keep existing stage timer
        console.log('[SlotActionProcessor] Plant was already wet, keeping stage timer', {
          slotD: action.slotD,
          currentStage,
          waterCount,
          stageStartedAt: currentStageStartedAt,
        });
      }

      // Calculate new wet_until
      // newWetUntil = max(currentWetUntil, now) + waterDurationSec
      const currentWetUntil = getWetUntil(currentSlot, cropMeta);
      
      const waterDuration = cropMeta.waterDurationSec && cropMeta.waterDurationSec > 0
        ? cropMeta.waterDurationSec
        : (cropMeta.stageDurationSec ?? DEFAULT_STAGE_DURATION_SEC);
      
      newWetUntil = Math.max(currentWetUntil, now) + waterDuration;

      // Apply optional safety cap
      if (cropMeta.maxWetBufferSec && cropMeta.maxWetBufferSec > 0) {
        newWetUntil = Math.min(newWetUntil, now + cropMeta.maxWetBufferSec);
      }
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
      ['stage', currentStage.toString()], // AUTHORITATIVE: Preserve current stage
      ['stage_started_at', newStageStartedAt.toString()], // NEW: Reset if water-blocked
      ['planted_at', currentSlot.plantedAt?.toString() ?? now.toString()],
      ['watered_at', now.toString()], // ALWAYS update water timestamp (Legacy compatibility)
      ['wet_until', newWetUntil.toString()], // NEW: Wetness model
      ['water_count', waterCount.toString()],
      ['status', currentSlot.status ?? 'healthy'],
      ['t', action.worldId],
    ];

    // Preserve existing ready_at
    if (currentSlot.readyAt) {
      tags.push(['ready_at', currentSlot.readyAt.toString()]);
    }
    
    // NEW EXPIRATION MODEL: ALWAYS refresh expires_at on water
    // Expiration is wet_until-based: wet_until + 2× stageDuration
    if (cropMeta) {
      const expiresAt = computeExpirationTime(newWetUntil, cropMeta);
      tags.push(['expires_at', expiresAt.toString()]);
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
      wetUntil: newWetUntil,
      waterCount,
      stage: currentStage,
      stageStartedAt: newStageStartedAt,
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
