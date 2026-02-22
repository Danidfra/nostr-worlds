import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAutoOpenLastWorld, setAutoOpenLastWorld } from '@/lib/storage/worldSettings';

export function GameSettings() {
  const [autoOpenLastWorld, setAutoOpenLastWorldState] = useState(true);

  // Load setting on mount
  useEffect(() => {
    setAutoOpenLastWorldState(getAutoOpenLastWorld());
  }, []);

  const handleToggleAutoOpen = (checked: boolean) => {
    setAutoOpenLastWorldState(checked);
    setAutoOpenLastWorld(checked);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>World Settings</CardTitle>
          <CardDescription>
            Configure how worlds are loaded
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-open-world">Auto-open last world</Label>
              <p className="text-sm text-muted-foreground">
                Automatically open your last selected world when you log in
              </p>
            </div>
            <Switch
              id="auto-open-world"
              checked={autoOpenLastWorld}
              onCheckedChange={handleToggleAutoOpen}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong>Nostr Worlds</strong> - A decentralized farming game on Nostr
          </p>
          <p className="text-xs">
            Built with{' '}
            <a
              href="https://shakespeare.diy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Shakespeare
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
