import type { ComputedGrid } from './grid';

/**
 * Convert mouse/pointer coordinates to grid slot
 * 
 * @param clientX - Mouse X position (from event)
 * @param clientY - Mouse Y position (from event)
 * @param containerRef - Reference to the container element
 * @param offsetX - Image offset X (from object-fit: contain)
 * @param offsetY - Image offset Y (from object-fit: contain)
 * @param scale - Scale factor applied to the image
 * @param grid - Computed grid data
 * @returns Grid slot {x, y} or null if outside grid
 */
export function clientToSlot(
  clientX: number,
  clientY: number,
  containerRef: HTMLElement,
  offsetX: number,
  offsetY: number,
  scale: number,
  grid: ComputedGrid
): { x: number; y: number } | null {
  // Get container bounds
  const rect = containerRef.getBoundingClientRect();
  
  // Convert client coordinates to container-relative
  const containerX = clientX - rect.left;
  const containerY = clientY - rect.top;
  
  // Remove image offset (from object-fit: contain centering)
  const imageX = containerX - offsetX;
  const imageY = containerY - offsetY;
  
  // Scale to natural image coordinates
  const naturalX = imageX / scale;
  const naturalY = imageY / scale;
  
  // Convert to grid slot
  return pixelToSlot(naturalX, naturalY, grid);
}

/**
 * Convert pixel coordinates (in natural image space) to grid slot
 * 
 * @param px - Pixel X coordinate
 * @param py - Pixel Y coordinate
 * @param grid - Computed grid data
 * @returns Grid slot {x, y} or null if outside grid
 */
export function pixelToSlot(
  px: number,
  py: number,
  grid: ComputedGrid
): { x: number; y: number } | null {
  // Get the first cell to determine grid start position
  const firstCell = grid.cells[0];
  if (!firstCell) return null;
  
  const gridStartX = firstCell.x;
  const gridStartY = firstCell.y;
  
  // Calculate slot position
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
