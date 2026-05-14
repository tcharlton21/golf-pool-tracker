"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PoolView } from "@/components/pool/PoolView";
import { CombinedView } from "@/components/pool/CombinedView";
import { useEvents } from "@/hooks/useEvents";
import { Skeleton } from "@/components/ui/skeleton";
import { UserMenu } from "@/components/auth/UserMenu";

export default function Home() {
  const { events, isLoading } = useEvents();

  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-6 py-3 border-b border-border/30 bg-card/50 shrink-0">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-wide text-foreground">
              Golf Pool Tracker
            </span>
            <span className="text-muted-foreground/30 text-xs">|</span>
            <span className="text-xs text-muted-foreground">2026 Majors</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-yellow-500/70 font-medium hidden sm:inline">Estimated Payouts, Not Official!</span>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 flex flex-col min-h-0">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <Tabs
            defaultValue="combined"
            className="flex flex-col flex-1 min-h-0"
          >
            <TabsList className="mb-4 self-start bg-secondary/50 h-8">
              <TabsTrigger value="combined" className="text-xs px-4 h-7">
                My Pools
              </TabsTrigger>
              <TabsTrigger value="marshalek" className="text-xs px-4 h-7">
                Marshalek
              </TabsTrigger>
              <TabsTrigger value="piper" className="text-xs px-4 h-7">
                Piper
              </TabsTrigger>
            </TabsList>

            <TabsContent value="combined" className="flex-1 min-h-0 mt-0">
              <CombinedView events={events} />
            </TabsContent>

            <TabsContent value="marshalek" className="flex-1 min-h-0 mt-0">
              <PoolView poolType="marshalek" events={events} />
            </TabsContent>

            <TabsContent value="piper" className="flex-1 min-h-0 mt-0">
              <PoolView poolType="piper" events={events} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
