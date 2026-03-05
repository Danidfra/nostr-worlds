import type { CropMetadata, SlotState } from '@/lib/nostr/types';

/**
 * Default stage duration in seconds (5 minutes)
 * Used when crop metadata doesn't specify stageDurationSec
 */
const DEFAULT_STAGE_DURATION_SEC = 300;

/**
 * Expiration grace period in seconds (1 hour)
 * @deprecated This constant is no longer used. Expiration is now stage-based:
 * expires_at = watered_at + 2× stageDuration (see computeExpirationTime)
 */
export const EXPIRATION_GRACE_PERIOD_SEC = 3600;

const WET_EPSILON_SEC = 2; // ou 1

/**
 * Get the effective wet_until timestamp for a slot
 * Handles backward compatibility for slots with only watered_at
 */
export function getWetUntil(
  slot: SlotState,
  cropMeta: CropMetadata
): number {
  // If we have explicit wet_until, use it
  if (slot.wetUntil !== undefined) {
    return slot.wetUntil;
  }

  // Fallback: if we have watered_at, calculate legacy wet_until
  // Legacy model: wet for waterDurationSec (or stageDurationSec) after watering
  if (slot.wateredAt !== undefined) {
    const waterDuration = cropMeta.waterDurationSec && cropMeta.waterDurationSec > 0
      ? cropMeta.waterDurationSec
      : (cropMeta.stageDurationSec && cropMeta.stageDurationSec > 0
        ? cropMeta.stageDurationSec
        : DEFAULT_STAGE_DURATION_SEC);
    
    return slot.wateredAt + waterDuration;
  }

  // Not wet
  return 0;
}

/**
 * Check if a plant is currently "wet" (has been watered recently)
 * 
 * Wetness Model (Authoritative):
 * - A plant is wet if nowSec < wetUntil
 * - Wetness determines whether:
 *   1. Growth time progresses (dry plants pause)
 *   2. Rotting is allowed (plants only rot while dry)
 * 
 * @param slot - SlotState with plant data
 * @param nowSec - Current unix timestamp
 * @param cropMeta - Crop metadata from renderpack
 * @returns True if plant is currently wet
 */
export function isWet(
  slot: SlotState,
  nowSec: number,
  cropMeta: CropMetadata
): boolean {
  const wetUntil = getWetUntil(slot, cropMeta);
  
  // Plant is wet if current time is before wet_until (with epsilon)
  return nowSec < wetUntil + WET_EPSILON_SEC;
}

/**
 * Compute when a plant expires (becomes rotten) - WET_UNTIL MODEL
 * 
 * Expiration is now relative to when the plant becomes dry (wet_until).
 * 
 * Rule: A plant expires after 2× the stage duration AFTER it becomes dry
 * Time is counted from when wetness expires (wet_until timestamp).
 * 
 * Formula: expires_at = wet_until + 2 * stageDuration
 * 
 * Examples (stageDuration = 5 min):
 * - Plant wet until 10:00 → expires at 10:10 (2 × 5 min after becoming dry)
 * - If watered again, wet_until extends → expiration also extends
 * 
 * This matches intuitive gameplay:
 * - Plants rot after being dry for too long (2× stage duration)
 * - Wet plants cannot rot (wetness prevents rotting)
 * 
 * @param wetUntilSec - Unix timestamp until which plant remains wet
 * @param cropMeta - Crop metadata from renderpack
 * @returns Unix timestamp when plant expires
 */
export function computeExpirationTime(
  wetUntilSec: number,
  cropMeta: CropMetadata
): number {
  const stageDuration =
    cropMeta.stageDurationSec && cropMeta.stageDurationSec > 0
      ? cropMeta.stageDurationSec
      : DEFAULT_STAGE_DURATION_SEC;
  
  return wetUntilSec + (2 * stageDuration);
}

/**
 * Compute when a plant becomes ready to harvest
 * 
 * Ready time = plantedAt + (harvestStage × stageDurationSec)
 * 
 * @param plantedAtSec - Unix timestamp when plant was planted
 * @param cropMeta - Crop metadata from renderpack
 * @returns Unix timestamp when plant becomes ready, or null if no harvest stage defined
 */
