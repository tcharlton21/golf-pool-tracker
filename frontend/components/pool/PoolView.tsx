"use client";

import { useState, useCallback } from "react";
import { RefreshCw, Clock, FlaskConical, Info, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EntrantRow } from "./EntrantRow";
import { LiveLeaderboard } from "./LiveLeaderboard";
import { HypotheticalLeaderboard } from "./HypotheticalLeaderboard";
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

function calcScenarioEarnings(
  entrants: EntrantLeaderboardRow[],
  order: string[][],
  purseMap: Record<number, number>,
): Map<number, number> {
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
  const [hypotheticalMode, setHypotheticalMode] = useState(false);
  const [hypotheticalOrder, setHypotheticalOrder] = useState<string[][]>([]);
  const [sortBy, setSortBy] = useState<"live" | "projected">("live");
  // Mobile-only tab: "pool" or "tournament" (ignored on desktop)
  const [mobileTab, setMobileTab] = useState<"pool" | "tournament">("pool");

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
        if (sortBy === "live") return b.current_earnings - a.current_earnings;
        return b.projected_earnings - a.projected_earnings;
      })
    : [];

  function toggleHypothetical() {
    if (hypotheticalMode) {
      setHypotheticalMode(false);
      setHypotheticalOrder([]);
      return;
    }
    const players = liveOdds?.players ?? [];
    const withPos = [...players]
      .filter((p) => p.current_pos != null)
      .sort((a, b) => (a.current_pos ?? 999) - (b.current_pos ?? 999));
    const noPos = players.filter((p) => p.current_pos == null);
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
    for (const p of noPos) slots.push([p.normalized_name]);
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

  // ── Shared header bar ────────────────────────────────────────────────────
  const headerBar = (
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
          <span className="text-sm text-muted-foreground truncate">
            {activeEvent?.name ?? "No events"}
          </span>
        )}
        {leaderboard?.last_refreshed && !hypotheticalMode && (
          <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground/60">
            <Clock className="w-3 h-3" />
            {formatLastRefreshed(leaderboard.last_refreshed)}
          </span>
        )}
        {hypotheticalMode && (
          <span className="hidden sm:block text-xs text-amber-400/80 font-medium">
            Hypothetical · drag to simulate
          </span>
        )}
      </div>

      {/* Buttons always top-right */}
      <div className="flex items-center gap-2 shrink-0">
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
          <span className="hidden sm:inline">{hypotheticalMode ? "Exit Hypothetical" : "Hypothetical"}</span>
          <span className="sm:hidden">{hypotheticalMode ? "Exit" : "Hypothetical"}</span>
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
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        )}
      </div>
    </div>
  );

  // ── Mobile tab bar (hidden on md+) ───────────────────────────────────────
  const mobileTabBar = !hypotheticalMode && (
    <div className="flex md:hidden border-b border-border/40 mb-3 -mx-1">
      {(["pool", "tournament"] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setMobileTab(tab)}
          className={`flex-1 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
            mobileTab === tab
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground"
          }`}
        >
          {tab === "pool" ? "Pool" : "Tournament"}
        </button>
      ))}
    </div>
  );

  // ── Pool leaderboard table ───────────────────────────────────────────────
  const poolLeaderboard = (
    <>
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
              No picks loaded yet.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-secondary/40 text-muted-foreground border-b border-border/40">
                  <th className="py-2 px-2 w-6" />
                  <th className="py-2 px-2 text-left text-xs font-semibold uppercase tracking-wide w-8">#</th>
                  <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide">Entrant</th>
                  {hypotheticalMode ? (
                    <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-wide">
                      <span className="text-amber-400">Scenario $</span>
                    </th>
                  ) : (
                    <>
                      <SortableColHeader
                        label="Live $"
                        active={sortBy === "live"}
                        onClick={() => setSortBy("live")}
                        tooltip="What each entrant would earn if the tournament ended right now. Ties split the pooled payouts evenly."
                      />
                      <SortableColHeader
                        label="Proj. $"
                        active={sortBy === "projected"}
                        onClick={() => setSortBy("projected")}
                        tooltip="Probability-weighted expected earnings based on DataGolf's win%, top-5%, top-10%, and top-20% projections."
                        muted
                      />
                    </>
                  )}
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
                    sortBy={sortBy}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );

  // ── Sidebar panel (tournament or hypothetical) ───────────────────────────
  const sidebarContent = (
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
        selectedEventId && <LiveLeaderboard eventId={selectedEventId} />
      )}
    </div>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {headerBar}
      {mobileTabBar}

      {hypotheticalMode ? (
        // ── Hypothetical mode ──────────────────────────────────────────────
        // Mobile: full-width drag panel only
        // Desktop: pool leaderboard (left) + drag panel (right sidebar)
        <div className="flex gap-4 flex-1 min-h-0">
          <div className="hidden md:block flex-1 min-w-0">
            {poolLeaderboard}
          </div>
          {/* Mobile hint */}
          <div className="flex-1 md:flex-none md:w-72 md:shrink-0 flex flex-col gap-2">
            <div className="md:hidden text-xs text-amber-400/80 font-medium">
              Drag to reorder · scenario updates live
            </div>
            {sidebarContent}
          </div>
        </div>
      ) : (
        // ── Normal mode ────────────────────────────────────────────────────
        // Mobile: one pane at a time (controlled by mobileTab)
        // Desktop: pool leaderboard (left) + tournament sidebar (right)
        <div className="flex gap-4 flex-1 min-h-0">
          <div className={`flex-1 min-w-0 ${mobileTab === "tournament" ? "hidden md:block" : ""}`}>
            {poolLeaderboard}
          </div>
          {selectedEventId && (
            <div className={`md:w-72 md:shrink-0 ${mobileTab === "pool" ? "hidden md:block" : "flex-1"}`}>
              {sidebarContent}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SortableColHeaderProps {
  label: string;
  active: boolean;
  onClick: () => void;
  tooltip: string;
  muted?: boolean;
}

function SortableColHeader({ label, active, onClick, tooltip, muted }: SortableColHeaderProps) {
  return (
    <th className="py-2 px-3 text-right text-xs font-semibold uppercase tracking-wide">
      <div className="inline-flex items-center justify-end gap-1 group/col">
        <button
          onClick={onClick}
          className={`flex items-center gap-0.5 hover:text-foreground transition-colors ${
            active ? "text-foreground" : muted ? "text-muted-foreground/60" : "text-muted-foreground"
          }`}
        >
          {label}
          <ChevronDown className={`w-3 h-3 transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
        </button>
        <div className="relative">
          <Info className="w-3 h-3 text-muted-foreground/40 hover:text-muted-foreground/80 cursor-help" />
          <div className="absolute top-full right-0 mt-2 w-56 p-2 rounded bg-popover border border-border/60 text-xs text-muted-foreground font-normal normal-case tracking-normal text-left shadow-lg opacity-0 pointer-events-none group-hover/col:opacity-100 transition-opacity z-[100] leading-relaxed">
            {tooltip}
          </div>
        </div>
      </div>
    </th>
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
