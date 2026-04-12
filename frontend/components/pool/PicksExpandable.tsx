"use client";

import type { PickDetail } from "@/lib/schemas";
import {
  formatAmericanOdds,
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

  // For Piper, group pairs together (A-1/A-2, B-1/B-2, etc.)
  const sortedPicks = [...picks].sort((a, b) => a.pick_order - b.pick_order);

  return (
    <div className="mt-1 mb-2 mx-2 rounded border border-border/40 bg-secondary/30 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground border-b border-border/40">
            {isPiper && (
              <th className="py-1.5 px-3 text-left font-medium w-12">Grp</th>
            )}
            <th className="py-1.5 px-3 text-left font-medium">Player</th>
            <th className="py-1.5 px-2 text-center font-medium w-10">Pos</th>
            <th className="py-1.5 px-2 text-center font-medium w-10">Score</th>
            <th className="py-1.5 px-2 text-center font-medium w-10">Thru</th>
            <th className="py-1.5 px-2 text-right font-medium w-14">Win%</th>
            <th className="py-1.5 px-2 text-right font-medium w-14">Top5%</th>
            <th className="py-1.5 px-2 text-right font-medium w-20">Proj.$</th>
            <th className="py-1.5 px-2 text-right font-medium w-16">DK Odds</th>
            <th className="py-1.5 px-3 text-right font-medium w-16">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {sortedPicks.map((pick, idx) => {
            const isMissedCut =
              pick.current_pos && pick.current_pos > 70;
            const isTopTen =
              pick.current_pos != null && pick.current_pos <= 10;
            const isTopFive =
              pick.current_pos != null && pick.current_pos <= 5;

            return (
              <tr
                key={pick.golfer_name}
                className={`border-b border-border/20 last:border-0 hover:bg-secondary/50 transition-colors ${
                  isMissedCut ? "opacity-50" : ""
                }`}
              >
                {isPiper && (
                  <td className="py-1.5 px-3 text-muted-foreground font-mono">
                    {pick.group_label ?? "—"}
                  </td>
                )}
                <td className="py-1.5 px-3">
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
                <td className="py-1.5 px-2 text-center text-muted-foreground">
                  {formatPos(pick.current_pos)}
                </td>
                <td
                  className={`py-1.5 px-2 text-center font-medium ${scoreColorClass(pick.current_score)}`}
                >
                  {formatScore(pick.current_score)}
                </td>
                <td className="py-1.5 px-2 text-center text-muted-foreground">
                  {pick.thru ?? "—"}
                </td>
                <td className="py-1.5 px-2 text-right">
                  {pick.win_pct != null ? (
                    <span className="text-primary font-medium">
                      {formatPct(pick.win_pct)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-1.5 px-2 text-right text-muted-foreground">
                  {formatPct(pick.top5_pct)}
                </td>
                <td className="py-1.5 px-2 text-right text-foreground/80">
                  {formatMoney(pick.projected_earnings_contribution)}
                </td>
                <td className="py-1.5 px-2 text-right text-muted-foreground font-mono text-xs">
                  {formatAmericanOdds(pick.dk_win_odds)}
                </td>
                <td className="py-1.5 px-3 text-right">
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
