import { useQuery } from '@tanstack/react-query';
import type { RenderpackManifest, MapLayout, CropsMetadata } from '@/lib/nostr/types';

/**
 * Fetch and parse the renderpack manifest
 * 
 * @param renderpackUrl - Base URL of the renderpack
 * @returns Manifest data
 */
async function fetchManifest(renderpackUrl: string): Promise<RenderpackManifest> {
  const url = `${renderpackUrl}/manifest.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch manifest from ${url}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch and parse a map layout
 * 
 * @param renderpackUrl - Base URL of the renderpack
 * @param layoutId - Layout identifier (e.g., "farm.v1")
 * @returns Layout data
 */
async function fetchLayout(renderpackUrl: string, layoutId: string): Promise<MapLayout> {
  const url = `${renderpackUrl}/meta/maps/${layoutId}.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch layout ${layoutId} from ${url}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch and parse crops metadata (optional)
 * 
 * @param renderpackUrl - Base URL of the renderpack
 * @returns Crops metadata or null if not found/invalid
 */
async function fetchCrops(renderpackUrl: string): Promise<CropsMetadata | null> {
  try {
    const url = `${renderpackUrl}/meta/crops.json`;
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    
    // Validate structure: must have { crops: CropMetadata[] }
    if (!data || typeof data !== 'object') {
      console.debug('[useRenderpack] Invalid crops.json: not an object');
      return null;
    }
    
    if (!Array.isArray(data.crops)) {
      console.debug('[useRenderpack] Invalid crops.json: crops is not an array');
      return null;
    }
    
    // Valid structure
    return data as CropsMetadata;
  } catch (error) {
    console.debug('[useRenderpack] Failed to fetch crops.json:', error);
    return null;
  }
}

/**
 * Resolve the final renderpack URL and layout using priority rules
 * Per spec (from 31416-mapstate.md):
 * - renderpack_url priority: MapState > WorldState
 * - layout priority: MapState.layout > WorldState.entry_map > manifest.entryMap
 */
export interface RenderpackConfig {
  renderpackUrl: string;
  layoutId: string;
}

export function resolveRenderpackConfig(
  mapRenderpackUrl?: string,
  mapLayout?: string,
  worldRenderpackUrl?: string,
  worldEntryMap?: string,
  manifestEntryMap?: string,
): RenderpackConfig | null {
  // Renderpack URL priority: MapState > WorldState
  const renderpackUrl = mapRenderpackUrl || worldRenderpackUrl;
  if (!renderpackUrl) return null;

  // Layout priority: MapState.layout > WorldState.entry_map > manifest.entryMap
  const layoutId = mapLayout || worldEntryMap || manifestEntryMap;
  if (!layoutId) return null;

  return { renderpackUrl, layoutId };
}

/**
 * Hook to load renderpack data (manifest + layout)
 * 
 * @param renderpackUrl - Base URL of the renderpack
 * @param layoutId - Layout identifier to load
 * @returns Query result with manifest, layout, and optional crops
 */
export function useRenderpack(renderpackUrl?: string, layoutId?: string) {
  return useQuery({
    queryKey: ['renderpack', renderpackUrl, layoutId],
    queryFn: async () => {
      if (!renderpackUrl || !layoutId) {
        throw new Error('renderpackUrl and layoutId are required');
      }

      // Fetch manifest and layout in parallel
      const [manifest, layout, crops] = await Promise.all([
        fetchManifest(renderpackUrl),
        fetchLayout(renderpackUrl, layoutId),
        fetchCrops(renderpackUrl),
      ]);

      // Debug logging for crops metadata
      if (crops && Array.isArray(crops.crops)) {
        console.debug(
          `[useRenderpack] Crops metadata loaded: ${crops.crops.length} crops`,
          crops.crops.map((c) => c.id)
        );
      } else {
        console.debug('[useRenderpack] No crops metadata (using placeholder sprites)');
      }

      // Resolve background image URL
      const backgroundUrl = `${renderpackUrl}/${layout.background}`;

      return {
        manifest,
        layout,
        crops,
        backgroundUrl,
        renderpackUrl,
      };
    },
    enabled: !!renderpackUrl && !!layoutId,
    staleTime: Infinity, // Renderpacks are immutable
    gcTime: Infinity,
  });
}
