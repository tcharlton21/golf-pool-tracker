"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { EntrantLeaderboardRow } from "@/lib/schemas";
import { formatMoney, formatPct } from "@/lib/format";
import { PicksExpandable } from "./PicksExpandable";

interface EntrantRowProps {
  rank: number;
  entrant: EntrantLeaderboardRow;
  poolType: string;
  scenarioEarnings?: number; // set in hypothetical mode — replaces projected $
}

export function EntrantRow({ rank, entrant, poolType, scenarioEarnings }: EntrantRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isHypothetical = scenarioEarnings !== undefined;

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
        <td className="py-2.5 px-2 w-6">
          <span className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </span>
        </td>
        <td className={`py-2.5 px-2 text-sm font-semibold tabular-nums ${rankColor}`}>
          {rank}
        </td>
        <td className="py-2.5 px-3 text-sm font-medium">{entrant.name}</td>
        {/* Primary earnings column — scenario $ in hypothetical mode, proj. $ normally */}
        <td className={`py-2.5 px-3 text-sm text-right font-medium tabular-nums ${isHypothetical ? "text-amber-400" : ""}`}>
          {isHypothetical
            ? formatMoney(scenarioEarnings)
            : formatMoney(entrant.projected_earnings)}
        </td>
        {/* Secondary column — live $ in normal mode only */}
        {!isHypothetical && (
          <td className="py-2.5 px-3 text-sm text-right tabular-nums text-muted-foreground">
            {formatMoney(entrant.current_earnings)}
          </td>
        )}
        <td className="py-2.5 px-3 text-sm text-right tabular-nums">
          <span className="text-primary/90">
            {formatPct(entrant.odds_of_having_winner)}
          </span>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={isHypothetical ? 5 : 6} className="p-0">
            <PicksExpandable picks={entrant.picks} poolType={poolType} />
          </td>
        </tr>
      )}
    </>
  );
}
