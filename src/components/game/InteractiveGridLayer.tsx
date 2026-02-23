import { useState, useRef } from 'react';
import { clientToSlot } from '@/lib/renderer/coordinates';
import type { ComputedGrid } from '@/lib/renderer/grid';
import type { SlotState } from '@/lib/nostr/types';
import type { OptimisticSlot } from '@/hooks/usePlantingActions';

interface InteractiveGridLayerProps {
  _naturalWidth: number;
  _naturalHeight: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  grid: ComputedGrid;
  slots: (SlotState | OptimisticSlot)[];
  onTileClick: (slotX: number, slotY: number) => void;
  onPlantClick?: (slot: SlotState | OptimisticSlot) => void;
}

/**
 * InteractiveGridLayer - Handles mouse interaction with the grid
 * 
 * Provides:
 * - Hover highlighting on empty tiles
 * - Click detection for planting
 * - Click detection for harvesting plants
 * - Coordinate conversion from mouse to grid slot
 */
export function InteractiveGridLayer({
  _naturalWidth,
  _naturalHeight,
  offsetX,
  offsetY,
  scale,
  grid,
  slots,
  onTileClick,
  onPlantClick,
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
    if (slot && !isSlotOccupied(slot.x, slot.y, slots)) {
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

    if (!slot) return;

    // Check if slot is occupied
    const occupiedSlot = getSlotAt(slot.x, slot.y, slots);

    if (occupiedSlot) {
      // Click on plant - trigger harvest callback if available
      if (onPlantClick) {
        onPlantClick(occupiedSlot);
      }
    } else {
      // Click on empty slot - trigger plant callback
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
 * Check if a slot is occupied
 */
function isSlotOccupied(
  slotX: number,
  slotY: number,
  slots: (SlotState | OptimisticSlot)[]
): boolean {
  return slots.some((slot) => slot.slot.x === slotX && slot.slot.y === slotY);
}

/**
 * Get slot at specific coordinates
 */
function getSlotAt(
  slotX: number,
  slotY: number,
  slots: (SlotState | OptimisticSlot)[]
): SlotState | OptimisticSlot | undefined {
  return slots.find((slot) => slot.slot.x === slotX && slot.slot.y === slotY);
}