export function computeReadyTime(
  plantedAtSec: number,
  cropMeta: CropMetadata
): number | null {
  const harvestStage = cropMeta.harvestStage ?? (cropMeta.stages - 1);
  const stageDuration =
    cropMeta.stageDurationSec && cropMeta.stageDurationSec > 0
      ? cropMeta.stageDurationSec
      : DEFAULT_STAGE_DURATION_SEC;
  
  return plantedAtSec + (harvestStage * stageDuration);
}

/**
 * Compute the current growth stage of a plant based on elapsed time
 * 
 * Rules:
 * 1. If stageDurationSec is missing/invalid, use DEFAULT_STAGE_DURATION_SEC (300s)
 * 2. stageIndex = floor((now - plantedAt) / stageDurationSec)
 * 3. Clamp between 0 and (cropMeta.stages - 1)
 * 4. Additionally clamp to harvestStage if it exists
 * 5. If now < plantedAt (clock skew), return 0
 * 
 * @param plantedAtSec - Unix timestamp when plant was planted
 * @param nowSec - Current unix timestamp
 * @param cropMeta - Crop metadata from renderpack
 * @returns Current stage index (0-based)
 */
export function computeGrowthStage(
  plantedAtSec: number,
  nowSec: number,
  cropMeta: CropMetadata
): number {
  // Handle clock skew - if now is before planted time, treat as stage 0
  if (nowSec < plantedAtSec) {
    return 0;
  }

  // Get stage duration (with default fallback)
  const stageDuration =
    cropMeta.stageDurationSec && cropMeta.stageDurationSec > 0
      ? cropMeta.stageDurationSec
      : DEFAULT_STAGE_DURATION_SEC;

  // Calculate elapsed time
  const elapsedSec = nowSec - plantedAtSec;

  // Calculate stage index
  const stageIndex = Math.floor(elapsedSec / stageDuration);

  // Clamp to valid stage range
  const maxStage = cropMeta.stages - 1;
  let finalStage = Math.max(0, Math.min(stageIndex, maxStage));

  // Additionally clamp to harvest stage if specified
  if (cropMeta.harvestStage !== undefined) {
    finalStage = Math.min(finalStage, cropMeta.harvestStage);
  }

  return finalStage;
}

/**
 * Compute seconds until the next growth stage (UPDATED for per-stage timing)
 * 
 * Uses stage_started_at for accurate single-stage countdown.
 * Time is measured from when THIS stage started, not from planting.
 * 
 * @param slot - SlotState with plant data
 * @param nowSec - Current unix timestamp
 * @param cropMeta - Crop metadata from renderpack
 * @returns Seconds until next stage, or null if already at max stage
 */
export function computeSecondsUntilNextStage(
  slot: SlotState,
  nowSec: number,
  cropMeta: CropMetadata
): number | null {
  // Get current stage
  const currentStage = slot.stage ?? 0;
  
  // Check if already at max stage
  const maxStage = cropMeta.harvestStage ?? (cropMeta.stages - 1);
  if (currentStage >= maxStage) {
    return null; // Already fully grown
  }

  // Get stage_started_at (use fallback chain)
  const stageStartedAt = slot.stageStartedAt ?? slot.plantedAt ?? slot.event.created_at;

  // Get stage duration
  const stageDuration =
    cropMeta.stageDurationSec && cropMeta.stageDurationSec > 0
      ? cropMeta.stageDurationSec
      : DEFAULT_STAGE_DURATION_SEC;

  // Calculate when next stage happens (from stage_started_at + stageDuration)
  const nextStageTime = stageStartedAt + stageDuration;
  const secondsRemaining = Math.max(0, nextStageTime - nowSec);

  return secondsRemaining;
}

/**
 * Compute growth stage with water-gated progression and per-stage timing
 * 
 * WETNESS MODEL: Growth only progresses while plant is wet
 * 
 * Rules:
 * 1. Plant must be WET for time to progress (dry plants pause)
 * 2. Each stage requires BOTH enough elapsed time AND enough water
 * 3. Time is measured from stage_started_at (not plantedAt)
 * 4. When water unlocks a new stage, stage_started_at resets to "now"
 * 5. A plant can advance at most 1 stage per stageDurationSec interval
 * 
 * This prevents exploits:
 * - Dry plants cannot accumulate "banked time"
 * - Leaving a plant dry for 30 minutes does NOT allow instant jumps
 * - Time only progresses while wet
 * 
 * @param slot - SlotState with plant data (needed for wetness check)
 * @param nowSec - Current unix timestamp
 * @param cropMeta - Crop metadata from renderpack
 * @returns New computed stage index (0-based)
 */
