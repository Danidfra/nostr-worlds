/**
 * Relay role types
 * - game: Primary relay for game state (worlds, maps, plants)
 * - backup: Fallback relay for redundancy
 * - discovery: Social/discovery features (future)
 */
export type RelayRole = 'game' | 'backup' | 'discovery';

/**
 * Relay configuration
 */
export interface RelayConfig {
  /** WebSocket URL */
  url: string;
  /** Relay role */
  role: RelayRole;
  /** Whether this relay is required for publishing game events */
  required?: boolean;
}

/**
 * Default relay configuration for the game
 * Can be extended with multiple relays in the future
 */
export const GAME_RELAYS: RelayConfig[] = [
  {
    url: 'wss://relay.primal.net',
    role: 'game',
    required: true, // Game events MUST be published here
  },
  // Add backup relays here in the future:
  // { url: 'wss://relay.ditto.pub', role: 'backup' },
];

/**
 * Default game relay (for backward compatibility)
 */
export const DEFAULT_GAME_RELAY = GAME_RELAYS[0].url;
