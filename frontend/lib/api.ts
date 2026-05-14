import { z } from "zod";
import {
  AuthResponseSchema,
  EventListItemSchema,
  FavoriteSchema,
  LeaderboardResponseSchema,
  LiveOddsResponseSchema,
  PlayerHolesResponseSchema,
  PoolLinkSchema,
  PursePositionSchema,
  RefreshSummarySchema,
  UploadPreviewResponseSchema,
  UserSchema,
  type AuthResponse,
  type EventListItem,
  type Favorite,
  type LeaderboardResponse,
  type LiveOddsResponse,
  type PlayerHolesResponse,
  type PoolLink,
  type PursePosition,
  type RefreshSummary,
  type UploadPreviewResponse,
  type User,
} from "./schemas";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function withAuth(token: string | null, init: RequestInit = {}): RequestInit {
  if (!token) return init;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
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

export function fetchPlayerHoles(
  eventId: number,
  normalizedName: string,
): Promise<PlayerHolesResponse> {
  return apiFetch(
    `/live/${eventId}/holes/${encodeURIComponent(normalizedName)}`,
    PlayerHolesResponseSchema,
  );
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

// ----- Auth -----

export function registerOrLogin(
  email: string,
  password: string,
  signupCode?: string,
): Promise<AuthResponse> {
  return apiFetch("/auth/register-or-login", AuthResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      signup_code: signupCode || undefined,
    }),
  });
}

export function fetchMe(token: string): Promise<User> {
  return apiFetch("/auth/me", UserSchema, withAuth(token));
}

// ----- Favorites -----

export function fetchFavorites(
  token: string,
  eventId: number,
): Promise<Favorite[]> {
  return apiFetch(
    `/users/me/favorites?event_id=${eventId}`,
    z.array(FavoriteSchema),
    withAuth(token),
  );
}

export function addFavorite(
  token: string,
  eventId: number,
  golferNormalizedName: string,
): Promise<Favorite> {
  return apiFetch("/users/me/favorites", FavoriteSchema, withAuth(token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_id: eventId,
      golfer_normalized_name: golferNormalizedName,
    }),
  }));
}

export async function removeFavorite(
  token: string,
  eventId: number,
  golferNormalizedName: string,
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/users/me/favorites/${eventId}/${encodeURIComponent(golferNormalizedName)}`,
    withAuth(token, { method: "DELETE" }),
  );
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
}

// ----- Pool links -----

export function fetchPoolLinks(
  token: string,
  eventId: number,
): Promise<PoolLink[]> {
  return apiFetch(
    `/users/me/pool-links?event_id=${eventId}`,
    z.array(PoolLinkSchema),
    withAuth(token),
  );
}

export function setPoolLink(
  token: string,
  eventId: number,
  poolType: "marshalek" | "piper",
  entrantId: number,
): Promise<PoolLink> {
  return apiFetch("/users/me/pool-links", PoolLinkSchema, withAuth(token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_id: eventId,
      pool_type: poolType,
      entrant_id: entrantId,
    }),
  }));
}

export async function removePoolLink(
  token: string,
  eventId: number,
  poolType: "marshalek" | "piper",
): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/users/me/pool-links/${eventId}/${poolType}`,
    withAuth(token, { method: "DELETE" }),
  );
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
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
