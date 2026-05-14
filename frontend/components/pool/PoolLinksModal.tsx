"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PoolLinker } from "./PoolLinker";
import {
  formatMoney,
  formatPos,
  formatScore,
  scoreColorClass,
} from "@/lib/format";
import type {
  EntrantLeaderboardRow,
  LeaderboardResponse,
} from "@/lib/schemas";

export interface PoolStanding {
  entrant: EntrantLeaderboardRow;
  rank: number;
  total: number;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marshalek: LeaderboardResponse | undefined;
  piper: LeaderboardResponse | undefined;
  marshalekStanding: PoolStanding | null;
  piperStanding: PoolStanding | null;
  marshalekLinkedName: string | null;
  piperLinkedName: string | null;
  onLinkMarshalek: (entrantId: number) => Promise<void>;
  onLinkPiper: (entrantId: number) => Promise<void>;
  onUnlinkMarshalek: () => Promise<void>;
  onUnlinkPiper: () => Promise<void>;
};

export function PoolLinksModal({
  open,
  onOpenChange,
  marshalek,
  piper,
  marshalekStanding,
  piperStanding,
  marshalekLinkedName,
  piperLinkedName,
  onLinkMarshalek,
  onLinkPiper,
  onUnlinkMarshalek,
  onUnlinkPiper,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>My pools</DialogTitle>
          <DialogDescription>
            Link your entry in each pool to see your standings here.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <PoolSection
            label="Marshalek"
            poolType="marshalek"
            leaderboard={marshalek}
            standing={marshalekStanding}
            linkedName={marshalekLinkedName}
            onLink={onLinkMarshalek}
            onUnlink={onUnlinkMarshalek}
          />
          <PoolSection
            label="Piper"
            poolType="piper"
            leaderboard={piper}
            standing={piperStanding}
            linkedName={piperLinkedName}
            onLink={onLinkPiper}
            onUnlink={onUnlinkPiper}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PoolSection({
  label,
  poolType,
  leaderboard,
  standing,
  linkedName,
  onLink,
  onUnlink,
}: {
  label: string;
  poolType: "marshalek" | "piper";
  leaderboard: LeaderboardResponse | undefined;
  standing: PoolStanding | null;
  linkedName: string | null;
  onLink: (entrantId: number) => Promise<void>;
  onUnlink: () => Promise<void>;
}) {
  // Not linked yet → just the picker
  if (!linkedName || !standing) {
    return (
      <div className="rounded-lg border border-border/40 p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </h4>
          <span className="text-[10px] text-muted-foreground/60">
            Not linked
          </span>
        </div>
        <PoolLinker
          poolType={poolType}
          leaderboard={leaderboard}
          linkedEntrantName={null}
          onLink={onLink}
          onUnlink={onUnlink}
        />
      </div>
    );
  }

  const { entrant, rank, total } = standing;
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      <div className="px-3 py-2 border-b border-border/40 bg-secondary/30 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </h4>
          <span className="text-[10px] text-muted-foreground/70 truncate">
            {linkedName}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onUnlink()}
            className="text-[10px] text-muted-foreground/70 hover:text-foreground underline-offset-2 hover:underline"
          >
            unlink
          </button>
          <div className="text-xs text-muted-foreground tabular-nums">
            Rank{" "}
            <span className="text-foreground font-medium">{rank}</span>
            <span className="text-muted-foreground/60">/{total}</span>
          </div>
        </div>
      </div>
      <div className="px-3 py-2 flex items-center gap-6 text-sm">
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
            .sort((a, b) => (a.current_pos ?? 9999) - (b.current_pos ?? 9999))
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
