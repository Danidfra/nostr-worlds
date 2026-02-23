import { useState, useRef, useEffect } from 'react';
import { useGameContext } from '@/contexts/GameContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useWorldStates } from '@/hooks/useWorldStates';
import { useMapStates } from '@/hooks/useMapStates';
import { usePlantStates } from '@/hooks/usePlantStates';
import { useRenderpack, resolveRenderpackConfig } from '@/hooks/useRenderpack';
import { usePlantingActions, type OptimisticPlant } from '@/hooks/usePlantingActions';
import { useNowSeconds } from '@/hooks/useNowSeconds';
import { computeGrid } from '@/lib/renderer/grid';
import { computeGrowthStage, computeSecondsUntilNextStage } from '@/lib/game/growth';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';
import { WorldPicker } from './WorldPicker';
import { InteractiveGridLayer } from './InteractiveGridLayer';
import { SeedSelectDialog } from './SeedSelectDialog';
import type { PlantState } from '@/lib/nostr/types';

/**
 * WorldRenderer - Renders the game world with background, grid, and plants
 * 
 * Data flow:
 * 1. Get current worldId from GameContext
 * 2. Fetch WorldState for worldId
 * 3. Fetch MapState for worldId (with entryMap preference)
 * 4. Fetch Renderpack (manifest + layout) using resolved URLs
 * 5. Fetch PlantStates for worldId + mapId
 * 6. Render background, grid overlay, and plant sprites
 */
