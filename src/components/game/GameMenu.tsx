import { useState } from 'react';
import { LogOut, Globe, Settings, ChevronLeft } from 'lucide-react';
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
import { WorldsList } from './WorldsList';

interface GameMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

type MenuView = 'main' | 'worlds' | 'settings';

export function GameMenu({ isOpen, onClose }: GameMenuProps) {
  const { user } = useCurrentUser();
  const { logout } = useLoginActions();
  const [currentView, setCurrentView] = useState<MenuView>('main');

  const handleLogout = () => {
    logout();
    onClose();
  };

  const handleOpenWorlds = () => {
    setCurrentView('worlds');
  };

  const handleBack = () => {
    setCurrentView('main');
  };

  // Reset view when menu closes
  const handleClose = () => {
    setCurrentView('main');
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-96 flex flex-col">
        <SheetHeader>
          <div className="flex items-center gap-2">
            {currentView !== 'main' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBack}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1">
              <SheetTitle>
                {currentView === 'main' && 'Menu'}
                {currentView === 'worlds' && 'Worlds'}
                {currentView === 'settings' && 'Settings'}
              </SheetTitle>
              <SheetDescription>
                {currentView === 'main' && 'Game settings and options'}
                {currentView === 'worlds' && 'Select a world to explore'}
                {currentView === 'settings' && 'Configure your preferences'}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Main Menu */}
        {currentView === 'main' && (
          <div className="mt-6 space-y-2 flex-1">
            <div className="space-y-2">
              {/* Worlds */}
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-12 px-4"
                onClick={handleOpenWorlds}
                disabled={!user}
              >
                <Globe className="h-5 w-5" />
                <span className="text-base">Worlds</span>
              </Button>

              {/* Settings - Placeholder */}
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-12 px-4"
                onClick={() => setCurrentView('settings')}
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
          </div>
        )}

        {/* Worlds View */}
        {currentView === 'worlds' && (
          <div className="mt-6 flex-1 overflow-hidden">
            <WorldsList />
          </div>
        )}

        {/* Settings View - Placeholder */}
        {currentView === 'settings' && (
          <div className="mt-6 flex-1">
            <p className="text-sm text-muted-foreground text-center">
              Settings coming soon...
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
