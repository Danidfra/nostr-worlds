import type { NostrEvent } from '@nostrify/nostrify';

/**
 * WorldState (Kind 31415)
 * Represents the root state of a game world
 */
export interface WorldState {
  /** Event object */
  event: NostrEvent;
  /** World identifier (d tag) */
  id: string;
  /** Schema version */
  version: string;
  /** World category (farm, city, dungeon, sandbox) */
  type: string;
  /** Human-readable name */
  name: string;
  /** Base URL for renderpack */
  renderpackUrl: string;
  /** Initial map layout identifier */
  entryMap: string;
  /** Optional season context */
  season?: string;
}

/**
 * MapState (Kind 31416)
 * Represents a playable map within a world
 */
export interface MapState {
  /** Event object */
  event: NostrEvent;
  /** Map identifier (d tag) */
  id: string;
  /** Schema version */
  version: string;
  /** Parent world identifier */
  worldId: string;
  /** Layout identifier to resolve from renderpack */
  layout: string;
  /** Renderpack URL (may override WorldState) */
  renderpackUrl: string;
  /** Optional human-readable name */
  name?: string;
  /** Optional description */
  description?: string;
}

/**
 * SlotState (Kind 31417)
 * Represents the current state of a single grid slot on a map
 * 
 * A SlotState can contain various entity types (plants, rocks, decorations, etc.).
 * The d tag is interpreted as a slot identifier, not a plant-specific identifier.
 * 
 * GROWTH MODEL: Time-based (Route A)
 * - Growth stage is computed from (plantedAt, nowSec, cropMeta.stageDurationSec)
 * - The 'stage' field is LEGACY and should NOT be used for rendering
 * - Rendering must always use computeGrowthStage() when crop metadata exists
 * 
 * SlotState is the ONLY source of truth for what exists in a slot.
 * SlotAction (kind 14159) represents intent, not state.
 */
export interface SlotState {
  /** Event object */
  event: NostrEvent;
  /** Slot identifier (d tag) - format: slot:<world>:<map>:<x>:<y> */
  id: string;
  /** Schema version */
  version: string;
  /** Parent world identifier */
  worldId: string;
  /** Parent map identifier */
  mapId: string;
  /** Grid position */
  slot: {
    x: number;
    y: number;
  };
  /** Slot entity type (plant, empty, rock, decoration, etc.) */
  type: 'plant' | 'empty' | string;
  
  // Plant-specific fields (only present when type === 'plant')
  /** Crop identifier */
  crop?: string;
  /** Growth stage (0-based index) - AUTHORITATIVE: Host-controlled stage tracking */
  stage?: number;
  /** Timestamp when current stage's timer started (unix seconds) - Used for per-stage timing */
  stageStartedAt?: number;
  /** Planting timestamp - Used for time-based growth computation */
  plantedAt?: number;
  /** 
   * Last watering timestamp
   * @deprecated Use wetUntil instead. Kept for backward compatibility.
   */
  wateredAt?: number;
  /** Timestamp until which the plant remains wet - Replaces wateredAt logic */
  wetUntil?: number;
  /** 
   * Water count - Number of times plant has been watered
   * @deprecated Use wetUntil/waterDurationSec for progression logic.
   */
  waterCount?: number;
  /** Ready-to-harvest timestamp - Set when plant reaches final stage */
  readyAt?: number;
  /** Expiration timestamp - When plant becomes rotten (readyAt + grace period) */
  expiresAt?: number;
  /** Optional: Harvest count */
  harvestCount?: number;
  /** Optional: Maximum harvests */
  harvestMax?: number;
  /** Optional: Regrowth timestamp */
  regrowAt?: number;
  
  // Empty slot fields (only present when type === 'empty')
  /** Last harvest timestamp for empty slots */
  lastHarvestedAt?: number;
  
  // Status field (applicable to both plant and empty slots)
  /** Slot status - empty for empty slots, healthy/rotten for plants */
  status?: 'empty' | 'healthy' | 'rotten' | string;
}

/**
 * Renderpack Manifest
 */
export interface RenderpackManifest {
  /** Manifest version */
  version: string;
  /** Renderpack name */
  name: string;
  /** Default entry map layout */
  entryMap?: string;
  /** Tile size in pixels */
  tileSize: number;
  /** Available layouts */
  layouts?: string[];
}

/**
 * Map Layout
 */
export interface MapLayout {
  /** Layout identifier */
  id: string;
  /** Layout version */
  version: string;
  /** Display name */
  name: string;
  /** Background image path (relative to renderpack) */
  background: string;
  /** Tile size in pixels */
  tileSize: number;
  /** Planting area rectangle */
  plantAreaRect: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  /** Grid configuration */
  grid: {
    cols: number;
    rows: number;
    /** Alignment: center, top-left, etc. */
    align?: string;
  };
}

/**
 * Crop Metadata (individual crop)
 */
export interface CropMetadata {
  /** Spritesheet filename (relative to renderpack) */
  file: string;
  /** Number of growth stages */
  stages: number;
  /** Stage index when crop is ready to harvest */
  harvestStage?: number;
  /** Duration in seconds per growth stage (for time-based growth) */
  stageDurationSec?: number;
  /** Amount of wet time added by each watering action (defaults to stageDurationSec if missing) */
  waterDurationSec?: number;
  /** Optional cap on how much wet time can be accumulated relative to "now" */
  maxWetBufferSec?: number;
  /** Rotten sprite filename (relative to renderpack) */
  rottenFile?: string;
}

/**
 * Crops Collection (dictionary format)
 */
export interface CropsMetadata {
  /** Dictionary of crops keyed by crop ID */
  crops: Record<string, CropMetadata>;
  /** Optional version */
  version?: string;
  /** Optional tile size */
  tileSize?: number;
  /** Optional layout defaults */
  layoutDefaults?: Record<string, unknown>;
}

/**
 * SlotAction (Kind 14159)
 * Represents a player-issued action intent on a specific slot
 * 
 * SlotAction represents INTENT, not state.
 * SlotAction is immutable and NOT addressable.
 * SlotState (kind 31417) is the authoritative state.
 */
export interface SlotAction {
  /** Event object */
  event: NostrEvent;
  /** Schema version */
  version: string;
  /** World identifier */
  worldId: string;
  /** Map identifier */
  mapId: string;
  /** Slot coordinates */
  slot: {
    x: number;
    y: number;
  };
  /** Slot address (d tag format used by SlotState) */
  slotD: string;
  /** Action type (harvest, plant, water, clear) */
  action: 'harvest' | 'plant' | 'water' | 'clear' | string;
  /** Expected slot revision (for concurrency control) */
  expectedRev: number;
  /** Client-side deduplication ID (UUID) */
  clientNonce: string;
  /** Crop identifier (only for plant action) */
  crop?: string;
}