export function WorldRenderer() {
  const { currentWorldId } = useGameContext();
  const { user } = useCurrentUser();
  const [showDebugGrid, setShowDebugGrid] = useState(false);

  // Live timestamp for time-based growth (MUST be called before any returns)
  const nowSec = useNowSeconds(2000);

  // Query WorldState
  const { data: worlds } = useWorldStates(user?.pubkey);
  const world = worlds?.find((w) => w.id === currentWorldId);

  // Query MapState
  const { data: mapState, isLoading: isMapLoading, error: mapError } = useMapStates(
    world?.id,
    world?.entryMap
  );

  // Resolve renderpack config
  const renderpackConfig = world && mapState
    ? resolveRenderpackConfig(
        mapState.renderpackUrl,
        mapState.layout,
        world.renderpackUrl,
        world.entryMap,
      )
    : null;

  // Query Renderpack
  const {
    data: renderpack,
    isLoading: isRenderpackLoading,
    error: renderpackError,
  } = useRenderpack(renderpackConfig?.renderpackUrl, renderpackConfig?.layoutId);

  // Query PlantStates
  const { data: plants, isLoading: isPlantsLoading } = usePlantStates(
    world?.id,
    mapState?.id
  );

  // No world selected - show inline world picker
  if (!currentWorldId) {
    return <WorldPicker />;
  }

  // World not found
  if (!world) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Card className="border-destructive max-w-md">
          <CardContent className="py-12 px-8 text-center">
            <p className="text-destructive">World not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading map
  if (isMapLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-12 px-8 text-center space-y-4">
            <Skeleton className="h-48 w-full" />
            <p className="text-sm text-muted-foreground">Loading map...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Map error
  if (mapError || !mapState) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Card className="border-destructive max-w-md">
          <CardContent className="py-12 px-8 text-center">
            <h3 className="font-semibold text-lg mb-2 text-destructive">Map Not Found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              No MapState found for this world. Make sure you've published a MapState event (kind 31416).
            </p>
            <p className="text-xs text-muted-foreground">
              World: {world.id}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading renderpack
  if (isRenderpackLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="py-12 px-8 text-center space-y-4">
            <Skeleton className="h-48 w-full" />
            <p className="text-sm text-muted-foreground">Loading renderpack...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Renderpack error
  if (renderpackError || !renderpack) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Card className="border-destructive max-w-md">
          <CardContent className="py-12 px-8 text-center">
            <h3 className="font-semibold text-lg mb-2 text-destructive">Renderpack Failed</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Failed to load renderpack. Check the renderpack_url and layout.
            </p>
            <p className="text-xs text-muted-foreground break-all">
              {renderpackConfig?.renderpackUrl}/{renderpackConfig?.layoutId}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Compute grid (in natural layout pixel coordinates)
  const grid = computeGrid(renderpack.layout);

  // Render world with responsive scaling
  return (
    <ResponsiveWorldView
      backgroundUrl={renderpack.backgroundUrl}
      layoutName={renderpack.layout.name}
      grid={grid}
      plants={plants}
      isPlantsLoading={isPlantsLoading}
      renderpack={renderpack}
      showDebugGrid={showDebugGrid}
      onToggleDebug={() => setShowDebugGrid(!showDebugGrid)}
      worldId={world.id}
      mapId={mapState.id}
      nowSec={nowSec}
    />
  );
}

/**
 * ResponsiveWorldView - Renders the world with responsive scaling
 * 
 * Strategy:
 * 1. Use object-fit: contain to scale background image responsively
 * 2. Measure the rendered image size using ResizeObserver
 * 3. Compute scale factor and offset to align overlays
 * 4. Render overlays (grid, plants) in a scaled container
 */
interface ResponsiveWorldViewProps {
  backgroundUrl: string;
  layoutName: string;
  grid: ReturnType<typeof computeGrid>;
  plants?: PlantState[];
  isPlantsLoading: boolean;
  renderpack: NonNullable<ReturnType<typeof useRenderpack>['data']>;
  showDebugGrid: boolean;
  onToggleDebug: () => void;
  worldId: string;
  mapId: string;
  nowSec: number;
}

function ResponsiveWorldView({
  backgroundUrl,
  layoutName,
  grid,
  plants,
  isPlantsLoading,
  renderpack,
  showDebugGrid,
  onToggleDebug,
  worldId,
  mapId,
  nowSec,
}: ResponsiveWorldViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const { plantSeed } = usePlantingActions();
  
  // Track natural image size and rendered size
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [renderedSize, setRenderedSize] = useState({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  
  // Seed selection dialog state
  const [isSeedDialogOpen, setIsSeedDialogOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ x: number; y: number } | null>(null);

  // Update natural size when image loads
  useEffect(() => {
    const img = imageRef.current;
    if (!img) return;

    const updateNaturalSize = () => {
      setNaturalSize({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };

    if (img.complete) {
      updateNaturalSize();
    } else {
      img.addEventListener('load', updateNaturalSize);
      return () => img.removeEventListener('load', updateNaturalSize);
    }
  }, [backgroundUrl]);

  // Track container size and compute rendered image size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSizes = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      setContainerSize({ width: containerWidth, height: containerHeight });

      // Compute rendered size using object-fit: contain logic
      if (naturalSize.width > 0 && naturalSize.height > 0) {
        const scaleX = containerWidth / naturalSize.width;
        const scaleY = containerHeight / naturalSize.height;
        const scale = Math.min(scaleX, scaleY);
        
        setRenderedSize({
          width: naturalSize.width * scale,
          height: naturalSize.height * scale,
        });
      }
    };

    updateSizes();

    const resizeObserver = new ResizeObserver(updateSizes);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [naturalSize]);

  // Compute scale factor and offset for overlay alignment
  // The overlay needs to match the scaled background image
  const scale = naturalSize.width > 0 ? renderedSize.width / naturalSize.width : 1;
  const offsetX = (containerSize.width - renderedSize.width) / 2;
  const offsetY = (containerSize.height - renderedSize.height) / 2;

  // Handle tile click - open seed selection dialog
  const handleTileClick = (slotX: number, slotY: number) => {
    setSelectedSlot({ x: slotX, y: slotY });
    setIsSeedDialogOpen(true);
  };

  // Handle seed selection - plant the seed
  const handleSelectSeed = async (cropId: string) => {
    if (!selectedSlot) return;

    try {
      await plantSeed({
        worldId,
        mapId,
        slotX: selectedSlot.x,
        slotY: selectedSlot.y,
        cropId,
      });
    } catch (error) {
      console.error('Failed to plant seed:', error);
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden bg-gradient-to-b from-sky-300 to-green-200 dark:from-sky-900 dark:to-green-950"
    >
      {/* Debug Grid Toggle */}
      <div className="absolute top-4 right-4 z-20">
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleDebug}
          className="bg-white/90 dark:bg-black/90 backdrop-blur-sm"
        >
          {showDebugGrid ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>

      {/* Background Image - Responsive with object-fit: contain */}
      <img
        ref={imageRef}
        src={backgroundUrl}
        alt={layoutName}
        className="absolute inset-0 w-full h-full object-contain object-center"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* Scaled Overlay Container - Aligned with scaled background */}
      {naturalSize.width > 0 && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: offsetX,
            top: offsetY,
            width: renderedSize.width,
            height: renderedSize.height,
          }}
        >
          {/* Inner container with scale transform */}
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              width: naturalSize.width,
              height: naturalSize.height,
            }}
          >
            {/* Plant Area Outline (Debug) */}
            {showDebugGrid && (
              <div
                className="absolute border-2 border-yellow-400"
                style={{
                  left: grid.plantArea.x,
                  top: grid.plantArea.y,
                  width: grid.plantArea.width,
                  height: grid.plantArea.height,
                }}
              />
            )}

            {/* Grid Overlay (Debug) */}
            {showDebugGrid && (
              <svg
                className="absolute inset-0"
                style={{ width: naturalSize.width, height: naturalSize.height }}
              >
                {grid.cells.map((cell, i) => (
                  <g key={i}>
                    <rect
                      x={cell.x}
                      y={cell.y}
                      width={cell.width}
                      height={cell.height}
                      fill="none"
                      stroke="rgba(255, 0, 0, 0.3)"
                      strokeWidth="1"
                    />
                    <text
                      x={cell.x + cell.width / 2}
                      y={cell.y + cell.height / 2}
                      fontSize="10"
                      fill="rgba(255, 255, 255, 0.8)"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {cell.col},{cell.row}
                    </text>
                  </g>
                ))}
              </svg>
            )}

            {/* Plants Layer */}
            {isPlantsLoading ? (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
                <div className="bg-white/90 dark:bg-black/90 backdrop-blur-sm rounded-lg px-4 py-2">
                  <p className="text-sm text-muted-foreground">Loading plants...</p>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0">
                {plants?.map((plant) => (
                  <PlantSprite
                    key={plant.id}
                    plant={plant}
                    grid={grid}
                    renderpack={renderpack}
                    showDebug={showDebugGrid}
                    nowSec={nowSec}
                  />
                ))}
              </div>
            )}

            {/* Interactive Grid Layer - hover + click */}
            {!isPlantsLoading && (
              <InteractiveGridLayer
                naturalWidth={naturalSize.width}
                naturalHeight={naturalSize.height}
                offsetX={offsetX}
                offsetY={offsetY}
                scale={scale}
                grid={grid}
                plants={plants || []}
                onTileClick={handleTileClick}
              />
            )}
          </div>
        </div>
      )}

      {/* Seed Selection Dialog */}
      <SeedSelectDialog
        isOpen={isSeedDialogOpen}
        onClose={() => setIsSeedDialogOpen(false)}
        crops={renderpack.crops}
        renderpackUrl={renderpack.renderpackUrl}
        tileSize={grid.tileSize}
        onSelectSeed={handleSelectSeed}
      />
    </div>
  );
}

