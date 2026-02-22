import { createContext, useContext, useState, ReactNode } from 'react';

interface GameState {
  currentWorldId: string | null;
  setCurrentWorldId: (worldId: string | null) => void;
}

const GameContext = createContext<GameState | undefined>(undefined);

export function GameProvider({ children }: { children: ReactNode }) {
  const [currentWorldId, setCurrentWorldId] = useState<string | null>(null);

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
