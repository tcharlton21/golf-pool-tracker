"use client";

import useSWR from "swr";
import { fetchPurse } from "@/lib/api";
import type { PursePosition } from "@/lib/schemas";

export function usePurse(eventId: number | null): {
  purse: PursePosition[] | undefined;
  isLoading: boolean;
} {
  const { data, isLoading } = useSWR(
    eventId ? ["purse", eventId] : null,
    () => fetchPurse(eventId!),
    { revalidateOnFocus: false }, // purse doesn't change mid-tournament
  );
  return { purse: data, isLoading };
}
