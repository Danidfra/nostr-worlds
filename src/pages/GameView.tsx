import { useSeoMeta } from '@unhead/react';
import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useWorldStates } from '@/hooks/useWorldStates';
import { useGameContext } from '@/contexts/GameContext';
import { getLastWorldId, getAutoOpenLastWorld } from '@/lib/storage/worldSettings';
import LoginDialog from '@/components/auth/LoginDialog';
import { GameTopBar } from '@/components/game/GameTopBar';
import { GameMenu } from '@/components/game/GameMenu';
import { WorldRenderer } from '@/components/game/WorldRenderer';

const GameView = () => {
  useSeoMeta({
    title: 'Nostr Farm',
    description: 'A decentralized farming game on Nostr',
  });

  const { user } = useCurrentUser();
  const { data: worlds, isLoading: isLoadingWorlds } = useWorldStates(user?.pubkey);
  const { currentWorldId, setCurrentWorldId } = useGameContext();
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Show login dialog if user is not logged in
  useEffect(() => {
    if (!user) {
      setIsLoginOpen(true);
    } else {
      setIsLoginOpen(false);
    }
  }, [user]);

  // Auto-open world logic
  useEffect(() => {
    // Only run after worlds are loaded and no world is currently selected
    if (!user || isLoadingWorlds || !worlds || currentWorldId) return;

    const autoOpenEnabled = getAutoOpenLastWorld();
    const lastWorldId = getLastWorldId();

    // Case 1: User has exactly 1 world → auto-open it
    if (worlds.length === 1) {
      setCurrentWorldId(worlds[0].id);
      return;
    }

    // Case 2: User has multiple worlds and auto-open is enabled
    if (worlds.length > 1 && autoOpenEnabled && lastWorldId) {
      // Check if the last world still exists
      const lastWorldExists = worlds.some((w) => w.id === lastWorldId);
      if (lastWorldExists) {
        setCurrentWorldId(lastWorldId);
      } else {
        // Fallback: open the first world if last world doesn't exist
        setCurrentWorldId(worlds[0].id);
      }
    }
  }, [user, worlds, isLoadingWorlds, currentWorldId, setCurrentWorldId]);

  const handleLoginSuccess = () => {
    setIsLoginOpen(false);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-gradient-to-b from-sky-300 to-green-200 dark:from-sky-900 dark:to-green-950">
      {/* Top Bar */}
      <GameTopBar 
        onMenuClick={() => setIsMenuOpen(true)}
        disabled={!user}
      />

      {/* World Renderer - Full Screen */}
      <div className="flex-1 relative overflow-hidden">
        <WorldRenderer />
      </div>

      {/* Login Dialog - Modal Overlay */}
      <LoginDialog
        isOpen={isLoginOpen}
        onClose={() => {
          // Don't allow closing if not logged in
          if (user) {
            setIsLoginOpen(false);
          }
        }}
        onLogin={handleLoginSuccess}
      />

      {/* Game Menu Drawer */}
      <GameMenu 
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
      />
    </div>
  );
};

export default GameView;