export function computeGrowthStageWithWater(
  slot: SlotState,
  nowSec: number,
  cropMeta: CropMetadata
): number {
  // Get current stage and stage_started_at from slot
  const currentStage = slot.stage ?? 0;
  const stageStartedAtSec = slot.stageStartedAt ?? slot.plantedAt ?? slot.event.created_at;

  // Handle clock skew - if now is before stage started time, stay at current stage
  if (nowSec < stageStartedAtSec) {
    return currentStage;
  }

  // CRITICAL: Growth only progresses while plant is WET
  // If plant is NOT wet → DO NOT advance stage (time pauses when dry)
  if (!isWet(slot, nowSec, cropMeta)) {
    return currentStage;
  }

  // Get stage duration (with default fallback)
  const stageDuration =
    cropMeta.stageDurationSec && cropMeta.stageDurationSec > 0
      ? cropMeta.stageDurationSec
      : DEFAULT_STAGE_DURATION_SEC;

  // Determine harvest stage (final stage)
  const harvestStage = cropMeta.harvestStage ?? (cropMeta.stages - 1);

  // Calculate elapsed time since THIS stage started
  const elapsedSec = nowSec - stageStartedAtSec;

  // Can we advance by 1 stage based on time?
  const canAdvanceByTime = elapsedSec >= stageDuration;

  // Only advance 1 stage if time allows it (and plant is wet)
  let newStage = currentStage;
  if (canAdvanceByTime) {
    newStage = Math.min(currentStage + 1, harvestStage);
  }

  return newStage;
}

/**
 * LEGACY: Compute growth stage with water-gated progression (time-based from plantedAt)
 * 
 * @deprecated This function uses plantedAt for all stage timing, which allows "banked time" exploits.
 * Use the new computeGrowthStageWithWater() with per-stage timing instead.
 * 
 * Kept for backward compatibility and migration scenarios.
 */
export function computeGrowthStageWithWaterLegacy(
  plantedAtSec: number,
  waterCount: number | undefined,
  nowSec: number,
  cropMeta: CropMetadata
): number {
  // Handle clock skew - if now is before planted time, treat as stage 0
  if (nowSec < plantedAtSec) {
    return 0;
  }

  // Get stage duration (with default fallback)
  const stageDuration =
    cropMeta.stageDurationSec && cropMeta.stageDurationSec > 0
      ? cropMeta.stageDurationSec
      : DEFAULT_STAGE_DURATION_SEC;

  // Determine harvest stage (final stage)
  const harvestStage = cropMeta.harvestStage ?? (cropMeta.stages - 1);

  // Calculate elapsed time
  const elapsedSec = nowSec - plantedAtSec;

  // Calculate stage based on time elapsed
  const stageByTime = Math.floor(elapsedSec / stageDuration);
  const stageByTimeClamped = Math.max(0, Math.min(stageByTime, harvestStage));

  // Calculate stage unlocked by water_count
  const stageUnlocked = Math.max(0, Math.min(waterCount ?? 0, harvestStage));

  // Final stage is minimum of time-based and water-unlocked
  // Time tries to advance, but water_count limits progression
  const computedStage = Math.min(stageByTimeClamped, stageUnlocked);

  return computedStage;
}

/**
 * Check if a plant needs watering (SIMPLIFIED with wetness model)
 * 
 * A plant needs water whenever:
 * - Plant is not harvestable (not at final stage)
 * - AND plant is not wet (dry)
 * 
 * Simple rule: Non-harvestable plants need water when dry.
 * 
 * @param slot - SlotState with plant data
 * @param nowSec - Current unix timestamp
 * @param cropMeta - Crop metadata from renderpack
 * @returns True if plant needs watering
 */
export function needsWater(
  slot: SlotState,
  nowSec: number,
  cropMeta: CropMetadata
): boolean {
  // Get current stage (authoritative from SlotState, or fallback to 0)
  const currentStage = slot.stage ?? 0;
  
  // Determine harvest stage (final stage)
  const harvestStage = cropMeta.harvestStage ?? (cropMeta.stages - 1);
  
  // Already at harvest stage? No need for water
  if (currentStage >= harvestStage) {
    return false;
  }

  // Needs water if plant is NOT wet (dry plants need watering)
  return !isWet(slot, nowSec, cropMeta);
}

