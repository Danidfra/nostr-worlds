import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useWorldStates } from '@/hooks/useWorldStates';
import { useGameContext } from '@/contexts/GameContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Globe } from 'lucide-react';

/**
 * WorldPicker - Inline world selection UI
 * 
 * Shows when no world is selected. Displays a grid of available worlds
 * and allows the user to select one by clicking.
 */
export function WorldPicker() {
  const { user } = useCurrentUser();
  const { data: worlds, isLoading, error } = useWorldStates(user?.pubkey);
  const { setCurrentWorldId } = useGameContext();

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="border-dashed max-w-md">
          <CardContent className="py-12 px-8 text-center">
            <div className="max-w-sm mx-auto space-y-6">
              <p className="text-muted-foreground">
                Please log in to view your worlds.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-full max-w-4xl px-4 space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="border-destructive max-w-md">
          <CardContent className="py-8 px-6 text-center">
            <p className="text-destructive text-sm">
              Failed to load worlds: {error.message}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!worlds || worlds.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="border-dashed max-w-md">
          <CardContent className="py-12 px-8 text-center">
            <div className="max-w-sm mx-auto space-y-6">
              <Globe className="h-16 w-16 mx-auto text-muted-foreground/50" />
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">No Worlds Found</h3>
                <p className="text-sm text-muted-foreground">
                  You haven't created any worlds yet. Publish a WorldState event (kind 31415) to get started.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-2">Select a World</h2>
          <p className="text-muted-foreground">
            Choose a world to explore
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {worlds.map((world) => (
            <Card
              key={world.id}
              className="cursor-pointer transition-all hover:shadow-lg hover:scale-105 active:scale-100"
              onClick={() => setCurrentWorldId(world.id)}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{world.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="capitalize px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                    {world.type}
                  </span>
                  {world.season && (
                    <span className="capitalize px-2 py-1 bg-muted text-xs rounded">
                      {world.season}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="truncate">
                    <span className="font-medium">Entry Map:</span> {world.entryMap}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
