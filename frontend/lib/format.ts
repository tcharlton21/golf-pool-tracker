/**
 * Formatting utilities for golf data display.
 */

export function formatMoney(amount: number): string {
  if (amount === 0) return "$0";
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(1)}k`;
  }
  return `$${Math.round(amount).toLocaleString()}`;
}

export function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatScore(score: number | null | undefined): string {
  if (score == null) return "—";
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

export function formatPos(pos: number | null | undefined): string {
  if (pos == null) return "—";
  return `T${pos}`;
}

export function formatAmericanOdds(odds: number | null | undefined): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

export function scoreColorClass(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground";
  if (score < 0) return "text-green-400";
  if (score > 0) return "text-red-400";
  return "text-slate-300";
}

export function formatLastRefreshed(iso: string | null | undefined): string {
  if (!iso) return "never";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}
