import type { NostrEvent } from '@nostrify/nostrify';
import type { WorldState, MapState, PlantState } from './types';

/**
 * Get a tag value by name
 */
function getTag(event: NostrEvent, tagName: string): string | undefined {
  return event.tags.find(([name]) => name === tagName)?.[1];
}

/**
 * Get a tag value by name (second value)
 */
function getTagValue(event: NostrEvent, tagName: string, index: number = 1): string | undefined {
  return event.tags.find(([name]) => name === tagName)?.[index];
}

/**
 * Parse a WorldState event (kind 31415)
 */
export function parseWorldState(event: NostrEvent): WorldState | null {
  if (event.kind !== 31415) return null;

  // Required tags
  const d = getTag(event, 'd');
  const v = getTag(event, 'v');
  const type = getTag(event, 'type');
  const name = getTag(event, 'name');
  const renderpackUrl = getTag(event, 'renderpack_url');
  const entryMap = getTag(event, 'entry_map');

  // Validate required tags
  if (!d || !v || !type || !name || !renderpackUrl || !entryMap) {
    return null;
  }

  // Optional tags
  const season = getTag(event, 'season');

  return {
    event,
    id: d,
    version: v,
    type,
    name,
    renderpackUrl,
    entryMap,
    season,
  };
}

/**
 * Parse a MapState event (kind 31416)
 */
export function parseMapState(event: NostrEvent): MapState | null {
  if (event.kind !== 31416) return null;

  // Required tags
  const d = getTag(event, 'd');
  const v = getTag(event, 'v');
  const worldId = getTag(event, 'world');
  const layout = getTag(event, 'layout');
  const renderpackUrl = getTag(event, 'renderpack_url');

  // Validate required tags
  if (!d || !v || !worldId || !layout || !renderpackUrl) {
    return null;
  }

  // Optional tags
  const name = getTag(event, 'name');
  const description = getTag(event, 'desc');

  return {
    event,
    id: d,
    version: v,
    worldId,
    layout,
    renderpackUrl,
    name,
    description,
  };
}

/**
 * Parse a PlantState event (kind 31417)
 */
export function parsePlantState(event: NostrEvent): PlantState | null {
  if (event.kind !== 31417) return null;

  // Required tags
  const d = getTag(event, 'd');
  const v = getTag(event, 'v');
  const worldId = getTag(event, 'world');
  const mapId = getTag(event, 'map');
  const crop = getTag(event, 'crop');
  const stageStr = getTag(event, 'stage');

  // Parse slot tag - supports both formats:
  // Format 1: ["slot", "3", "2"] - separate x,y values
  // Format 2: ["slot", "3:2"] - colon-separated string
  const slotTag = event.tags.find(([name]) => name === 'slot');
  if (!slotTag) return null;

  let slotX: string | undefined;
  let slotY: string | undefined;

  if (slotTag[2] !== undefined) {
    // Format 1: ["slot", "3", "2"]
    slotX = slotTag[1];
    slotY = slotTag[2];
  } else if (slotTag[1] && slotTag[1].includes(':')) {
    // Format 2: ["slot", "3:2"]
    const parts = slotTag[1].split(':');
    if (parts.length === 2) {
      slotX = parts[0];
      slotY = parts[1];
    }
  }

  // Validate required tags
  if (!d || !v || !worldId || !mapId || !slotX || !slotY || !crop || stageStr === undefined) {
    return null;
  }

  // Parse and validate slot coordinates
  const x = parseInt(slotX, 10);
  const y = parseInt(slotY, 10);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const stage = parseInt(stageStr, 10);
  if (!Number.isFinite(stage)) return null;

  // Optional timing tags
  const plantedAtStr = getTag(event, 'planted_at');
  const readyAtStr = getTag(event, 'ready_at');
  const harvestCountStr = getTag(event, 'harvest_count');
  const harvestMaxStr = getTag(event, 'harvest_max');
  const regrowAtStr = getTag(event, 'regrow_at');
  const expiresAtStr = getTag(event, 'expires_at');

  return {
    event,
    id: d,
    version: v,
    worldId,
    mapId,
    slot: {
      x,
      y,
    },
    crop,
    stage,
    plantedAt: plantedAtStr ? parseInt(plantedAtStr, 10) : undefined,
    readyAt: readyAtStr ? parseInt(readyAtStr, 10) : undefined,
    harvestCount: harvestCountStr ? parseInt(harvestCountStr, 10) : undefined,
    harvestMax: harvestMaxStr ? parseInt(harvestMaxStr, 10) : undefined,
    regrowAt: regrowAtStr ? parseInt(regrowAtStr, 10) : undefined,
    expiresAt: expiresAtStr ? parseInt(expiresAtStr, 10) : undefined,
  };
}

/**
 * Validate WorldState events
 */
export function validateWorldState(event: NostrEvent): boolean {
  return parseWorldState(event) !== null;
}

/**
 * Validate MapState events
 */
export function validateMapState(event: NostrEvent): boolean {
  return parseMapState(event) !== null;
}

/**
 * Validate PlantState events
 */
export function validatePlantState(event: NostrEvent): boolean {
  return parsePlantState(event) !== null;
}
