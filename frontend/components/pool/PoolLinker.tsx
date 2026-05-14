"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LeaderboardResponse } from "@/lib/schemas";

type Props = {
  poolType: "marshalek" | "piper";
  leaderboard: LeaderboardResponse | undefined;
  linkedEntrantName: string | null;
  onLink: (entrantId: number) => Promise<void>;
  onUnlink: () => Promise<void>;
};

export function PoolLinker({ leaderboard, linkedEntrantName, onLink }: Props) {
  const [selected, setSelected] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const entrants = useMemo(() => {
    return [...(leaderboard?.entrants ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [leaderboard]);

  if (linkedEntrantName) {
    // The wrapping card already shows the linked name + unlink action.
    return null;
  }

  if (entrants.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">No entries uploaded yet.</div>
    );
  }

  async function handleLink() {
    if (!selected) return;
    setSubmitting(true);
    try {
      await onLink(Number(selected));
    } finally {
      setSubmitting(false);
      setSelected("");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="flex-1 text-xs bg-secondary border border-border/40 rounded px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
      >
        <option value="">Pick your entry...</option>
        {entrants.map((e) => (
          <option key={e.entrant_id} value={e.entrant_id}>
            {e.name}
          </option>
        ))}
      </select>
      <Button
        size="xs"
        onClick={handleLink}
        disabled={!selected || submitting}
      >
        Link
      </Button>
    </div>
  );
}
