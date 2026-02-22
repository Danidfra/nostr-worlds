/**
 * localStorage keys for world settings
 */
const LAST_WORLD_ID_KEY = 'nostr-worlds:lastWorldId';
const AUTO_OPEN_LAST_WORLD_KEY = 'nostr-worlds:autoOpenLastWorld';

/**
 * Get the last selected world ID from localStorage
 */
export function getLastWorldId(): string | null {
  try {
    return localStorage.getItem(LAST_WORLD_ID_KEY);
  } catch {
    return null;
  }
}

/**
 * Save the last selected world ID to localStorage
 */
export function setLastWorldId(worldId: string | null): void {
  try {
    if (worldId === null) {
      localStorage.removeItem(LAST_WORLD_ID_KEY);
    } else {
      localStorage.setItem(LAST_WORLD_ID_KEY, worldId);
    }
  } catch {
    // Silently fail if localStorage is not available
  }
}

/**
 * Get the auto-open setting from localStorage
 * Default: true
 */
export function getAutoOpenLastWorld(): boolean {
  try {
    const value = localStorage.getItem(AUTO_OPEN_LAST_WORLD_KEY);
    if (value === null) return true; // Default to ON
    return value === 'true';
  } catch {
    return true; // Default to ON
  }
}

/**
 * Save the auto-open setting to localStorage
 */
export function setAutoOpenLastWorld(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_OPEN_LAST_WORLD_KEY, enabled ? 'true' : 'false');
  } catch {
    // Silently fail if localStorage is not available
  }
}
