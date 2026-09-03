export const TIME_LENS_HORIZON_MS = 24 * 60 * 60 * 1_000;
export const TIME_LENS_STEP_MS = 60_000;
export const timeLensRates = [1, 10, 60] as const;

export interface TimeLensEvent {
  id: string;
  label: string;
  timestampUnixMs: number;
}

export function clampTimeLensTimestamp(
  timestampUnixMs: number,
  windowStartUnixMs: number,
): number {
  const fallback = Number.isFinite(windowStartUnixMs)
    ? windowStartUnixMs
    : Date.now();
  if (!Number.isFinite(timestampUnixMs)) return fallback;
  return Math.min(
    fallback + TIME_LENS_HORIZON_MS,
    Math.max(fallback, timestampUnixMs),
  );
}

export function timeLensProgress(
  timestampUnixMs: number,
  windowStartUnixMs: number,
): number {
  const clamped = clampTimeLensTimestamp(timestampUnixMs, windowStartUnixMs);
  return (clamped - windowStartUnixMs) / TIME_LENS_HORIZON_MS;
}

export function nextTimeLensEvent(
  events: readonly TimeLensEvent[],
  timestampUnixMs: number,
): TimeLensEvent | null {
  return events
    .filter((event) => Number.isFinite(event.timestampUnixMs))
    .sort((left, right) => left.timestampUnixMs - right.timestampUnixMs)
    .find((event) => event.timestampUnixMs > timestampUnixMs) ?? null;
}