/**
 * Check if a plant is rotten/expired (UPDATED with wetness model)
 * 
 * A plant is rotten if:
 * - It has a status tag set to 'rotten'
 * - OR it is DRY and expired (nowSec > expiresAt)
 * 
 * CRITICAL: Expiration only applies while dry
 * - Wet plants cannot rot (watering prevents rotting)
 * - Dry plants rot after expires_at
 * 
 * @param slot - SlotState with plant data
 * @param nowSec - Current unix timestamp
 * @param cropMeta - Crop metadata from renderpack
 * @returns True if plant is rotten
 */
export function isRotten(
  slot: SlotState,
  nowSec: number,
  cropMeta: CropMetadata
): boolean {
  // Already marked as rotten
  if (slot.status === 'rotten') {
    return true;
  }
  
  // No expiration time set
  if (!slot.expiresAt) {
    return false;
  }
  
  // CRITICAL: Plants only rot while DRY
  // If plant is wet → cannot rot (watering prevents rotting)
  if (isWet(slot, nowSec, cropMeta)) {
    return false;
  }
  
  // Plant is dry AND past expiration → rotten
  return nowSec > slot.expiresAt;
}

/**
 * Check if a plant is ready to harvest (NEW implementation with per-stage timing)
 * 
 * A plant is harvestable when:
 * - It has reached the harvest stage (authoritative stage from SlotState)
 * - It is not rotten/expired
 * 
 * @param slot - SlotState with plant data
 * @param nowSec - Current unix timestamp
 * @param cropMeta - Crop metadata from renderpack
 * @returns True if plant is ready to harvest
 */
export function isHarvestableSlot(
  slot: SlotState,
  nowSec: number,
  cropMeta: CropMetadata
): boolean {
  // Cannot harvest rotten plants
  if (isRotten(slot, nowSec, cropMeta)) {
    return false;
  }

  // Get current stage (authoritative from SlotState, or fallback to 0)
  const currentStage = slot.stage ?? 0;
  const harvestStage = cropMeta.harvestStage ?? (cropMeta.stages - 1);
  
  return currentStage >= harvestStage;
}

/**
 * Compute seconds until plant is ready to harvest (NEW implementation)
 * 
 * This calculates the total time remaining until the plant reaches harvest stage,
 * considering both the current stage's remaining time and all future stages.
 * 
 * @param slot - SlotState with plant data
 * @param nowSec - Current unix timestamp
 * @param cropMeta - Crop metadata from renderpack
 * @returns Seconds until ready, or null if already ready or cannot determine
 */
export function computeSecondsUntilReady(
  slot: SlotState,
  nowSec: number,
  cropMeta: CropMetadata
): number | null {
  // Get current stage (authoritative from SlotState, or fallback to 0)
  const currentStage = slot.stage ?? 0;
  const harvestStage = cropMeta.harvestStage ?? (cropMeta.stages - 1);
  
  // Already at harvest stage?
  if (currentStage >= harvestStage) {
    return null;
  }
  
  // Get stage_started_at (or fallback to plantedAt or event.created_at)
  const stageStartedAt = slot.stageStartedAt ?? slot.plantedAt ?? slot.event.created_at;
  
  // Get stage duration (with default fallback)
  const stageDuration =
    cropMeta.stageDurationSec && cropMeta.stageDurationSec > 0
      ? cropMeta.stageDurationSec
      : DEFAULT_STAGE_DURATION_SEC;
  
  // Calculate time until current stage completes
  const elapsedInCurrentStage = nowSec - stageStartedAt;
  const remainingInCurrentStage = Math.max(0, stageDuration - elapsedInCurrentStage);
  
  // Calculate how many stages remain after current stage
  const stagesRemaining = harvestStage - currentStage;
  
  // Time for remaining stages after current one completes
  const timeForFutureStages = Math.max(0, stagesRemaining - 1) * stageDuration;
  
  // Total time = current stage remaining + future stages
  return remainingInCurrentStage + timeForFutureStages;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use isHarvestableSlot instead
 */
export function isHarvestable(
  plantedAtSec: number,
  nowSec: number,
  cropMeta: CropMetadata
): boolean {
  const computedStage = computeGrowthStage(plantedAtSec, nowSec, cropMeta);
  const maxStage = cropMeta.stages - 1;
  return computedStage >= maxStage;
}
