import type { GraphicsQuality } from "@/features/settings/model/preferences";

import { qualityAbove, qualityAtMost, qualityBelow } from "./qualityProfiles";

const LOW_WINDOWS_REQUIRED = 3;
const RECOVERY_WINDOWS_REQUIRED = 20;

export class AdaptiveQualityController {
  private highFpsWindows = 0;
  private lowFpsWindows = 0;
  private recoveryBlockedUntil = 0;
  private lastUpgradeAt = Number.NEGATIVE_INFINITY;

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

  sample(fps: number, surfaceBusy: boolean, target = 60, now = performance.now(), allowDegrade = true): GraphicsQuality | null {
    if (surfaceBusy || !Number.isFinite(fps) || fps <= 0) {
      this.resetCounters();
      return null;
    }

    this.lowFpsWindows = allowDegrade && fps < target * 0.9 ? this.lowFpsWindows + 1 : 0;
    this.highFpsWindows =
      fps >= target * (59 / 60) ? this.highFpsWindows + 1 : 0;

    if (this.lowFpsWindows >= LOW_WINDOWS_REQUIRED && this.current !== "eco") {
      if (now - this.lastUpgradeAt < 30_000) this.recoveryBlockedUntil = now + 30_000;
      this.current = qualityBelow(this.current);
      this.resetCounters();
      return this.current;
    }

    if (this.highFpsWindows >= RECOVERY_WINDOWS_REQUIRED && now >= this.recoveryBlockedUntil) {
      const next = qualityAbove(this.current, this.cap);
      this.resetCounters();
      if (next !== this.current) {
        this.current = next;
        this.lastUpgradeAt = now;
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
