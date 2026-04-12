"use client";

import { useState, useCallback } from "react";
import { RefreshCw, Clock, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EntrantRow } from "./EntrantRow";
import { LiveLeaderboard } from "./LiveLeaderboard";
import { HypotheticalLeaderboard } from "./HypotheticalLeaderboard";
import { UploadSheet } from "./UploadSheet";
import { usePoolData } from "@/hooks/usePoolData";
import { useLiveOdds } from "@/hooks/useLiveOdds";
import { usePurse } from "@/hooks/usePurse";
import { triggerRefresh } from "@/lib/api";
import { formatLastRefreshed } from "@/lib/format";
import type { EntrantLeaderboardRow, EventListItem } from "@/lib/schemas";

interface PoolViewProps {
  poolType: "marshalek" | "piper";
  events: EventListItem[];
}

/**
 * Compute scenario earnings for every entrant given a hypothetical order.
 * order is an array of "slots" — each slot is a tie group of 1+ players.
 * Multi-player slots split the pooled payouts evenly (just like real tie rules).
 */
function calcScenarioEarnings(
  entrants: EntrantLeaderboardRow[],
  order: string[][],
  purseMap: Record<number, number>,
): Map<number, number> {
  // Map each player name → their average payout in this scenario
  const earningsOf: Record<string, number> = {};
  let pos = 1;
  for (const slot of order) {
    const total = slot.reduce((sum, _, i) => sum + (purseMap[pos + i] ?? 0), 0);
    const avg = slot.length > 0 ? total / slot.length : 0;
    for (const name of slot) {
      earningsOf[name.toLowerCase()] = avg;
    }
    pos += slot.length;
  }

  const result = new Map<number, number>();
  for (const entrant of entrants) {
    let total = 0;
    for (const pick of entrant.picks) {
      total += earningsOf[pick.golfer_name.toLowerCase()] ?? 0;
    }
    result.set(entrant.entrant_id, total);
  }
  return result;
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

  // Hypothetical mode — order is an array of tie-slots (1+ players per slot)
  const [hypotheticalMode, setHypotheticalMode] = useState(false);
  const [hypotheticalOrder, setHypotheticalOrder] = useState<string[][]>([]);

  const { leaderboard, isLoading, error, refresh } = usePoolData(selectedEventId, poolType);
  const { liveOdds } = useLiveOdds(selectedEventId);
  const { purse } = usePurse(selectedEventId);

  const purseMap: Record<number, number> = {};
  if (purse) purse.forEach((p) => { purseMap[p.position] = p.amount_usd; });

  const scenarioMap =
    hypotheticalMode && leaderboard && hypotheticalOrder.length > 0
      ? calcScenarioEarnings(leaderboard.entrants, hypotheticalOrder, purseMap)
      : null;

  const sortedEntrants = leaderboard
    ? [...leaderboard.entrants].sort((a, b) => {
        if (scenarioMap) {
          return (scenarioMap.get(b.entrant_id) ?? 0) - (scenarioMap.get(a.entrant_id) ?? 0);
        }
        return b.projected_earnings - a.projected_earnings;
      })
    : [];

  function toggleHypothetical() {
    if (hypotheticalMode) {
      setHypotheticalMode(false);
      setHypotheticalOrder([]);
      return;
    }
    // Seed from current live positions, grouping tied players into the same slot
    const players = liveOdds?.players ?? [];
    const withPos = [...players]
      .filter((p) => p.current_pos != null)
      .sort((a, b) => (a.current_pos ?? 999) - (b.current_pos ?? 999));
    const noPos = players.filter((p) => p.current_pos == null);

    // Group consecutive players at the same position into tie slots
    const slots: string[][] = [];
    for (const p of withPos) {
      const last = slots[slots.length - 1];
      const lastPos = withPos.find((x) => x.normalized_name === last?.[0])?.current_pos;
      if (last && lastPos === p.current_pos) {
        last.push(p.normalized_name);
      } else {
        slots.push([p.normalized_name]);
      }
    }
    // Players with no position get their own slot at the end
    for (const p of noPos) {
      slots.push([p.normalized_name]);
    }
    setHypotheticalOrder(slots);
    setHypotheticalMode(true);
  }

  const handleOrderChange = useCallback((order: string[][]) => {
    setHypotheticalOrder(order);
  }, []);

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
            {poolEvents.length > 1 ? (
              <select
                value={selectedEventId ?? ""}
                onChange={(e) => setSelectedEventId(Number(e.target.value))}
                className="text-sm bg-secondary border border-border/40 rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {poolEvents.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-muted-foreground">
                {activeEvent?.name ?? "No events"}
              </span>
            )}
            {leaderboard?.last_refreshed && !hypotheticalMode && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                <Clock className="w-3 h-3" />
                {formatLastRefreshed(leaderboard.last_refreshed)}
              </span>
            )}
            {hypotheticalMode && (
              <span className="text-xs text-amber-400/80 font-medium">
                Hypothetical · drag golfers to simulate
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {selectedEventId && !hypotheticalMode && (
              <UploadSheet eventId={selectedEventId} poolType={poolType} onSuccess={refresh} />
            )}
            <Button
              variant="outline"
              size="sm"
              className={`gap-1.5 text-xs ${
                hypotheticalMode
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30"
                  : ""
              }`}
              onClick={toggleHypothetical}
              disabled={!selectedEventId || !liveOdds}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              {hypotheticalMode ? "Exit Hypothetical" : "Hypothetical"}
            </Button>
            {!hypotheticalMode && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={handleRefresh}
                disabled={isRefreshing || !selectedEventId}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            )}
          </div>
        </div>

        {isLoading && <LeaderboardSkeleton />}

        {error && (
          <Alert variant="destructive" className="text-sm">
            <AlertDescription>Failed to load leaderboard: {error.message}</AlertDescription>
          </Alert>
        )}

        {!isLoading && !error && leaderboard && (
          <div className="rounded-lg border border-border/40 overflow-hidden">
            {sortedEntrants.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                No picks loaded yet. Upload a picks sheet to get started.
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-secondary/40 text-muted-foreground border-b border-border/40">
                    <th className="py-2 px-2 w-6" />
                    <th className="py-2 px-2 text-left text-xs font-semibold uppercase tracking-wide w-8">#</th>
                    <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide">Entrant</th>
                    <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-wide">
                      {hypotheticalMode
                        ? <span className="text-amber-400">Scenario $</span>
                        : "Proj. $"}
                    </th>
                    {!hypotheticalMode && (
                      <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                        Live $
                      </th>
                    )}
                    <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-wide">Odds to Win</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEntrants.map((entrant, idx) => (
                    <EntrantRow
                      key={entrant.entrant_id}
                      rank={idx + 1}
                      entrant={entrant}
                      poolType={poolType}
                      scenarioEarnings={scenarioMap?.get(entrant.entrant_id)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Sidebar */}
      {selectedEventId && (
        <div className="w-72 shrink-0">
          <div className="rounded-lg border border-border/40 overflow-hidden">
            <div className={`px-4 py-2.5 border-b border-border/40 ${hypotheticalMode ? "bg-amber-500/10" : "bg-secondary/30"}`}>
              <h3 className={`text-xs font-semibold uppercase tracking-wide ${hypotheticalMode ? "text-amber-400" : "text-muted-foreground"}`}>
                {hypotheticalMode ? "Hypothetical Order" : "Tournament"}
              </h3>
            </div>
            {hypotheticalMode && liveOdds ? (
              <HypotheticalLeaderboard
                players={liveOdds.players}
                order={hypotheticalOrder}
                onOrderChange={handleOrderChange}
              />
            ) : (
              <LiveLeaderboard eventId={selectedEventId} />
            )}
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
