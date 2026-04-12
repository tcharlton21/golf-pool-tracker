"use client";

import useSWR from "swr";
import { fetchLeaderboard } from "@/lib/api";
import type { LeaderboardResponse } from "@/lib/schemas";

export function usePoolData(
  eventId: number | null,
  poolType?: string,
): {
  leaderboard: LeaderboardResponse | undefined;
  isLoading: boolean;
  error: Error | undefined;
  refresh: () => void;
} {
  const key = eventId
    ? ["leaderboard", eventId, poolType ?? "all"]
    : null;

  const { data, error, isLoading, mutate } = useSWR(
    key,
    () => fetchLeaderboard(eventId!, poolType),
    { refreshInterval: 60_000 },
  );

  return {
    leaderboard: data,
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
  };
}
