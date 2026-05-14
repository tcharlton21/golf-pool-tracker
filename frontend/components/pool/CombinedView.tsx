"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Clock, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveLeaderboard } from "./LiveLeaderboard";
import { PoolLinksModal, type PoolStanding } from "./PoolLinksModal";
import { usePoolData } from "@/hooks/usePoolData";
import { useLiveOdds } from "@/hooks/useLiveOdds";
import { usePoolLinks } from "@/hooks/usePoolLinks";
import { useAuth } from "@/components/auth/AuthProvider";
import { triggerRefresh } from "@/lib/api";
import { formatLastRefreshed } from "@/lib/format";
import type { EventListItem, LeaderboardResponse } from "@/lib/schemas";

interface CombinedViewProps {
  events: EventListItem[];
}

export function CombinedView({ events }: CombinedViewProps) {
  const activeEvent = events.find((e) => e.is_active) ?? events[0] ?? null;
  const [selectedEventId, setSelectedEventId] = useState<number | null>(
    activeEvent?.id ?? null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Debounce filter input so the leaderboard doesn't re-render on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(searchInput), 150);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { user } = useAuth();
  const { leaderboard: marshalek, refresh: refreshMarshalek } = usePoolData(
    selectedEventId,
    "marshalek",
  );
  const { leaderboard: piper, refresh: refreshPiper } = usePoolData(
    selectedEventId,
    "piper",
  );
  const { refresh: refreshLiveOdds } = useLiveOdds(selectedEventId);
  const { linkByPool, link, unlink } = usePoolLinks(selectedEventId);

  const fallbackName = (
    process.env.NEXT_PUBLIC_MY_ENTRANT_NAME ?? "Trent Charlton"
  ).toLowerCase();

  function findMyStanding(
    lb: LeaderboardResponse | undefined,
    poolType: "marshalek" | "piper",
  ): PoolStanding | null {
    if (!lb || lb.entrants.length === 0) return null;
    const sorted = [...lb.entrants].sort(
      (a, b) => b.current_earnings - a.current_earnings,
    );
    const linkedId = linkByPool.get(poolType)?.entrant_id;
    let idx = -1;
    if (user) {
      if (linkedId == null) return null;
      idx = sorted.findIndex((e) => e.entrant_id === linkedId);
    } else {
      idx = sorted.findIndex((e) => e.name.toLowerCase() === fallbackName);
    }
    if (idx < 0) return null;
    return { entrant: sorted[idx], rank: idx + 1, total: sorted.length };
  }

  const myMarshalek = findMyStanding(marshalek, "marshalek");
  const myPiper = findMyStanding(piper, "piper");

  // Logged-out viewers: pin the env-var entrant's picks at the top of the
  // tournament leaderboard. Logged-in: leaderboard reads favorites directly.
  const myPickNames = user
    ? []
    : Array.from(
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
        <div className="flex items-center gap-2 shrink-0">
          {user && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setLinkModalOpen(true)}
              disabled={!selectedEventId || (!marshalek && !piper)}
              title="My pools"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">My pools</span>
            </Button>
          )}
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
      </div>

      {selectedEventId && (
        <div className="flex-1 min-h-0">
          <div className="rounded-lg border border-border/40 overflow-hidden h-full">
            <div className="px-4 py-2 border-b border-border/40 bg-secondary/30 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tournament
              </h3>
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Filter players…"
                className="w-32 sm:w-56 text-xs bg-background border border-border/40 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <LiveLeaderboard
              eventId={selectedEventId}
              myPickNames={myPickNames}
              searchQuery={searchQuery}
            />
          </div>
        </div>
      )}

      {user && (
        <PoolLinksModal
          open={linkModalOpen}
          onOpenChange={setLinkModalOpen}
          marshalek={marshalek}
          piper={piper}
          marshalekStanding={myMarshalek}
          piperStanding={myPiper}
          marshalekLinkedName={linkByPool.get("marshalek")?.entrant_name ?? null}
          piperLinkedName={linkByPool.get("piper")?.entrant_name ?? null}
          onLinkMarshalek={(id) => link("marshalek", id)}
          onLinkPiper={(id) => link("piper", id)}
          onUnlinkMarshalek={() => unlink("marshalek")}
          onUnlinkPiper={() => unlink("piper")}
        />
      )}
    </div>
  );
}
