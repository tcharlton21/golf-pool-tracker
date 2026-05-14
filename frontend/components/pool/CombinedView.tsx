"use client";

import { useState } from "react";
import { RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveLeaderboard } from "./LiveLeaderboard";
import { usePoolData } from "@/hooks/usePoolData";
import { useLiveOdds } from "@/hooks/useLiveOdds";
import { triggerRefresh } from "@/lib/api";
import {
  formatMoney,
  formatLastRefreshed,
  formatPos,
  formatScore,
  scoreColorClass,
} from "@/lib/format";
import type { EventListItem, EntrantLeaderboardRow } from "@/lib/schemas";

interface CombinedViewProps {
  events: EventListItem[];
}

interface MyStanding {
  entrant: EntrantLeaderboardRow;
  rank: number;
  total: number;
}

export function CombinedView({ events }: CombinedViewProps) {
  const activeEvent = events.find((e) => e.is_active) ?? events[0] ?? null;
  const [selectedEventId, setSelectedEventId] = useState<number | null>(
    activeEvent?.id ?? null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { leaderboard: marshalek, refresh: refreshMarshalek } = usePoolData(
    selectedEventId,
    "marshalek",
  );
  const { leaderboard: piper, refresh: refreshPiper } = usePoolData(
    selectedEventId,
    "piper",
  );
  const { refresh: refreshLiveOdds } = useLiveOdds(selectedEventId);

  const meName = (
    process.env.NEXT_PUBLIC_MY_ENTRANT_NAME ?? "Trent Charlton"
  ).toLowerCase();

  function findMe(lb: typeof marshalek): MyStanding | null {
    if (!lb || lb.entrants.length === 0) return null;
    const sorted = [...lb.entrants].sort(
      (a, b) => b.current_earnings - a.current_earnings,
    );
    const idx = sorted.findIndex((e) => e.name.toLowerCase() === meName);
    if (idx < 0) return null;
    return { entrant: sorted[idx], rank: idx + 1, total: sorted.length };
  }

  const myMarshalek = findMe(marshalek);
  const myPiper = findMe(piper);

  const myPickNames = Array.from(
    new Set([
      ...(myMarshalek?.entrant.picks.map((p) => p.golfer_name) ?? []),
      ...(myPiper?.entrant.picks.map((p) => p.golfer_name) ?? []),
    ]),
  );

  const lastRefreshed =
    marshalek?.last_refreshed ?? piper?.last_refreshed ?? null;

  async function handleRefresh() {
    if (!selectedEventId) return;
    setIsRefreshing(true);
    try {
      await triggerRefresh(selectedEventId);
      refreshMarshalek();
      refreshPiper();
      refreshLiveOdds();
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {events.length > 1 ? (
            <select
              value={selectedEventId ?? ""}
              onChange={(e) => setSelectedEventId(Number(e.target.value))}
              className="text-sm bg-secondary border border-border/40 rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-muted-foreground truncate">
              {activeEvent?.name ?? "No events"}
            </span>
          )}
          {lastRefreshed && (
            <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground/60">
              <Clock className="w-3 h-3" />
              {formatLastRefreshed(lastRefreshed)}
            </span>
          )}
        </div>
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
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <div className="flex-1 min-w-0 space-y-3">
          <MyPoolCard label="Marshalek" my={myMarshalek} />
          <MyPoolCard label="Piper" my={myPiper} />
        </div>
        {selectedEventId && (
          <div className="md:w-[30%] md:shrink-0">
            <div className="rounded-lg border border-border/40 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border/40 bg-secondary/30">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tournament
                </h3>
              </div>
              <LiveLeaderboard
                eventId={selectedEventId}
                myPickNames={myPickNames}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MyPoolCard({
  label,
  my,
}: {
  label: string;
  my: MyStanding | null;
}) {
  if (!my) {
    return (
      <div className="rounded-lg border border-border/40 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          {label}
        </div>
        <div className="text-sm text-muted-foreground">Not entered.</div>
      </div>
    );
  }
  const { entrant, rank, total } = my;
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/40 bg-secondary/30 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </h3>
        <div className="text-xs text-muted-foreground tabular-nums">
          Rank{" "}
          <span className="text-foreground font-medium">{rank}</span>
          <span className="text-muted-foreground/60">/{total}</span>
        </div>
      </div>
      <div className="px-4 py-3 flex items-center gap-6 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Live $
          </div>
          <div className="font-semibold tabular-nums">
            {formatMoney(entrant.current_earnings)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Proj $
          </div>
          <div className="font-semibold tabular-nums text-muted-foreground">
            {formatMoney(entrant.projected_earnings)}
          </div>
        </div>
      </div>
      <table className="w-full text-xs border-t border-border/30">
        <tbody>
          {[...entrant.picks]
            .sort(
              (a, b) =>
                (a.current_pos ?? 9999) - (b.current_pos ?? 9999),
            )
            .map((p) => (
              <tr
                key={p.golfer_name}
                className="border-b border-border/15 last:border-0"
              >
                <td className="py-1.5 px-3 w-10 text-muted-foreground tabular-nums">
                  {formatPos(p.current_pos)}
                </td>
                <td className="py-1.5 px-3 text-primary font-medium">
                  {p.golfer_name}
                </td>
                <td
                  className={`py-1.5 px-2 text-center w-14 tabular-nums font-medium ${scoreColorClass(p.current_score)}`}
                >
                  {formatScore(p.current_score)}
                </td>
                <td className="py-1.5 px-2 text-center w-12 text-muted-foreground tabular-nums">
                  {p.thru ?? "—"}
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                  {formatMoney(p.current_earnings_contribution)}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
