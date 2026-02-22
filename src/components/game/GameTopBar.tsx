import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { genUserName } from '@/lib/genUserName';

interface GameTopBarProps {
  onMenuClick: () => void;
  disabled?: boolean;
}

export function GameTopBar({ onMenuClick, disabled }: GameTopBarProps) {
  const { user, metadata } = useCurrentUser();
  
  const displayName = user ? (metadata?.name ?? genUserName(user.pubkey)) : '';
  const shortPubkey = user ? `${user.pubkey.slice(0, 8)}...${user.pubkey.slice(-8)}` : '';

  return (
    <div className="h-14 border-b border-white/20 dark:border-black/20 bg-white/30 dark:bg-black/20 backdrop-blur-sm flex items-center justify-between px-4">
      {/* App Name */}
      <div className="flex items-center gap-2">
        <span className="text-2xl">🌾</span>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">
          Nostr Farm
        </h1>
      </div>

      {/* User Info & Menu */}
      <div className="flex items-center gap-3">
        {user && (
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {displayName}
            </span>
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {shortPubkey}
            </span>
          </div>
        )}
        
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          disabled={disabled}
          className="text-gray-900 dark:text-white hover:bg-white/50 dark:hover:bg-black/50"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
