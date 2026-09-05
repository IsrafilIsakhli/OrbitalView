import { ClockStep, type Clock } from "cesium";

/** Drop wall-clock time spent suspended; a forecast must not jump on return. */
export function resumeEarthClock(clock: Clock, realTime: boolean): void {
  clock.shouldAnimate = false;
  clock.tick();
  if (realTime) clock.clockStep = ClockStep.SYSTEM_CLOCK;
}
