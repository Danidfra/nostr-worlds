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
                {/* Crop sprite preview (first frame) */}
                <div
                  className="w-16 h-16 flex items-center justify-center"
                  style={{
                    backgroundImage: `url(${renderpackUrl}/${cropMeta.file})`,
                    backgroundPosition: '0px 0px',
                    backgroundSize: `${cropMeta.stages * tileSize}px ${tileSize}px`,
                    backgroundRepeat: 'no-repeat',
                    imageRendering: 'pixelated',
                  }}
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
