"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { EntrantLeaderboardRow } from "@/lib/schemas";
import {
  formatMoney,
  formatPct,
} from "@/lib/format";
import { PicksExpandable } from "./PicksExpandable";

interface EntrantRowProps {
  rank: number;
  entrant: EntrantLeaderboardRow;
  poolType: string;
}

export function EntrantRow({ rank, entrant, poolType }: EntrantRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const rankColor =
    rank === 1
      ? "text-yellow-400"
      : rank === 2
        ? "text-slate-300"
        : rank === 3
          ? "text-amber-600"
          : "text-muted-foreground";

  return (
    <>
      <tr
        className="border-b border-border/30 hover:bg-secondary/40 cursor-pointer transition-colors group"
        onClick={() => setIsExpanded((v) => !v)}
      >
        {/* Expand indicator */}
        <td className="py-2.5 px-2 w-6">
          <span className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </span>
        </td>
        {/* Rank */}
        <td className={`py-2.5 px-2 text-sm font-semibold tabular-nums ${rankColor}`}>
          {rank}
        </td>
        {/* Name */}
        <td className="py-2.5 px-3 text-sm font-medium">{entrant.name}</td>
        {/* Projected earnings */}
        <td className="py-2.5 px-3 text-sm text-right font-medium tabular-nums">
          {formatMoney(entrant.projected_earnings)}
        </td>
        {/* Current earnings */}
        <td className="py-2.5 px-3 text-sm text-right tabular-nums text-muted-foreground">
          {formatMoney(entrant.current_earnings)}
        </td>
        {/* Odds of winner */}
        <td className="py-2.5 px-3 text-sm text-right tabular-nums">
          <span className="text-primary/90">
            {formatPct(entrant.odds_of_having_winner)}
          </span>
        </td>
        {/* Edge score */}
        <td className="py-2.5 px-3 text-sm text-right tabular-nums text-muted-foreground">
          {entrant.exclusive_edge_score > 0
            ? entrant.exclusive_edge_score.toFixed(4)
            : "—"}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <PicksExpandable picks={entrant.picks} poolType={poolType} />
          </td>
        </tr>
      )}
    </>
  );
}
