"use client";

import useSWR from "swr";
import { useCallback } from "react";
import { mutate as globalMutate } from "swr";
import {
  fetchPoolLinks,
  removePoolLink,
  setPoolLink,
} from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import type { PoolLink } from "@/lib/schemas";

export function usePoolLinks(eventId: number | null) {
  const { token } = useAuth();
  const key = token && eventId ? (["pool-links", eventId, token] as const) : null;

  const { data, mutate, isLoading } = useSWR<PoolLink[]>(
    key,
    () => fetchPoolLinks(token!, eventId!),
    { revalidateOnFocus: false },
  );

  const links = data ?? [];
  const linkByPool = new Map(links.map((l) => [l.pool_type, l]));

  const link = useCallback(
    async (poolType: "marshalek" | "piper", entrantId: number) => {
      if (!token || !eventId) return;
      await setPoolLink(token, eventId, poolType, entrantId);
      await mutate();
      // Auto-favorite side-effect: refresh favorites cache too.
      await globalMutate(["favorites", eventId, token]);
    },
    [token, eventId, mutate],
  );

  const unlink = useCallback(
    async (poolType: "marshalek" | "piper") => {
      if (!token || !eventId) return;
      await removePoolLink(token, eventId, poolType);
      await mutate();
    },
    [token, eventId, mutate],
  );

  return {
    links,
    linkByPool,
    isLoading,
    link,
    unlink,
    canLink: !!token && !!eventId,
  };
}
