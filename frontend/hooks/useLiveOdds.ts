"use client";

import useSWR from "swr";
import { fetchLiveOdds } from "@/lib/api";
import type { LiveOddsResponse } from "@/lib/schemas";

export function useLiveOdds(eventId: number | null): {
  liveOdds: LiveOddsResponse | undefined;
  isLoading: boolean;
  error: Error | undefined;
  refresh: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR(
    eventId ? ["live-odds", eventId] : null,
    () => fetchLiveOdds(eventId!),
    { refreshInterval: 30_000 },
  );

  return {
    liveOdds: data,
    isLoading,
    error: error as Error | undefined,
    refresh: () => mutate(),
  };
}
