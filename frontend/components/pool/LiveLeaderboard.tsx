"use client";

import { useLiveOdds } from "@/hooks/useLiveOdds";
import {
  formatLastRefreshed,
  formatPct,
  formatPos,
  formatScore,
  scoreColorClass,
} from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlayerOdds } from "@/lib/schemas";

interface LiveLeaderboardProps {
  eventId: number;
  myPickNames?: readonly string[];
}

export function LiveLeaderboard({ eventId, myPickNames = [] }: LiveLeaderboardProps) {
  const { liveOdds, isLoading, error } = useLiveOdds(eventId);
  const myPickSet = new Set(myPickNames);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full rounded" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-muted-foreground p-4">
        Live data unavailable
      </p>
    );
  }

  const sortByPos = (a: PlayerOdds, b: PlayerOdds) => {
    if (a.current_pos == null && b.current_pos == null) return 0;
    if (a.current_pos == null) return 1;
    if (b.current_pos == null) return -1;
    return a.current_pos - b.current_pos;
  };

  const allPlayers = (liveOdds?.players ?? []).slice().sort(sortByPos);
  const myPlayers = allPlayers.filter((p) => myPickSet.has(p.normalized_name));
  // Show my picks BOTH pinned at top AND inline in the field, both highlighted
  const players = allPlayers;

  if (players.length === 0) {
    return (
      <p className="text-sm text-muted-foreground p-4 text-center">
        No live data yet. Click Refresh to load.
      </p>
    );
  }

  // Count how many players share each position to determine ties
  const posCounts = new Map<number, number>();
  players.forEach((p) => {
    if (p.current_pos != null) posCounts.set(p.current_pos, (posCounts.get(p.current_pos) ?? 0) + 1);
  });

  return (
    <div className="overflow-auto max-h-[600px]">
      <div className="px-4 pb-1 pt-0 text-xs text-muted-foreground">
        Updated {formatLastRefreshed(liveOdds?.fetched_at)}
      </div>
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="text-muted-foreground border-b border-border/40">
            <th className="py-2 px-3 text-left font-medium w-10">Pos</th>
            <th className="py-2 px-3 text-left font-medium">Player</th>
            <th className="py-2 px-2 text-center font-medium w-12">Score</th>
            <th className="py-2 px-2 text-center font-medium w-10">Thru</th>
            <th className="py-2 px-2 text-right font-medium w-14">Win%</th>
            <th className="py-2 px-2 text-right font-medium w-14">Top5%</th>
          </tr>
        </thead>
        <tbody>
          {myPlayers.length > 0 && (
            <>
              <tr className="bg-primary/5">
                <td colSpan={6} className="py-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                  My Picks
                </td>
              </tr>
              {myPlayers.map((player) => (
                <PlayerRow
                  key={`mine-${player.normalized_name}`}
                  player={player}
                  isTied={(posCounts.get(player.current_pos ?? -1) ?? 0) > 1}
                  isMine
                />
              ))}
              <tr className="bg-secondary/30">
                <td colSpan={6} className="py-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Field
                </td>
              </tr>
            </>
          )}
          {players.map((player) => (
            <PlayerRow
              key={player.normalized_name}
              player={player}
              isTied={(posCounts.get(player.current_pos ?? -1) ?? 0) > 1}
              isMine={myPickSet.has(player.normalized_name)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlayerRow({ player, isTied, isMine }: { player: PlayerOdds; isTied: boolean; isMine?: boolean }) {
  const isTopFive = player.current_pos != null && player.current_pos <= 5;
  const isTopTen = player.current_pos != null && player.current_pos <= 10;

  return (
    <tr className={`border-b border-border/20 last:border-0 transition-colors ${isMine ? "bg-primary/10 hover:bg-primary/15" : "hover:bg-secondary/30"}`}>
      <td className="py-1.5 px-3 text-muted-foreground tabular-nums">
        {formatPos(player.current_pos)}
      </td>
      <td
        className={`py-1.5 px-3 ${isMine ? "text-primary font-semibold" : isTopFive ? "text-primary font-medium" : isTopTen ? "text-foreground" : "text-foreground/80"}`}
      >
        {player.normalized_name}
      </td>
      <td
        className={`py-1.5 px-2 text-center tabular-nums font-medium ${scoreColorClass(player.current_score)}`}
      >
        {formatScore(player.current_score)}
      </td>
      <td className="py-1.5 px-2 text-center text-muted-foreground tabular-nums">
        {player.thru ?? "—"}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums">
        {player.win_pct != null ? (
          <span className="text-primary">{formatPct(player.win_pct)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
        {formatPct(player.top5_pct)}
      </td>
    </tr>
  );
}
