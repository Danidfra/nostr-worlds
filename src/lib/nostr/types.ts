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
 * PlantState (Kind 31417)
 * Represents a single plant instance on a map
 */
export interface PlantState {
  /** Event object */
  event: NostrEvent;
  /** Plant identifier (d tag) */
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
  /** Crop identifier */
  crop: string;
  /** Growth stage (0-based index) */
  stage: number;
  /** Optional: Planting timestamp */
  plantedAt?: number;
  /** Optional: Ready-to-harvest timestamp */
  readyAt?: number;
  /** Optional: Harvest count */
  harvestCount?: number;
  /** Optional: Maximum harvests */
  harvestMax?: number;
  /** Optional: Regrowth timestamp */
  regrowAt?: number;
  /** Optional: Expiration timestamp */
  expiresAt?: number;
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
