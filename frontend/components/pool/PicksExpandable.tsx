"use client";

import type { PickDetail } from "@/lib/schemas";
import {
  formatMoney,
  formatPct,
  formatPos,
  formatScore,
  scoreColorClass,
} from "@/lib/format";

interface PicksExpandableProps {
  picks: PickDetail[];
  poolType: string;
}

export function PicksExpandable({ picks, poolType }: PicksExpandableProps) {
  const isPiper = poolType === "piper";
  const sortedPicks = [...picks].sort((a, b) => a.pick_order - b.pick_order);

  return (
    <div className="mt-1 mb-2 mx-2 rounded border border-border/40 bg-secondary/30 overflow-x-auto">
      <table className="text-xs" style={{ minWidth: isPiper ? "640px" : "560px" }}>
        <thead>
          <tr className="text-muted-foreground border-b border-border/40">
            {isPiper && (
              <th className="py-1.5 px-3 text-left font-medium whitespace-nowrap">Group</th>
            )}
            <th className="py-1.5 px-3 text-left font-medium whitespace-nowrap">Player</th>
            <th className="py-1.5 px-2 text-center font-medium w-10 whitespace-nowrap">Pos</th>
            <th className="py-1.5 px-2 text-center font-medium w-10 whitespace-nowrap">Score</th>
            <th className="py-1.5 px-2 text-center font-medium w-10 whitespace-nowrap">Thru</th>
            <th className="py-1.5 px-2 text-right font-medium whitespace-nowrap">Cur $</th>
            <th className="py-1.5 px-2 text-right font-medium whitespace-nowrap">Proj $</th>
            <th className="py-1.5 px-2 text-right font-medium whitespace-nowrap">Win%</th>
            <th className="py-1.5 px-2 text-right font-medium whitespace-nowrap">Top 5%</th>
            <th className="py-1.5 px-3 text-right font-medium whitespace-nowrap">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {sortedPicks.map((pick) => {
            const isMissedCut = pick.current_pos && pick.current_pos > 70;
            const isTopTen = pick.current_pos != null && pick.current_pos <= 10;
            const isTopFive = pick.current_pos != null && pick.current_pos <= 5;

            return (
              <tr
                key={pick.golfer_name}
                className={`border-b border-border/20 last:border-0 hover:bg-secondary/50 transition-colors ${
                  isMissedCut ? "opacity-50" : ""
                }`}
              >
                {isPiper && (
                  <td className="py-1.5 px-3 text-muted-foreground font-mono whitespace-nowrap">
                    {pick.group_label ?? "—"}
                  </td>
                )}
                <td className="py-1.5 px-3 whitespace-nowrap">
                  <span
                    className={
                      isTopFive
                        ? "text-primary font-medium"
                        : isTopTen
                          ? "text-green-400/80"
                          : ""
                    }
                  >
                    {pick.golfer_name}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-center text-muted-foreground whitespace-nowrap">
                  {formatPos(pick.current_pos)}
                </td>
                <td className={`py-1.5 px-2 text-center font-medium whitespace-nowrap ${scoreColorClass(pick.current_score)}`}>
                  {formatScore(pick.current_score)}
                </td>
                <td className="py-1.5 px-2 text-center text-muted-foreground whitespace-nowrap">
                  {pick.thru ?? "—"}
                </td>
                <td className="py-1.5 px-2 text-right text-foreground/80 whitespace-nowrap">
                  {formatMoney(pick.current_earnings_contribution)}
                </td>
                <td className="py-1.5 px-2 text-right text-muted-foreground whitespace-nowrap">
                  {formatMoney(pick.projected_earnings_contribution)}
                </td>
                <td className="py-1.5 px-2 text-right whitespace-nowrap">
                  {pick.win_pct != null ? (
                    <span className="text-primary font-medium">{formatPct(pick.win_pct)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-1.5 px-2 text-right text-muted-foreground whitespace-nowrap">
                  {formatPct(pick.top5_pct)}
                </td>
                <td className="py-1.5 px-3 text-right whitespace-nowrap">
                  <CoveragePip coverage={pick.coverage_pct} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CoveragePip({ coverage }: { coverage: number }) {
  const pct = Math.round(coverage * 100);
  const color =
    pct === 0
      ? "text-primary"
      : pct < 25
        ? "text-green-400/70"
        : pct < 50
          ? "text-yellow-400/70"
          : "text-muted-foreground";
  return (
    <span className={`${color} tabular-nums`}>
      {pct === 0 ? "unique" : `${pct}%`}
    </span>
  );
}
