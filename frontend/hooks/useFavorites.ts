"use client";

import useSWR from "swr";
import { useCallback } from "react";
import { addFavorite, fetchFavorites, removeFavorite } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import type { Favorite } from "@/lib/schemas";

export function useFavorites(eventId: number | null) {
  const { token } = useAuth();
  const key = token && eventId ? (["favorites", eventId, token] as const) : null;

  const { data, mutate, isLoading } = useSWR<Favorite[]>(
    key,
    () => fetchFavorites(token!, eventId!),
    { revalidateOnFocus: false },
  );

  const favorites = data ?? [];
  const favoriteSet = new Set(favorites.map((f) => f.golfer_normalized_name));

  const toggle = useCallback(
    async (golferNormalizedName: string) => {
      if (!token || !eventId) return;
      const isFav = favoriteSet.has(golferNormalizedName);
      const next = isFav
        ? favorites.filter((f) => f.golfer_normalized_name !== golferNormalizedName)
        : [
            ...favorites,
            {
              event_id: eventId,
              golfer_normalized_name: golferNormalizedName,
              created_at: new Date().toISOString(),
            } satisfies Favorite,
          ];
      await mutate(
        async () => {
          if (isFav) {
            await removeFavorite(token, eventId, golferNormalizedName);
          } else {
            await addFavorite(token, eventId, golferNormalizedName);
          }
          return fetchFavorites(token, eventId);
        },
        { optimisticData: next, rollbackOnError: true, revalidate: false },
      );
    },
    [token, eventId, favorites, favoriteSet, mutate],
  );

  return {
    favorites,
    favoriteNames: favoriteSet,
    isLoading,
    toggle,
    canFavorite: !!token && !!eventId,
  };
}