/**
 * Render a single plant sprite with time-based growth
 */
interface PlantSpriteProps {
  plant: PlantState | OptimisticPlant;
  grid: ReturnType<typeof computeGrid>;
  renderpack: NonNullable<ReturnType<typeof useRenderpack>['data']>;
  showDebug: boolean;
  nowSec: number;
}

function PlantSprite({ plant, grid, renderpack, showDebug, nowSec }: PlantSpriteProps) {
  const position = grid.slotToPixel(plant.slot.x, plant.slot.y);
  if (!position) return null; // Out of bounds

  const { px, py } = position;
  const tileSize = grid.tileSize;

  // Check if this is an optimistic (pending) plant
  const isPending = '__pending' in plant && plant.__pending;

  // Try to load crop metadata from dictionary
  // Safe check: ensure crops is an object (dictionary) before accessing
  const cropMeta = renderpack.crops?.crops?.[plant.crop];
  const hasCropSprite = cropMeta && cropMeta.file;

  // Safe plantedAt with triple fallback (should never be undefined)
  // 1. Use plant.plantedAt (authoritative)
  // 2. Fallback to event.created_at (for legacy events)
  // 3. Fallback to nowSec (last resort - should never happen)
  const plantedAt = plant.plantedAt ?? plant.event?.created_at ?? nowSec;

  // Development assertion - warn if we're using fallback
  if (process.env.NODE_ENV === 'development') {
    if (!plant.plantedAt) {
      console.warn('[PlantSprite] Missing plantedAt, using fallback:', {
        plantId: plant.id,
        eventId: plant.event?.id,
        eventCreatedAt: plant.event?.created_at,
        fallbackUsed: plantedAt,
      });
    }
  }

  // Compute current growth stage based on time elapsed
  // ALWAYS use computeGrowthStage when crop metadata is available
  // plant.stage is LEGACY data and NEVER used for rendering
  const computedStage = cropMeta
    ? computeGrowthStage(plantedAt, nowSec, cropMeta)
    : 0; // Fallback to seed stage if no metadata

  // Compute seconds until next stage (for debug tooltip)
  const secondsUntilNext = cropMeta
    ? computeSecondsUntilNextStage(plantedAt, nowSec, cropMeta, computedStage)
    : null;

  return (
    <div
      className="absolute group pointer-events-auto cursor-pointer"
      style={{
        left: px,
        top: py,
        width: tileSize,
        height: tileSize,
        opacity: isPending ? 0.6 : 1, // Reduced opacity for pending plants
      }}
    >
      {/* Render sprite if available, otherwise placeholder */}
      {hasCropSprite && cropMeta ? (
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `url(${renderpack.renderpackUrl}/${cropMeta.file})`,
            backgroundPosition: `-${computedStage * tileSize}px 0px`,
            backgroundSize: `${cropMeta.stages * tileSize}px ${tileSize}px`,
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
          }}
        />
      ) : (
        // Placeholder: Simple colored square
        <div
          className="w-full h-full rounded border-2 border-green-600 bg-green-400 flex items-center justify-center text-xs font-bold"
          title={`${plant.crop} (stage ${computedStage})`}
        >
          🌱
        </div>
      )}

      {/* Pending indicator */}
      {isPending && (
        <div className="absolute top-0 right-0 w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
      )}

      {/* Debug Info on Hover */}
      {showDebug && (
        <div className="absolute left-0 top-full mt-1 bg-black/90 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
          <div>Crop: {plant.crop}</div>
          <div>Stage: {computedStage} / {cropMeta?.stages ? cropMeta.stages - 1 : '?'}</div>
          <div>Slot: {plant.slot.x},{plant.slot.y}</div>
          <div>Planted: {new Date(plantedAt * 1000).toLocaleTimeString()}</div>
          <div>Now: {new Date(nowSec * 1000).toLocaleTimeString()}</div>
          <div>Elapsed: {nowSec - plantedAt}s</div>
          {secondsUntilNext !== null && secondsUntilNext > 0 && (
            <div className="text-green-400">Next stage: {secondsUntilNext}s</div>
          )}
          {secondsUntilNext === null && (
            <div className="text-yellow-400">Ready to harvest!</div>
          )}
          <div className="truncate max-w-[200px]">ID: {plant.id}</div>
          {isPending && <div className="text-yellow-400">Status: Pending</div>}
        </div>
      )}
    </div>
  );
}
