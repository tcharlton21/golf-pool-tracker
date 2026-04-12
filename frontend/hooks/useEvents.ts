"use client";

import useSWR from "swr";
import { fetchEvents } from "@/lib/api";
import type { EventListItem } from "@/lib/schemas";

export function useEvents(): {
  events: EventListItem[];
  isLoading: boolean;
  error: Error | undefined;
} {
  const { data, error, isLoading } = useSWR("events", fetchEvents, {
    revalidateOnFocus: false,
  });

  return {
    events: data ?? [],
    isLoading,
    error: error as Error | undefined,
  };
}
