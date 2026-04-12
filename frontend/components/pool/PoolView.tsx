"use client";

import { useState } from "react";
import { RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EntrantRow } from "./EntrantRow";
import { LiveLeaderboard } from "./LiveLeaderboard";
import { UploadSheet } from "./UploadSheet";
import { usePoolData } from "@/hooks/usePoolData";
import { triggerRefresh } from "@/lib/api";
import { formatLastRefreshed } from "@/lib/format";
import type { EventListItem } from "@/lib/schemas";

interface PoolViewProps {
  poolType: "marshalek" | "piper";
  events: EventListItem[];
}

export function PoolView({ poolType, events }: PoolViewProps) {
  const poolEvents = events.filter(
    (e) => e.pool_type === poolType || e.pool_type === "both",
  );

  const activeEvent = poolEvents.find((e) => e.is_active) ?? poolEvents[0] ?? null;
  const [selectedEventId, setSelectedEventId] = useState<number | null>(
    activeEvent?.id ?? null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { leaderboard, isLoading, error, refresh } = usePoolData(
    selectedEventId,
    poolType,
  );

  async function handleRefresh() {
    if (!selectedEventId) return;
    setIsRefreshing(true);
    try {
      await triggerRefresh(selectedEventId);
      refresh();
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="flex gap-4 min-h-0 flex-1">
      {/* Main leaderboard */}
      <div className="flex-1 min-w-0">
        {/* Header bar */}
        <div className="flex items-center justify-between mb-3 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* Event selector */}
            {poolEvents.length > 1 ? (
              <select
                value={selectedEventId ?? ""}
                onChange={(e) => setSelectedEventId(Number(e.target.value))}
                className="text-sm bg-secondary border border-border/40 rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {poolEvents.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-muted-foreground">
                {activeEvent?.name ?? "No events"}
              </span>
            )}

            {leaderboard?.last_refreshed && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                <Clock className="w-3 h-3" />
                {formatLastRefreshed(leaderboard.last_refreshed)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {selectedEventId && (
              <UploadSheet
                eventId={selectedEventId}
                poolType={poolType}
                onSuccess={refresh}
              />
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={handleRefresh}
              disabled={isRefreshing || !selectedEventId}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              />
              Refresh Odds
            </Button>
          </div>
        </div>

        {/* Leaderboard table */}
        {isLoading && <LeaderboardSkeleton />}

        {error && (
          <Alert variant="destructive" className="text-sm">
            <AlertDescription>
              Failed to load leaderboard: {error.message}
            </AlertDescription>
          </Alert>
        )}

        {!isLoading && !error && leaderboard && (
          <div className="rounded-lg border border-border/40 overflow-hidden">
            {leaderboard.entrants.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No picks loaded yet. Upload a picks sheet to get started.
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-secondary/40 text-muted-foreground border-b border-border/40">
                    <th className="py-2 px-2 w-6" />
                    <th className="py-2 px-2 text-left text-xs font-semibold uppercase tracking-wide w-8">
                      #
                    </th>
                    <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide">
                      Entrant
                    </th>
                    <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-wide">
                      Proj. $
                    </th>
                    <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-wide">
                      Live $
                    </th>
                    <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-wide">
                      Win Odds
                    </th>
                    <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-wide">
                      Edge
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.entrants.map((entrant, idx) => (
                    <EntrantRow
                      key={entrant.entrant_id}
                      rank={idx + 1}
                      entrant={entrant}
                      poolType={poolType}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Live leaderboard sidebar */}
      {selectedEventId && (
        <div className="w-72 shrink-0">
          <div className="rounded-lg border border-border/40 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/40 bg-secondary/30">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tournament
              </h3>
            </div>
            <LiveLeaderboard eventId={selectedEventId} />
          </div>
        </div>
      )}
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      <div className="p-3 border-b border-border/40 bg-secondary/40">
        <Skeleton className="h-4 w-48" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="px-4 py-3 border-b border-border/20">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-32" />
            <div className="ml-auto flex gap-4">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
