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
  flag: z.string().nullable(),
  current_pos: z.number().nullable(),
  current_score: z.number().nullable(),
  today_score: z.number().nullable(),
  thru: z.string().nullable(),
  started_back: z.boolean().nullable(),
  win_pct: z.number().nullable(),
  top5_pct: z.number().nullable(),
  top10_pct: z.number().nullable(),
  top20_pct: z.number().nullable(),
  make_cut_pct: z.number().nullable(),
  dk_win_odds: z.number().nullable(),
  fetched_at: z.string(),
});

export const LiveOddsResponseSchema = z.object({
  event_id: z.number(),
  players: z.array(PlayerOddsSchema),
  fetched_at: z.string().nullable(),
});

export const HoleRoundSchema = z.object({
  round_num: z.number(),
  course_code: z.string().nullable(),
  morning: z.boolean().nullable(),
  tee_time: z.string().nullable(),
  scores: z.record(z.string(), z.number().nullable()),
});

export const PlayerHolesResponseSchema = z.object({
  normalized_name: z.string(),
  flag: z.string().nullable(),
  rounds: z.array(HoleRoundSchema),
  pars: z.record(z.string(), z.number()),
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

export const PursePositionSchema = z.object({
  position: z.number(),
  pct: z.number(),
  amount_usd: z.number(),
});

// ----- Auth schemas -----

export const UserSchema = z.object({
  id: z.number(),
  email: z.string(),
  created_at: z.string(),
  is_new: z.boolean().default(false),
});

export const AuthResponseSchema = z.object({
  token: z.string(),
  user: UserSchema,
});

export const FavoriteSchema = z.object({
  event_id: z.number(),
  golfer_normalized_name: z.string(),
  created_at: z.string(),
});

export const PoolLinkSchema = z.object({
  event_id: z.number(),
  pool_type: z.string(),
  entrant_id: z.number(),
  entrant_name: z.string(),
  created_at: z.string(),
});

// Inferred types
export type PickDetail = z.infer<typeof PickDetailSchema>;
export type EntrantLeaderboardRow = z.infer<typeof EntrantLeaderboardRowSchema>;
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>;
export type PlayerOdds = z.infer<typeof PlayerOddsSchema>;
export type LiveOddsResponse = z.infer<typeof LiveOddsResponseSchema>;
export type HoleRound = z.infer<typeof HoleRoundSchema>;
export type PlayerHolesResponse = z.infer<typeof PlayerHolesResponseSchema>;
export type EventListItem = z.infer<typeof EventListItemSchema>;
export type RefreshSummary = z.infer<typeof RefreshSummarySchema>;
export type UploadPreviewResponse = z.infer<typeof UploadPreviewResponseSchema>;
export type PursePosition = z.infer<typeof PursePositionSchema>;
export type User = z.infer<typeof UserSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type Favorite = z.infer<typeof FavoriteSchema>;
export type PoolLink = z.infer<typeof PoolLinkSchema>;
