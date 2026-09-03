import type { OrbitWorkerTimeLensState } from "./messages";

export function resolveForecastTimestamp(
  state: OrbitWorkerTimeLensState | null,
  anchorRealUnixMs: number,
  nowRealUnixMs: number,
): number {
  if (!state) return nowRealUnixMs;
  if (!state.playing) return state.timestampUnixMs;
  return state.timestampUnixMs +
    Math.max(0, nowRealUnixMs - anchorRealUnixMs) * state.rate;
}

