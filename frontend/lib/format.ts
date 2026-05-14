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

export function formatPos(pos: number | null | undefined, isTied = false): string {
  if (pos == null) return "—";
  return isTied ? `T${pos}` : `${pos}`;
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

export function formatShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const last = parts.slice(1).join(" ");
  return `${first[0]}. ${last}`;
}

// 3-letter IOC / FIFA country code → flag emoji. Falls back to empty string when unknown.
const COUNTRY_TO_ISO2: Record<string, string> = {
  USA: "US", ENG: "GB", SCO: "GB", WAL: "GB", NIR: "GB", IRL: "IE",
  GER: "DE", FRA: "FR", ITA: "IT", ESP: "ES", POR: "PT", NED: "NL",
  BEL: "BE", DEN: "DK", SWE: "SE", NOR: "NO", FIN: "FI", AUT: "AT",
  SUI: "CH", POL: "PL", CZE: "CZ", AUS: "AU", NZL: "NZ", JPN: "JP",
  KOR: "KR", CHN: "CN", IND: "IN", THA: "TH", PHI: "PH", MEX: "MX",
  CAN: "CA", BRA: "BR", ARG: "AR", CHI: "CL", COL: "CO", VEN: "VE",
  RSA: "ZA", ZIM: "ZW", FIJ: "FJ", PAR: "PY", URU: "UY",
};

export function flagEmoji(code: string | null | undefined): string {
  if (!code) return "";
  const iso2 = COUNTRY_TO_ISO2[code.toUpperCase()] ?? code.toUpperCase().slice(0, 2);
  if (iso2.length !== 2) return "";
  // Convert ISO-2 to regional indicator symbols
  return String.fromCodePoint(
    ...iso2.split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

// Heat-map for probability cells. Subtle blue tint that scales with probability.
// Below 2% returns transparent so very long shots don't add visual noise.
export function probHeatColor(pct: number | null | undefined): string {
  if (pct == null || pct < 0.02) return "transparent";
  const clamped = Math.max(0, Math.min(1, pct));
  const t = Math.sqrt(clamped);
  // Alpha scales with t — peaks at ~0.32 for 100% likely, very faint for low probs
  const alpha = 0.05 + t * 0.27;
  return `rgba(59, 130, 246, ${alpha.toFixed(3)})`;
}

// Win column gets a gold tint instead of blue, for visual distinction
export function winHeatColor(pct: number | null | undefined): string {
  if (pct == null || pct < 0.005) return "transparent";
  const clamped = Math.max(0, Math.min(1, pct));
  const t = Math.sqrt(clamped);
  const alpha = 0.05 + t * 0.30;
  return `rgba(217, 160, 60, ${alpha.toFixed(3)})`;
}

// Compact percent: "89%" not "89.3%". For very low values shows "<1%".
export function formatPctCompact(value: number | null | undefined): string {
  if (value == null) return "—";
  const pct = value * 100;
  if (pct > 0 && pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}
