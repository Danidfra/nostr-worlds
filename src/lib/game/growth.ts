import type { CropMetadata, SlotState } from '@/lib/nostr/types';

/**
 * Default stage duration in seconds (5 minutes)
 * Used when crop metadata doesn't specify stageDurationSec
 */
const DEFAULT_STAGE_DURATION_SEC = 300;

/**
 * Expiration grace period in seconds (1 hour)
 * Time after reaching harvest stage before plant becomes rotten
 */
export const EXPIRATION_GRACE_PERIOD_SEC = 3600;

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
 * Compute growth stage with watering mechanic
 * 
 * Rules:
 * - Growth uses the later of (plantedAt, wateredAt) as the start time
 * - Without watering, plant stays at stage 0
 * - Each watering unlocks time-based progression from that point
 * 
 * @param plantedAtSec - Unix timestamp when plant was planted
 * @param wateredAtSec - Unix timestamp of last watering (optional)
 * @param nowSec - Current unix timestamp
 * @param cropMeta - Crop metadata from renderpack
 * @returns Current stage index (0-based)
 */
export function computeGrowthStageWithWater(
  plantedAtSec: number,
  wateredAtSec: number | undefined,
  nowSec: number,
  cropMeta: CropMetadata
): number {
  // Without water, plant stays at stage 0
  if (!wateredAtSec) {
    return 0;
  }

  // Use the later of planted or watered as growth start time
  const growthStartTime = Math.max(plantedAtSec, wateredAtSec);

  // Compute stage from growth start time
  return computeGrowthStage(growthStartTime, nowSec, cropMeta);
}

/**
 * Check if a plant needs watering
 * 
 * A plant needs water if it hasn't been watered yet.
 * 
 * @param wateredAtSec - Unix timestamp of last watering (optional)
 * @returns True if plant needs watering
 */
export function needsWater(wateredAtSec: number | undefined): boolean {
  return !wateredAtSec;
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
 * - It has reached its final growth stage
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

  // Check if reached final stage
  const plantedAt = slot.plantedAt ?? slot.event.created_at;
  const computedStage = computeGrowthStageWithWater(plantedAt, slot.wateredAt, nowSec, cropMeta);
  const maxStage = cropMeta.stages - 1;
  
  return computedStage >= maxStage;
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
