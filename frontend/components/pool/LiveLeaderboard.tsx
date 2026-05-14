"use client";

import { useState } from "react";
import useSWR from "swr";
import { Star } from "lucide-react";
import { useLiveOdds } from "@/hooks/useLiveOdds";
import { useFavorites } from "@/hooks/useFavorites";
import { fetchPlayerHoles } from "@/lib/api";
import {
  flagEmoji,
  formatLastRefreshed,
  formatPctCompact,
  formatPos,
  formatScore,
  formatShortName,
  probHeatColor,
  winHeatColor,
} from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlayerOdds } from "@/lib/schemas";

interface LiveLeaderboardProps {
  eventId: number;
  myPickNames?: readonly string[];
}

export function LiveLeaderboard({ eventId, myPickNames = [] }: LiveLeaderboardProps) {
  const { liveOdds, isLoading, error } = useLiveOdds(eventId);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { favoriteNames, toggle, canFavorite } = useFavorites(eventId);
  // When logged in, favorites are the source of truth for "My Picks";
  // when logged out, fall back to the externally provided picks list.
  const myPickSet = canFavorite ? favoriteNames : new Set(myPickNames);

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
    return <p className="text-sm text-muted-foreground p-4">Live data unavailable</p>;
  }

  const sortByPos = (a: PlayerOdds, b: PlayerOdds) => {
    if (a.current_pos == null && b.current_pos == null) return 0;
    if (a.current_pos == null) return 1;
    if (b.current_pos == null) return -1;
    return a.current_pos - b.current_pos;
  };

  const allPlayers = (liveOdds?.players ?? []).slice().sort(sortByPos);
  const myPlayers = allPlayers.filter((p) => myPickSet.has(p.normalized_name));

  if (allPlayers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground p-4 text-center">
        No live data yet. Click Refresh to load.
      </p>
    );
  }

  const posCounts = new Map<number, number>();
  allPlayers.forEach((p) => {
    if (p.current_pos != null) posCounts.set(p.current_pos, (posCounts.get(p.current_pos) ?? 0) + 1);
  });

  const onToggle = (name: string) => setExpanded((prev) => (prev === name ? null : name));

  return (
    <div className="overflow-auto max-h-[600px]">
      <div className="px-4 pb-1 pt-0 text-xs text-muted-foreground">
        Updated {formatLastRefreshed(liveOdds?.fetched_at)}
      </div>
      <table className="w-full text-[10px] sm:text-[11px] border-separate border-spacing-0 table-fixed">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="text-muted-foreground border-b border-border/40">
            <th className="py-2 pl-1.5 pr-0.5 text-left font-medium w-[28px]">Pos</th>
            <th className="py-2 px-0.5 text-left font-medium">Player</th>
            <th className="py-2 px-0.5 text-center font-medium w-[36px]">Score</th>
            <th className="py-2 px-0.5 text-center font-medium w-[26px]">Thru</th>
            <th className="py-2 px-0.5 text-center font-medium w-[30px]">Today</th>
            <th className="py-2 px-0.5 text-center font-medium w-[34px]">Cut</th>
            <th className="py-2 px-0.5 text-center font-medium w-[34px]">T20</th>
            <th className="py-2 px-0.5 text-center font-medium w-[34px]">T5</th>
            <th className="py-2 pl-0.5 pr-1.5 text-center font-medium w-[34px]">Win</th>
          </tr>
        </thead>
        <tbody>
          {myPlayers.length > 0 && (
            <>
              <tr className="bg-primary/5">
                <td colSpan={9} className="py-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                  My Picks
                </td>
              </tr>
              {myPlayers.map((player) => (
                <PlayerRowGroup
                  key={`mine-${player.normalized_name}`}
                  player={player}
                  isTied={(posCounts.get(player.current_pos ?? -1) ?? 0) > 1}
                  isMine
                  isFavorite={favoriteNames.has(player.normalized_name)}
                  canFavorite={canFavorite}
                  onToggleFavorite={() => toggle(player.normalized_name)}
                  isExpanded={expanded === `mine-${player.normalized_name}`}
                  onToggle={() => onToggle(`mine-${player.normalized_name}`)}
                  eventId={eventId}
                />
              ))}
              <tr className="bg-secondary/30">
                <td colSpan={9} className="py-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Field
                </td>
              </tr>
            </>
          )}
          {allPlayers.map((player) => (
            <PlayerRowGroup
              key={player.normalized_name}
              player={player}
              isTied={(posCounts.get(player.current_pos ?? -1) ?? 0) > 1}
              isMine={myPickSet.has(player.normalized_name)}
              isFavorite={favoriteNames.has(player.normalized_name)}
              canFavorite={canFavorite}
              onToggleFavorite={() => toggle(player.normalized_name)}
              isExpanded={expanded === player.normalized_name}
              onToggle={() => onToggle(player.normalized_name)}
              eventId={eventId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PlayerRowGroupProps {
  player: PlayerOdds;
  isTied: boolean;
  isMine: boolean;
  isFavorite: boolean;
  canFavorite: boolean;
  onToggleFavorite: () => void;
  isExpanded: boolean;
  onToggle: () => void;
  eventId: number;
}

function PlayerRowGroup({
  player,
  isTied,
  isMine,
  isFavorite,
  canFavorite,
  onToggleFavorite,
  isExpanded,
  onToggle,
  eventId,
}: PlayerRowGroupProps) {
  return (
    <>
      <PlayerRow
        player={player}
        isTied={isTied}
        isMine={isMine}
        isFavorite={isFavorite}
        canFavorite={canFavorite}
        onToggleFavorite={onToggleFavorite}
        isExpanded={isExpanded}
        onClick={onToggle}
      />
      {isExpanded && (
        <tr>
          <td colSpan={9} className="p-0">
            <HoleByHolePanel eventId={eventId} normalizedName={player.normalized_name} />
          </td>
        </tr>
      )}
    </>
  );
}

function PlayerRow({
  player,
  isTied,
  isMine,
  isFavorite,
  canFavorite,
  onToggleFavorite,
  isExpanded,
  onClick,
}: {
  player: PlayerOdds;
  isTied: boolean;
  isMine: boolean;
  isFavorite: boolean;
  canFavorite: boolean;
  onToggleFavorite: () => void;
  isExpanded: boolean;
  onClick: () => void;
}) {
  const rowBg = isExpanded
    ? "bg-secondary/60"
    : isMine
      ? "bg-primary/10 hover:bg-primary/15"
      : "hover:bg-secondary/30";

  return (
    <tr
      onClick={onClick}
      className={`border-b border-border/20 last:border-0 transition-colors cursor-pointer ${rowBg}`}
    >
      <td className="py-1.5 pl-1.5 pr-0.5 text-muted-foreground tabular-nums text-left">
        {formatPos(player.current_pos, isTied)}
      </td>
      <td
        className={`py-1.5 px-0.5 truncate ${isMine ? "text-primary font-semibold" : "text-foreground/85"}`}
      >
        {canFavorite && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            aria-label={isFavorite ? "Unstar" : "Star"}
            className="mr-1 inline-flex align-middle text-muted-foreground/50 hover:text-amber-300 transition-colors"
          >
            <Star
              className="w-3 h-3 sm:w-3.5 sm:h-3.5"
              fill={isFavorite ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={1.75}
              style={isFavorite ? { color: "rgb(252 211 77)" } : undefined}
            />
          </button>
        )}
        <span className="mr-1">{flagEmoji(player.flag)}</span>
        {formatShortName(player.normalized_name)}
      </td>
      <td className="py-1.5 px-0.5 text-center">
        <ScorePill score={player.current_score} />
      </td>
      <td className="py-1.5 px-0.5 text-center text-muted-foreground tabular-nums">
        {player.thru ?? "—"}
        {player.started_back && player.thru && player.thru !== "F" && (
          <span className="text-amber-400/80">*</span>
        )}
      </td>
      <td className="py-1.5 px-0.5 text-center tabular-nums">
        <TodayCell score={player.today_score} hasStarted={player.thru != null} />
      </td>
      <ProbCell pct={player.make_cut_pct} color={probHeatColor(player.make_cut_pct)} />
      <ProbCell pct={player.top20_pct} color={probHeatColor(player.top20_pct)} />
      <ProbCell pct={player.top5_pct} color={probHeatColor(player.top5_pct)} />
      <ProbCell pct={player.win_pct} color={winHeatColor(player.win_pct)} isLast />
    </tr>
  );
}

function ScorePill({ score }: { score: number | null | undefined }) {
  if (score == null) {
    return <span className="text-muted-foreground/60">—</span>;
  }
  const cls =
    score < 0
      ? "bg-rose-500/15 text-rose-300 ring-rose-500/30"
      : score > 0
        ? "bg-blue-500/15 text-blue-300 ring-blue-500/30"
        : "bg-muted text-muted-foreground ring-border/40";
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ring-1 ${cls}`}
    >
      {formatScore(score)}
    </span>
  );
}

function TodayCell({ score, hasStarted }: { score: number | null | undefined; hasStarted: boolean }) {
  if (!hasStarted || score == null) return <span className="text-muted-foreground/60">—</span>;
  const cls = score < 0 ? "text-rose-300" : score > 0 ? "text-blue-300" : "text-muted-foreground";
  return <span className={cls}>{formatScore(score)}</span>;
}

function ProbCell({
  pct,
  color,
  isLast = false,
}: {
  pct: number | null | undefined;
  color: string;
  isLast?: boolean;
}) {
  return (
    <td
      className={`py-1.5 ${isLast ? "pl-0.5 pr-1.5" : "px-0.5"} text-center tabular-nums`}
      style={{ backgroundColor: color }}
    >
      {pct != null ? formatPctCompact(pct) : <span className="text-muted-foreground/50">—</span>}
    </td>
  );
}

function HoleByHolePanel({ eventId, normalizedName }: { eventId: number; normalizedName: string }) {
  const { data, error, isLoading } = useSWR(
    ["player-holes", eventId, normalizedName],
    () => fetchPlayerHoles(eventId, normalizedName),
    { revalidateOnFocus: false },
  );

  if (isLoading) {
    return (
      <div className="px-4 py-3 bg-secondary/40">
        <Skeleton className="h-16 w-full rounded" />
      </div>
    );
  }
  if (error || !data) {
    return <div className="px-4 py-3 text-xs text-muted-foreground bg-secondary/40">Hole data unavailable.</div>;
  }
  if (data.rounds.length === 0) {
    return <div className="px-4 py-3 text-xs text-muted-foreground bg-secondary/40">No rounds yet.</div>;
  }

  const front = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const back = [10, 11, 12, 13, 14, 15, 16, 17, 18];

  return (
    <div className="bg-secondary/40 px-3 py-2 border-y border-border/40">
      {data.rounds.map((round) => {
        const scores = Object.fromEntries(
          Object.entries(round.scores).map(([k, v]) => [Number(k), v]),
        ) as Record<number, number | null>;
        const out = sumScores(front, scores);
        const inn = sumScores(back, scores);
        const tot = out != null && inn != null ? out + inn : (out ?? inn);
        const parsObj = data.pars as Record<string, number>;
        const outPar = front.reduce((a, h) => a + (parsObj[String(h)] ?? 0), 0);
        const inPar = back.reduce((a, h) => a + (parsObj[String(h)] ?? 0), 0);

        return (
          <div key={round.round_num} className="mb-2 last:mb-0">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-2">
              R{round.round_num}
              {round.tee_time && <span className="text-foreground/60">{round.tee_time}</span>}
              {round.morning != null && (
                <span className="text-muted-foreground/70">
                  {round.morning ? "early" : "late"}
                </span>
              )}
            </div>
            <HoleStrip
              holes={front}
              pars={parsObj}
              scores={scores}
              outLabel="OUT"
              outScore={out}
              outPar={outPar}
            />
            <HoleStrip
              holes={back}
              pars={parsObj}
              scores={scores}
              outLabel="IN"
              outScore={inn}
              outPar={inPar}
              tot={tot}
              totPar={outPar + inPar}
            />
          </div>
        );
      })}
    </div>
  );
}

function HoleStrip({
  holes,
  pars,
  scores,
  outLabel,
  outScore,
  outPar,
  tot,
  totPar,
}: {
  holes: number[];
  pars: Record<string, number>;
  scores: Record<number, number | null>;
  outLabel: string;
  outScore: number | null;
  outPar: number;
  tot?: number | null;
  totPar?: number;
}) {
  return (
    <div className="grid gap-px bg-border/40 text-[10px] sm:text-[11px]" style={{ gridTemplateColumns: `repeat(${holes.length + (tot != null ? 2 : 1)}, minmax(0, 1fr))` }}>
      {holes.map((h) => (
        <div key={`hdr-${h}`} className="bg-card/50 text-center py-0.5 text-muted-foreground tabular-nums">
          {h}
        </div>
      ))}
      <div className="bg-amber-500/15 text-center py-0.5 font-semibold text-amber-200 tabular-nums">{outLabel}</div>
      {tot != null && <div className="bg-amber-500/15 text-center py-0.5 font-semibold text-amber-200">TOT</div>}
      {holes.map((h) => (
        <div key={`par-${h}`} className="bg-card/50 text-center py-0.5 text-muted-foreground/70 tabular-nums">
          {pars[String(h)] ?? "—"}
        </div>
      ))}
      <div className="bg-card/70 text-center py-0.5 text-muted-foreground tabular-nums">{outPar}</div>
      {tot != null && totPar != null && <div className="bg-card/70 text-center py-0.5 text-muted-foreground tabular-nums">{totPar}</div>}
      {holes.map((h) => {
        const stroke = scores[h];
        const par = pars[String(h)];
        return (
          <div key={`s-${h}`} className="bg-card text-center py-1 tabular-nums">
            <ScoreCell stroke={stroke} par={par ?? null} />
          </div>
        );
      })}
      <div className="bg-card text-center py-1 font-semibold tabular-nums">{outScore ?? "—"}</div>
      {tot != null && <div className="bg-card text-center py-1 font-semibold tabular-nums">{tot}</div>}
    </div>
  );
}

function ScoreCell({ stroke, par }: { stroke: number | null | undefined; par: number | null }) {
  if (stroke == null) return <span className="text-muted-foreground/50">—</span>;
  if (par == null) return <span>{stroke}</span>;
  const diff = stroke - par;
  if (diff <= -2) {
    return (
      <span className="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded-full ring-2 ring-emerald-400 text-emerald-300 font-semibold">
        {stroke}
      </span>
    );
  }
  if (diff === -1) {
    return (
      <span className="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded-full ring-1 ring-emerald-400 text-emerald-300">
        {stroke}
      </span>
    );
  }
  if (diff === 1) {
    return (
      <span className="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 ring-1 ring-rose-400 text-rose-300">
        {stroke}
      </span>
    );
  }
  if (diff >= 2) {
    return (
      <span className="inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 ring-2 ring-rose-500 text-rose-300 font-semibold">
        {stroke}
      </span>
    );
  }
  return <span>{stroke}</span>;
}

function sumScores(holes: number[], scores: Record<number, number | null>): number | null {
  let total = 0;
  let any = false;
  for (const h of holes) {
    const s = scores[h];
    if (s == null) continue;
    total += s;
    any = true;
  }
  return any ? total : null;
}
