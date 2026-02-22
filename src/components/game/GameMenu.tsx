import { LogOut, Globe, Settings } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface GameMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GameMenu({ isOpen, onClose }: GameMenuProps) {
  const { user } = useCurrentUser();
  const { logout } = useLoginActions();

  const handleLogout = () => {
    logout();
    onClose();
  };

  const handleMenuItemClick = (action: string) => {
    // Placeholder for future actions
    console.log(`Menu action: ${action}`);
    // onClose(); // Keep menu open for now to show placeholders
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription>
            Game settings and options
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-2">
          {/* Worlds - Placeholder */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-12 px-4"
            onClick={() => handleMenuItemClick('worlds')}
            disabled
          >
            <Globe className="h-5 w-5" />
            <span className="text-base">Worlds</span>
            <span className="ml-auto text-xs text-muted-foreground">Coming Soon</span>
          </Button>

          {/* Settings - Placeholder */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-12 px-4"
            onClick={() => handleMenuItemClick('settings')}
            disabled
          >
            <Settings className="h-5 w-5" />
            <span className="text-base">Settings</span>
            <span className="ml-auto text-xs text-muted-foreground">Coming Soon</span>
          </Button>

          <Separator className="my-4" />

          {/* Logout */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-12 px-4 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
            disabled={!user}
          >
            <LogOut className="h-5 w-5" />
            <span className="text-base">Logout</span>
          </Button>
        </div>

        <div className="absolute bottom-6 left-6 right-6">
          <p className="text-xs text-center text-muted-foreground">
            Vibed with{' '}
            <a
              href="https://shakespeare.diy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Shakespeare
            </a>
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
