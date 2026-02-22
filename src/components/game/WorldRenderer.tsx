import { useEffect, useRef, useState } from 'react';

/**
 * WorldRenderer - Placeholder component for the game world
 * 
 * This component renders a mock grid to demonstrate the full-screen canvas area.
 * In the future, this will be replaced with actual game rendering logic.
 */
export function WorldRenderer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Track container size for responsive rendering
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateDimensions();
    
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Calculate grid dimensions
  const cellSize = 64; // px per cell
  const cols = Math.ceil(dimensions.width / cellSize);
  const rows = Math.ceil(dimensions.height / cellSize);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      {/* Mock Grid Background */}
      <div className="absolute inset-0 opacity-20">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="grid"
              width={cellSize}
              height={cellSize}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${cellSize} 0 L 0 0 0 ${cellSize}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="text-gray-400 dark:text-gray-600"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Placeholder Content */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center space-y-4 p-8 bg-white/50 dark:bg-black/50 backdrop-blur-sm rounded-2xl border border-white/50 dark:border-black/50">
          <div className="text-6xl">🚜</div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              World Renderer
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
              This is a placeholder for the game world. The actual rendering engine will be implemented here.
            </p>
            <div className="pt-2 text-xs text-gray-500 dark:text-gray-500 space-y-1">
              <div>Canvas Size: {dimensions.width} × {dimensions.height}px</div>
              <div>Grid Cells: {cols} × {rows}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
