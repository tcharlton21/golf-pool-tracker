import { z } from "zod";

export const PickDetailSchema = z.object({
  golfer_name: z.string(),
  golfer_name_raw: z.string(),
  group_label: z.string().nullable(),
  pick_order: z.number(),
  current_pos: z.number().nullable(),
  current_score: z.number().nullable(),
  thru: z.string().nullable(),
  win_pct: z.number().nullable(),
  top5_pct: z.number().nullable(),
  projected_earnings_contribution: z.number(),
  current_earnings_contribution: z.number(),
  coverage_pct: z.number(),
  dk_win_odds: z.number().nullable(),
});

export const EntrantLeaderboardRowSchema = z.object({
  entrant_id: z.number(),
  name: z.string(),
  pool_type: z.string(),
  projected_earnings: z.number(),
  current_earnings: z.number(),
  odds_of_having_winner: z.number(),
  exclusive_edge_score: z.number(),
  picks: z.array(PickDetailSchema),
});

export const LeaderboardResponseSchema = z.object({
  event_id: z.number(),
  event_name: z.string(),
  pool_type: z.string(),
  last_refreshed: z.string().nullable(),
  entrants: z.array(EntrantLeaderboardRowSchema),
});

export const PlayerOddsSchema = z.object({
  normalized_name: z.string(),
  datagolf_name: z.string().nullable(),
  dk_name: z.string().nullable(),
  current_pos: z.number().nullable(),
  current_score: z.number().nullable(),
  thru: z.string().nullable(),
  win_pct: z.number().nullable(),
  top5_pct: z.number().nullable(),
  top10_pct: z.number().nullable(),
  top20_pct: z.number().nullable(),
  dk_win_odds: z.number().nullable(),
  fetched_at: z.string(),
});

export const LiveOddsResponseSchema = z.object({
  event_id: z.number(),
  players: z.array(PlayerOddsSchema),
  fetched_at: z.string().nullable(),
});

export const EventListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  pool_type: z.string(),
  tour_event: z.string(),
  purse_usd: z.number(),
  start_date: z.string(),
  is_active: z.boolean(),
});

export const RefreshSummarySchema = z.object({
  event_id: z.number(),
  players_matched: z.number(),
  players_unmatched: z.number(),
  unmatched_names: z.array(z.string()),
  datagolf_ok: z.boolean(),
  draftkings_ok: z.boolean(),
  fetched_at: z.string(),
});

export const PickPreviewSchema = z.object({
  golfer_name: z.string(),
  golfer_name_raw: z.string(),
  group_label: z.string().nullable(),
  pick_order: z.number(),
});

export const EntrantPreviewSchema = z.object({
  name: z.string(),
  picks: z.array(PickPreviewSchema),
});

export const UploadPreviewResponseSchema = z.object({
  upload_token: z.string(),
  event_id: z.number(),
  pool_type: z.string(),
  entrant_count: z.number(),
  entrants: z.array(EntrantPreviewSchema),
  warnings: z.array(z.string()),
});

// Inferred types
export type PickDetail = z.infer<typeof PickDetailSchema>;
export type EntrantLeaderboardRow = z.infer<typeof EntrantLeaderboardRowSchema>;
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>;
export type PlayerOdds = z.infer<typeof PlayerOddsSchema>;
export type LiveOddsResponse = z.infer<typeof LiveOddsResponseSchema>;
export type EventListItem = z.infer<typeof EventListItemSchema>;
export type RefreshSummary = z.infer<typeof RefreshSummarySchema>;
export type UploadPreviewResponse = z.infer<typeof UploadPreviewResponseSchema>;
