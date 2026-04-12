import { z } from "zod";
import {
  EventListItemSchema,
  LeaderboardResponseSchema,
  LiveOddsResponseSchema,
  PursePositionSchema,
  RefreshSummarySchema,
  UploadPreviewResponseSchema,
  type EventListItem,
  type LeaderboardResponse,
  type LiveOddsResponse,
  type PursePosition,
  type RefreshSummary,
  type UploadPreviewResponse,
} from "./schemas";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status} ${res.statusText}: ${text}`);
  }
  const json = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error("API response validation failed:", parsed.error);
    throw new Error(`Invalid API response: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function fetchEvents(): Promise<EventListItem[]> {
  return apiFetch("/events", z.array(EventListItemSchema));
}

export function fetchLeaderboard(
  eventId: number,
  poolType?: string,
): Promise<LeaderboardResponse> {
  const query = poolType ? `?pool_type=${poolType}` : "";
  return apiFetch(
    `/pools/${eventId}/leaderboard${query}`,
    LeaderboardResponseSchema,
  );
}

export function fetchLiveOdds(eventId: number): Promise<LiveOddsResponse> {
  return apiFetch(`/live/${eventId}/odds`, LiveOddsResponseSchema);
}

export async function triggerRefresh(eventId: number): Promise<RefreshSummary> {
  return apiFetch(`/live/${eventId}/refresh`, RefreshSummarySchema, {
    method: "POST",
  });
}

export async function uploadPicks(
  eventId: number,
  poolType: string,
  file: File,
): Promise<UploadPreviewResponse> {
  const form = new FormData();
  form.append("pool_type", poolType);
  form.append("file", file);

  const res = await fetch(`${BASE_URL}/pools/${eventId}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
  const json = await res.json();
  const parsed = UploadPreviewResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Invalid upload response: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function fetchPurse(eventId: number): Promise<PursePosition[]> {
  return apiFetch(`/events/${eventId}/purse`, z.array(PursePositionSchema));
}

export async function confirmUpload(
  eventId: number,
  uploadToken: string,
): Promise<{ committed: number; pool_type: string }> {
  const res = await fetch(`${BASE_URL}/pools/${eventId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upload_token: uploadToken }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
  return res.json();
}
