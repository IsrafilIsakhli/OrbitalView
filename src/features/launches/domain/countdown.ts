import { launchStatusIds } from "./launch";

export type CountdownPhase = "counting" | "hold" | "in-flight" | "elapsed" | "awaiting" | "invalid";

export interface LaunchCountdownValue {
  days: number;
  hours: number;
  minutes: number;
  phase: CountdownPhase;
  seconds: number;
  signedMilliseconds: number;
}

export function calculateLaunchCountdown(
  net: string,
  statusId: number | null,
  nowUnixMs = Date.now(),
): LaunchCountdownValue {
  const target = Date.parse(net);
  if (!Number.isFinite(target)) return empty("invalid");
  const signedMilliseconds = target - nowUnixMs;
  if (statusId === launchStatusIds.hold) {
    return fromDuration(Math.max(0, signedMilliseconds), signedMilliseconds, "hold");
  }
  if (statusId === launchStatusIds.inFlight) {
    return fromDuration(Math.max(0, -signedMilliseconds), signedMilliseconds, "in-flight");
  }
  if (signedMilliseconds >= 0) {
    return fromDuration(signedMilliseconds, signedMilliseconds, "counting");
  }
  if (statusId === null || new Set<number>([launchStatusIds.go, launchStatusIds.tbc, launchStatusIds.tbd]).has(statusId)) {
    return fromDuration(-signedMilliseconds, signedMilliseconds, "awaiting");
  }
  return fromDuration(-signedMilliseconds, signedMilliseconds, "elapsed");
}

function fromDuration(
  durationMilliseconds: number,
  signedMilliseconds: number,
  phase: CountdownPhase,
): LaunchCountdownValue {
  const totalSeconds = Math.floor(durationMilliseconds / 1_000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    phase,
    seconds: totalSeconds % 60,
    signedMilliseconds,
  };
}

function empty(phase: CountdownPhase): LaunchCountdownValue {
  return { days: 0, hours: 0, minutes: 0, phase, seconds: 0, signedMilliseconds: 0 };
}
