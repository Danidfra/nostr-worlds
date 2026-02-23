import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { CropsMetadata } from '@/lib/nostr/types';

interface SeedSelectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  crops: CropsMetadata | null;
  renderpackUrl: string;
  tileSize: number;
  onSelectSeed: (cropId: string) => void;
}

/**
 * SeedSelectDialog - Modal for selecting which seed to plant
 * 
 * Shows available crops from renderpack.crops with preview sprites
 */
export function SeedSelectDialog({
  isOpen,
  onClose,
  crops,
  renderpackUrl,
  tileSize,
  onSelectSeed,
}: SeedSelectDialogProps) {
  const handleSelectSeed = (cropId: string) => {
    onSelectSeed(cropId);
    onClose();
  };

  // Get crop entries from dictionary
  const cropEntries = crops?.crops ? Object.entries(crops.crops) : [];

  if (cropEntries.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Plant Seed</DialogTitle>
            <DialogDescription>
              No seeds available in this renderpack.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plant Seed</DialogTitle>
          <DialogDescription>
            Select a seed to plant in this spot
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {cropEntries.map(([cropId, cropMeta]) => (
              <button
                key={cropId}
                onClick={() => handleSelectSeed(cropId)}
                className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-muted hover:border-primary hover:bg-accent transition-colors"
              >
                {/* Crop sprite preview (harvest/ready frame) */}
                <CropPreview
                  file={cropMeta.file}
                  stages={cropMeta.stages}
                  harvestStage={cropMeta.harvestStage}
                  renderpackUrl={renderpackUrl}
                  tileSize={tileSize}
                />
                {/* Crop name */}
                <span className="text-sm font-medium capitalize">
                  {cropId.replace(/_/g, ' ')}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/**
 * CropPreview - Renders a scaled crop sprite preview
 * 
 * Shows the harvest/ready frame (not frame 0) with proper scaling
 * to fit in a 64x64 preview box while maintaining pixelated rendering.
 */
interface CropPreviewProps {
  file: string;
  stages: number;
  harvestStage?: number;
  renderpackUrl: string;
  tileSize: number;
}

function CropPreview({ file, stages, harvestStage, renderpackUrl, tileSize }: CropPreviewProps) {
  // Determine which frame to show (harvest frame or last frame)
  const frameIndex = harvestStage ?? (stages - 1);
  
  // Calculate background position for the correct frame
  const backgroundPositionX = -(frameIndex * tileSize);
  
  // Preview box size (64x64)
  const previewSize = 64;
  
  // Scale factor to fit tileSize into preview box
  const scale = previewSize / tileSize;
  
  return (
    <div
      className="w-16 h-16 overflow-hidden flex items-center justify-center"
      style={{
        imageRendering: 'pixelated',
      }}
    >
      <div
        style={{
          width: tileSize,
          height: tileSize,
          backgroundImage: `url(${renderpackUrl}/${file})`,
          backgroundPosition: `${backgroundPositionX}px 0px`,
          backgroundSize: `${stages * tileSize}px ${tileSize}px`,
          backgroundRepeat: 'no-repeat',
          imageRendering: 'pixelated',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      />
    </div>
  );
}
