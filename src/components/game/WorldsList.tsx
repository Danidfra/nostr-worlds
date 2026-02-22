import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useWorldStates } from '@/hooks/useWorldStates';
import { useGameContext } from '@/contexts/GameContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Globe, ChevronRight } from 'lucide-react';

export function WorldsList() {
  const { user } = useCurrentUser();
  const { data: worlds, isLoading, error } = useWorldStates(user?.pubkey);
  const { currentWorldId, setCurrentWorldId } = useGameContext();

  if (!user) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 px-8 text-center">
          <div className="max-w-sm mx-auto space-y-6">
            <p className="text-muted-foreground">
              Please log in to view your worlds.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-8 px-6 text-center">
          <p className="text-destructive text-sm">
            Failed to load worlds: {error.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!worlds || worlds.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 px-8 text-center">
          <div className="max-w-sm mx-auto space-y-6">
            <Globe className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">No Worlds Found</h3>
              <p className="text-sm text-muted-foreground">
                You haven't created any worlds yet. Publish a WorldState event (kind 31415) to get started.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <ScrollArea className="h-[400px] pr-4">
      <div className="space-y-2">
        {worlds.map((world) => (
          <Card
            key={world.id}
            className={`cursor-pointer transition-all hover:shadow-md ${
              currentWorldId === world.id ? 'border-primary shadow-sm' : ''
            }`}
            onClick={() => setCurrentWorldId(world.id)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg truncate">{world.name}</CardTitle>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span className="capitalize px-2 py-0.5 bg-muted rounded">
                      {world.type}
                    </span>
                    {world.season && (
                      <span className="capitalize px-2 py-0.5 bg-muted rounded">
                        {world.season}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight
                  className={`h-5 w-5 flex-shrink-0 transition-colors ${
                    currentWorldId === world.id ? 'text-primary' : 'text-muted-foreground'
                  }`}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="truncate">
                  <span className="font-medium">Entry Map:</span> {world.entryMap}
                </div>
                <div className="truncate">
                  <span className="font-medium">ID:</span> {world.id}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}
