import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { setLastWorldId } from '@/lib/storage/worldSettings';

interface GameState {
  currentWorldId: string | null;
  setCurrentWorldId: (worldId: string | null) => void;
}

const GameContext = createContext<GameState | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [currentWorldId, setCurrentWorldIdState] = useState<string | null>(null);

  // Persist world selection to localStorage whenever it changes
  useEffect(() => {
    setLastWorldId(currentWorldId);
  }, [currentWorldId]);

  const setCurrentWorldId = (worldId: string | null) => {
    setCurrentWorldIdState(worldId);
  };

  return (
    <GameContext.Provider value={{ currentWorldId, setCurrentWorldId }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGameContext() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
}
