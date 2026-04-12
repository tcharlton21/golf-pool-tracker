"use client";

import { PoolView } from "@/components/pool/PoolView";
import { useEvents } from "@/hooks/useEvents";
import { Skeleton } from "@/components/ui/skeleton";

export default function MarshalekPage() {
  const { events, isLoading } = useEvents();

  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-6 py-3 border-b border-border/30 bg-card/50 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-wide text-foreground">
            Golf Pool Tracker
          </span>
          <span className="text-muted-foreground/30 text-xs">|</span>
          <span className="text-xs text-muted-foreground">Marshalek Pool</span>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 flex flex-col min-h-0">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <PoolView poolType="marshalek" events={events} />
        )}
      </main>
    </div>
  );
}
