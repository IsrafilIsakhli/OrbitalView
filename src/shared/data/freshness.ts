export type DataFreshness = "fresh" | "stale" | "degraded" | "unavailable";

export interface DataProvenance {
  expiresAtUnixMs: number | null;
  fetchedAtUnixMs: number | null;
  freshness: DataFreshness;
  observedAtUnixMs: number | null;
  provider: string;
  sourceLabel: string;
  sourceUpdatedAtUnixMs: number | null;
}

export function freshnessFromTimestamps(
  fetchedAtUnixMs: number | null,
  expiresAtUnixMs: number | null,
  unavailable = false,
  nowUnixMs = Date.now(),
): DataFreshness {
  if (unavailable && fetchedAtUnixMs === null) return "unavailable";
  if (unavailable) return "degraded";
  return expiresAtUnixMs !== null && expiresAtUnixMs < nowUnixMs ? "stale" : "fresh";
}
