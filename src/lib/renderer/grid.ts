import type { MapLayout } from '@/lib/nostr/types';

/**
 * Grid cell information
 */
export interface GridCell {
  /** Cell column index */
  col: number;
  /** Cell row index */
  row: number;
  /** Top-left X pixel position */
  x: number;
  /** Top-left Y pixel position */
  y: number;
  /** Cell width in pixels */
  width: number;
  /** Cell height in pixels */
  height: number;
}

/**
 * Computed grid layout
 */
export interface ComputedGrid {
  /** Plant area rectangle */
  plantArea: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Grid dimensions */
  grid: {
    cols: number;
    rows: number;
  };
  /** Tile size in pixels */
  tileSize: number;
  /** All grid cells */
  cells: GridCell[];
  /** Helper function to get slot pixel position */
  slotToPixel: (slotX: number, slotY: number) => { px: number; py: number } | null;
}

/**
 * Compute grid layout from map layout
 * 
 * This computes:
 * 1. Cell positions within the plant area
 * 2. Slot-to-pixel mapping (centered in cell)
 * 
 * @param layout - Map layout configuration
 * @returns Computed grid information
 */
export function computeGrid(layout: MapLayout): ComputedGrid {
  const { plantAreaRect, grid, tileSize } = layout;
  const { cols, rows, align = 'center' } = grid;

  // Calculate total grid dimensions
  const gridWidth = cols * tileSize;
  const gridHeight = rows * tileSize;

  // Calculate offset based on alignment
  let offsetX = plantAreaRect.x;
  let offsetY = plantAreaRect.y;

  if (align === 'center') {
    offsetX += (plantAreaRect.w - gridWidth) / 2;
    offsetY += (plantAreaRect.h - gridHeight) / 2;
  } else if (align === 'top-left') {
    // No offset needed
  }
  // Add more alignment modes as needed

  // Compute all cells
  const cells: GridCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        col,
        row,
        x: offsetX + col * tileSize,
        y: offsetY + row * tileSize,
        width: tileSize,
        height: tileSize,
      });
    }
  }

  // Helper function to convert slot to pixel position
  // Returns the top-left pixel position where a plant tile should be centered in the cell
  const slotToPixel = (slotX: number, slotY: number): { px: number; py: number } | null => {
    if (slotX < 0 || slotX >= cols || slotY < 0 || slotY >= rows) {
      return null; // Out of bounds
    }

    const cellX = offsetX + slotX * tileSize;
    const cellY = offsetY + slotY * tileSize;

    // Return the top-left corner of the cell (plant sprite will be centered)
    return {
      px: cellX,
      py: cellY,
    };
  };

  return {
    plantArea: {
      x: plantAreaRect.x,
      y: plantAreaRect.y,
      width: plantAreaRect.w,
      height: plantAreaRect.h,
    },
    grid: {
      cols,
      rows,
    },
    tileSize,
    cells,
    slotToPixel,
  };
}
