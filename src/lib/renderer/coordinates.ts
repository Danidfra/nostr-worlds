import type { ComputedGrid } from './grid';

/**
 * Convert mouse/pointer coordinates to grid slot
 * 
 * IMPORTANT: This function is called from InteractiveGridLayer which is already
 * positioned inside the scaled overlay container. The containerRef is the layer itself.
 * 
 * @param clientX - Mouse X position (from event)
 * @param clientY - Mouse Y position (from event)
 * @param containerRef - Reference to the InteractiveGridLayer element
 * @param _offsetX - DEPRECATED: Not used (container is already offset)
 * @param _offsetY - DEPRECATED: Not used (container is already offset)
 * @param scale - Scale factor applied to the image
 * @param grid - Computed grid data
 * @returns Grid slot {x, y} or null if outside grid
 */
export function clientToSlot(
  clientX: number,
  clientY: number,
  containerRef: HTMLElement,
  _offsetX: number,
  _offsetY: number,
  scale: number,
  grid: ComputedGrid
): { x: number; y: number } | null {
  // Get container bounds (InteractiveGridLayer is already inside the offset container)
  const rect = containerRef.getBoundingClientRect();
  
  // Convert client coordinates to container-relative
  // The container is already positioned at the correct offset, so no need to subtract again
  const containerX = clientX - rect.left;
  const containerY = clientY - rect.top;
  
  // Scale to natural image coordinates
  // No offset subtraction needed since the container is already offset
  const naturalX = containerX / scale;
  const naturalY = containerY / scale;
  
  // Debug logging (optional - can be removed in production)
  if (process.env.NODE_ENV === 'development') {
    const slot = pixelToSlot(naturalX, naturalY, grid);
    if (slot) {
      console.debug('[clientToSlot]', {
        client: { x: clientX, y: clientY },
        container: { x: containerX, y: containerY },
        natural: { x: naturalX, y: naturalY },
        slot,
      });
    }
  }
  
  // Convert to grid slot
  return pixelToSlot(naturalX, naturalY, grid);
}

/**
 * Convert pixel coordinates (in natural image space) to grid slot
 * 
 * Uses robust grid origin computation to handle cells in any order.
 * The grid origin is the minimum X and Y position of all cells.
 * 
 * @param px - Pixel X coordinate (in natural image space)
 * @param py - Pixel Y coordinate (in natural image space)
 * @param grid - Computed grid data
 * @returns Grid slot {x, y} or null if outside grid
 */
export function pixelToSlot(
  px: number,
  py: number,
  grid: ComputedGrid
): { x: number; y: number } | null {
  if (grid.cells.length === 0) return null;
  
  // Compute grid origin robustly (minimum X and Y across all cells)
  // This handles cells in any order and works regardless of alignment
  let gridStartX = grid.cells[0].x;
  let gridStartY = grid.cells[0].y;
  
  for (const cell of grid.cells) {
    if (cell.x < gridStartX) gridStartX = cell.x;
    if (cell.y < gridStartY) gridStartY = cell.y;
  }
  
  // Calculate slot position relative to grid origin
  const relativeX = px - gridStartX;
  const relativeY = py - gridStartY;
  
  const slotX = Math.floor(relativeX / grid.tileSize);
  const slotY = Math.floor(relativeY / grid.tileSize);
  
  // Check if within grid bounds
  if (slotX < 0 || slotX >= grid.grid.cols || slotY < 0 || slotY >= grid.grid.rows) {
    return null;
  }
  
  return { x: slotX, y: slotY };
}
