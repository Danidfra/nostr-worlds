import { useState, useRef, useEffect } from 'react';
import { clientToSlot } from '@/lib/renderer/coordinates';
import type { ComputedGrid } from '@/lib/renderer/grid';
import type { PlantState } from '@/lib/nostr/types';
import type { OptimisticPlant } from '@/hooks/usePlantingActions';

interface InteractiveGridLayerProps {
  naturalWidth: number;
  naturalHeight: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  grid: ComputedGrid;
  plants: (PlantState | OptimisticPlant)[];
  onTileClick: (slotX: number, slotY: number) => void;
}

/**
 * InteractiveGridLayer - Handles mouse interaction with the grid
 * 
 * Provides:
 * - Hover highlighting on empty tiles
 * - Click detection for planting
 * - Coordinate conversion from mouse to grid slot
 */
export function InteractiveGridLayer({
  naturalWidth,
  naturalHeight,
  offsetX,
  offsetY,
  scale,
  grid,
  plants,
  onTileClick,
}: InteractiveGridLayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredSlot, setHoveredSlot] = useState<{ x: number; y: number } | null>(null);

  // Handle mouse move
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const slot = clientToSlot(
      event.clientX,
      event.clientY,
      containerRef.current,
      offsetX,
      offsetY,
      scale,
      grid
    );

    // Only hover empty slots
    if (slot && !isSlotOccupied(slot.x, slot.y, plants)) {
      setHoveredSlot(slot);
    } else {
      setHoveredSlot(null);
    }
  };

  // Handle mouse leave
  const handleMouseLeave = () => {
    setHoveredSlot(null);
  };

  // Handle click
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const slot = clientToSlot(
      event.clientX,
      event.clientY,
      containerRef.current,
      offsetX,
      offsetY,
      scale,
      grid
    );

    // Only allow clicking empty slots
    if (slot && !isSlotOccupied(slot.x, slot.y, plants)) {
      onTileClick(slot.x, slot.y);
    }
  };

  // Get pixel position for hovered slot
  const hoveredPosition = hoveredSlot ? grid.slotToPixel(hoveredSlot.x, hoveredSlot.y) : null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-auto cursor-pointer"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{
        width: '100%',
        height: '100%',
      }}
    >
      {/* Hover highlight */}
      {hoveredPosition && hoveredSlot && (
        <div
          className="absolute transition-all duration-100"
          style={{
            left: hoveredPosition.px,
            top: hoveredPosition.py,
            width: grid.tileSize,
            height: grid.tileSize,
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            border: '2px solid rgba(255, 255, 255, 0.6)',
            borderRadius: '4px',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

/**
 * Check if a slot is occupied by a plant
 */
function isSlotOccupied(
  slotX: number,
  slotY: number,
  plants: (PlantState | OptimisticPlant)[]
): boolean {
  return plants.some((plant) => plant.slot.x === slotX && plant.slot.y === slotY);
}
