import type { CropMetadata, SlotState } from '@/lib/nostr/types';

/**
 * Default stage duration in seconds (5 minutes)
 * Used when crop metadata doesn't specify stageDurationSec
 */
const DEFAULT_STAGE_DURATION_SEC = 300;

/**
 * Expiration grace period in seconds (1 hour)
 * Time after reaching harvest stage before plant becomes rotten
 * @deprecated Use computeExpirationTime() instead for dynamic expiration
 */
export const EXPIRATION_GRACE_PERIOD_SEC = 3600;

/**
 * Compute when a plant expires (becomes rotten)
 * 
 * Expiration time = readyAt + total growth time
 * This means crops expire 2× their growth time from planting.
 * 
 * Examples:
 * - 5 min grow → ready at 5 min → expires at 10 min
 * - 30 min grow → ready at 30 min → expires at 60 min
 * 
 * @param plantedAtSec - Unix timestamp when plant was planted
 * @param readyAtSec - Unix timestamp when plant became ready to harvest
 * @returns Unix timestamp when plant expires
 */
export function computeExpirationTime(
  plantedAtSec: number,
  readyAtSec: number
): number {
  const totalGrowthTime = readyAtSec - plantedAtSec;
  return readyAtSec + totalGrowthTime;
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
 * Compute seconds until the next growth stage
 * 
 * @param plantedAtSec - Unix timestamp when plant was planted
 * @param nowSec - Current unix timestamp
 * @param cropMeta - Crop metadata from renderpack
 * @param currentStage - Current computed stage
 * @returns Seconds until next stage, or null if already at max stage
 */
export function computeSecondsUntilNextStage(
  plantedAtSec: number,
  nowSec: number,
  cropMeta: CropMetadata,
  currentStage: number
): number | null {
  // Check if already at max stage
  const maxStage = cropMeta.harvestStage ?? (cropMeta.stages - 1);
  if (currentStage >= maxStage) {
    return null; // Already fully grown
  }

  // Get stage duration
  const stageDuration =
    cropMeta.stageDurationSec && cropMeta.stageDurationSec > 0
      ? cropMeta.stageDurationSec
      : DEFAULT_STAGE_DURATION_SEC;

  // Calculate when next stage happens
  const nextStageTime = plantedAtSec + (currentStage + 1) * stageDuration;
  const secondsRemaining = Math.max(0, nextStageTime - nowSec);

  return secondsRemaining;
}

/**
 * Compute growth stage with water-gated progression
 * 
 * Water-gated stages model:
 * - Time advances stages based on elapsed time since planting
 * - water_count gates/limits how far the plant can progress
 * - Each water unlocks 1 additional stage
 * - Without water (water_count = 0), plant stays at stage 0 even if time passes
 * 
 * Formula:
 * - stageByTime = floor((nowSec - plantedAtSec) / stageDurationSec), clamped to [0, harvestStage]
 * - stageUnlocked = clamp(waterCount, 0, harvestStage)
 * - computedStage = min(stageByTime, stageUnlocked)
 * 
 * @param plantedAtSec - Unix timestamp when plant was planted
 * @param waterCount - Number of times plant has been watered
 * @param nowSec - Current unix timestamp
 * @param cropMeta - Crop metadata from renderpack
 * @returns Current stage index (0-based)
 */
export function computeGrowthStageWithWater(
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
 * Check if a plant needs watering
 * 
 * A plant needs water when it is blocked by missing water to reach the next stage.
 * 
 * Rules:
 * - needsWater = (stageUnlocked <= stageByTime) AND (computedStage < harvestStage)
 * - This means: time has advanced past the water-gated limit, and the plant is not yet fully grown
 * 
 * @param plantedAtSec - Unix timestamp when plant was planted
 * @param waterCount - Number of times plant has been watered
 * @param nowSec - Current unix timestamp
 * @param cropMeta - Crop metadata from renderpack
 * @returns True if plant needs watering
 */
export function needsWater(
  plantedAtSec: number,
  waterCount: number | undefined,
  nowSec: number,
  cropMeta: CropMetadata
): boolean {
  // Handle clock skew
  if (nowSec < plantedAtSec) {
    return true; // Plant just planted, needs initial water
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

  // Final computed stage
  const computedStage = Math.min(stageByTimeClamped, stageUnlocked);

  // Needs water if:
  // 1. Stage unlocked by water is <= stage by time (water is the limiting factor)
  // 2. AND plant is not yet at harvest stage (still growing)
  return stageUnlocked <= stageByTimeClamped && computedStage < harvestStage;
}

/**
 * Check if a plant is rotten/expired
 * 
 * A plant is rotten if:
 * - It has a status tag set to 'rotten'
 * - OR it has expired (nowSec > expiresAt)
 * 
 * @param slot - SlotState with plant data
 * @param nowSec - Current unix timestamp
 * @returns True if plant is rotten
 */
export function isRotten(slot: SlotState, nowSec: number): boolean {
  if (slot.status === 'rotten') {
    return true;
  }
  
  if (slot.expiresAt && nowSec > slot.expiresAt) {
    return true;
  }
  
  return false;
}

/**
 * Check if a plant is ready to harvest
 * 
 * A plant is harvestable when:
 * - It has reached the harvest stage (not just the final sprite stage)
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
  if (isRotten(slot, nowSec)) {
    return false;
  }

  // Check if reached harvest stage
  const plantedAt = slot.plantedAt ?? slot.event.created_at;
  const computedStage = computeGrowthStageWithWater(plantedAt, slot.waterCount, nowSec, cropMeta);
  const harvestStage = cropMeta.harvestStage ?? (cropMeta.stages - 1);
  
  return computedStage >= harvestStage;
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
