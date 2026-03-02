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
  onHoverChange?: (slotX: number | null, slotY: number | null) => void;
}

/**
 * InteractiveGridLayer - Handles mouse interaction with the grid
 * 
 * Provides:
 * - Hover highlighting on plantable tiles (empty or no slot)
 * - Click detection for planting on empty/missing slots
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
  onHoverChange,
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

    if (!slot) {
      setHoveredSlot(null);
      onHoverChange?.(null, null);
      return;
    }

    // Notify parent of hover change (for all slots)
    onHoverChange?.(slot.x, slot.y);

    // Check if this slot is plantable
    if (isSlotPlantable(slot.x, slot.y, slots)) {
      // Hovering plantable slot
      setHoveredSlot(slot);
    } else {
      // Not plantable
      setHoveredSlot(null);
    }
  };

  // Handle mouse leave
  const handleMouseLeave = () => {
    setHoveredSlot(null);
    onHoverChange?.(null, null);
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

    // Get slot state at this position
    const slotState = getSlotAt(slot.x, slot.y, slots);

    if (slotState) {
      // Slot exists - check type
      if (slotState.type === 'plant') {
        // Plant slot - trigger harvest callback
        if (onPlantClick) {
          onPlantClick(slotState);
        }
      } else if (slotState.type === 'empty') {
        // Empty slot - trigger plant callback
        onTileClick(slot.x, slot.y);
      }
    } else {
      // No slot exists - trigger plant callback
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
 * Check if a slot is plantable (empty or doesn't exist)
 * 
 * A slot is plantable if:
 * - No slot exists at this position
 * - OR slot exists with type='empty'
 */
function isSlotPlantable(
  slotX: number,
  slotY: number,
  slots: (SlotState | OptimisticSlot)[]
): boolean {
  const slot = slots.find((s) => s.slot.x === slotX && s.slot.y === slotY);
  
  // No slot = plantable
  if (!slot) return true;
  
  // Empty slot = plantable
  if (slot.type === 'empty') return true;
  
  // Plant slot = not plantable (should harvest first)
  return false;
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
