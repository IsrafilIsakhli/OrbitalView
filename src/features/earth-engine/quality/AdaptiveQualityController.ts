import type { GraphicsQuality } from "@/features/settings/model/preferences";

import { qualityAbove, qualityAtMost, qualityBelow } from "./qualityProfiles";

const LOW_FPS_THRESHOLD = 54;
const RECOVERY_FPS_THRESHOLD = 59;
const LOW_WINDOWS_REQUIRED = 3;
const RECOVERY_WINDOWS_REQUIRED = 20;

export class AdaptiveQualityController {
  private highFpsWindows = 0;
  private lowFpsWindows = 0;

  constructor(
    private current: GraphicsQuality,
    private cap: GraphicsQuality,
  ) {}

  getCurrent(): GraphicsQuality {
    return this.current;
  }

  setCap(cap: GraphicsQuality): GraphicsQuality | null {
    this.cap = cap;
    const next = qualityAtMost(this.current, cap);
    if (next === this.current) {
      return null;
    }
    this.current = next;
    this.resetCounters();
    return next;
  }

  sample(fps: number, surfaceBusy: boolean): GraphicsQuality | null {
    if (surfaceBusy || !Number.isFinite(fps) || fps <= 0) {
      this.resetCounters();
      return null;
    }

    this.lowFpsWindows = fps < LOW_FPS_THRESHOLD ? this.lowFpsWindows + 1 : 0;
    this.highFpsWindows =
      fps >= RECOVERY_FPS_THRESHOLD ? this.highFpsWindows + 1 : 0;

    if (this.lowFpsWindows >= LOW_WINDOWS_REQUIRED && this.current !== "eco") {
      this.current = qualityBelow(this.current);
      this.resetCounters();
      return this.current;
    }

    if (this.highFpsWindows >= RECOVERY_WINDOWS_REQUIRED) {
      const next = qualityAbove(this.current, this.cap);
      this.resetCounters();
      if (next !== this.current) {
        this.current = next;
        return next;
      }
    }

    return null;
  }

  private resetCounters(): void {
    this.highFpsWindows = 0;
    this.lowFpsWindows = 0;
  }
}
