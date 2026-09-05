import { describe, expect, it, vi } from "vitest";
import { Clock, ClockStep, Event, JulianDate, type Scene } from "cesium";
import { resumeEarthClock } from "../time/resumeEarthClock";
import { boundedResolutionScale, resolveRenderMode } from "./renderPolicy";
import { FrameWindow } from "../telemetry/frameStatistics";
import { PerformanceMonitor } from "../telemetry/PerformanceMonitor";
import { AdaptiveQualityController } from "../quality/AdaptiveQualityController";
import { retryTile, shouldUseDetailedTerrain } from "../scene/surfacePolicy";
import { measureOverlayInsets } from "../camera/overlayInsets";
import { migratePreferences } from "@/features/settings/model/preferences";
import { WorkerActivityGate } from "@/features/satellites/rendering/WorkerActivityGate";

describe("Earth 0.2 runtime contracts", () => {
  it("does not fast-forward a paused forecast and restores the system-clock contract", () => {
    vi.useFakeTimers();
    const clock = new Clock({ clockStep: ClockStep.SYSTEM_CLOCK_MULTIPLIER, multiplier: 60, shouldAnimate: true });
    clock.tick();
    clock.shouldAnimate = false;
    const paused = JulianDate.clone(clock.currentTime);
    vi.advanceTimersByTime(10_000);
    resumeEarthClock(clock, false);
    expect(JulianDate.equals(clock.currentTime, paused)).toBe(true);
    clock.shouldAnimate = true;
    clock.tick();
    expect(Math.abs(JulianDate.secondsDifference(clock.currentTime, paused))).toBeLessThan(1);
    resumeEarthClock(clock, true);
    expect(clock.clockStep).toBe(ClockStep.SYSTEM_CLOCK);
    expect(Math.abs(JulianDate.secondsDifference(clock.currentTime, JulianDate.now()))).toBeLessThan(1);
    vi.useRealTimers();
  });
  it("coalesces resume storms and cancels pending work on pause/dispose", () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const gate = new WorkerActivityGate(publish);
    for (let i = 0; i < 50; i++) { gate.set(false); gate.set(true); }
    gate.set(false);
    vi.advanceTimersByTime(1000);
    expect(publish.mock.calls.some(([active]) => active)).toBe(false);
    gate.set(true);
    vi.advanceTimersByTime(32);
    expect(publish).toHaveBeenLastCalledWith(true);
    gate.set(true); gate.cancel(); publish.mockClear();
    vi.advanceTimersByTime(1000);
    expect(publish).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("update veto survives workspace/document resume; idle is on-demand", () => {
    const base = { workspace: true, document: true, update: false, motion: false };
    expect(resolveRenderMode(base)).toBe("on-demand");
    expect(resolveRenderMode({ ...base, motion: true })).toBe("continuous");
    for (const patch of [{ update: true }, { workspace: false }, { document: false }]) {
      expect(resolveRenderMode({ ...base, motion: true, ...patch })).toBe("suspended");
    }
  });
  it("bounds effective density and area at 4K/high DPI", () => {
    expect(boundedResolutionScale(1440, 900, 3)).toBe(1.5);
    const scale = boundedResolutionScale(3840, 2160, 1.5);
    expect(3840 * 2160 * scale * scale).toBeLessThanOrEqual(8_300_001);
  });
  it("retains actual slow frames in P95 without inventing GPU time", () => {
    const window = new FrameWindow();
    let now = 0;
    window.push(now);
    for (let i = 0; i < 100; i++) { now += i % 10 === 0 ? 50 : 16; window.push(now); }
    expect(window.read(60)).toMatchObject({ medianFrameTimeMs: 16, p95FrameTimeMs: 50, lateFrameRatio: 0.1 });
    window.reset();
    window.push(100_000);
    expect(window.read(60)).toBeNull();
  });
  it("expires old intervals and bounds memory during long sessions", () => {
    const window = new FrameWindow();
    for (let i = 0; i < 100_000; i++) window.push(i * 10);
    expect(window.read(120)?.medianFrameTimeMs).toBe(10);
    window.push(1_020_000);
    window.push(1_020_016);
    window.push(1_020_032);
    expect(window.read(60)?.medianFrameTimeMs).toBe(16);
  });
  it("does not sample idle gaps or retain monitor listeners after suspension", () => {
    vi.useFakeTimers();
    const preRender = new Event();
    const postRender = new Event();
    const sample = vi.fn();
    const monitor = new PerformanceMonitor({ preRender, postRender } as Scene, sample);
    monitor.start(); monitor.start();
    expect(postRender.numberOfListeners).toBe(1);
    preRender.raiseEvent(); postRender.raiseEvent();
    vi.advanceTimersByTime(1000);
    expect(sample).toHaveBeenLastCalledWith(expect.objectContaining({ statistics: null, gpuTimeMs: null, presentedFrames: 1 }));
    monitor.dispose();
    expect(postRender.numberOfListeners).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(sample).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("lets Eco recover at its own 45 FPS ceiling", () => {
    const controller = new AdaptiveQualityController("eco", "high");
    for (let i = 0; i < 19; i++) expect(controller.sample(45, false, 45, i * 1000)).toBeNull();
    expect(controller.sample(45, false, 45, 20_000)).toBe("balanced");
    for (let i = 0; i < 3; i++) controller.sample(40, false, 60, 21_000 + i * 1000);
    expect(controller.getCurrent()).toBe("eco");
    for (let i = 0; i < 25; i++) controller.sample(45, false, 45, 24_000 + i * 1000);
    expect(controller.getCurrent()).toBe("eco");
    expect(controller.sample(45, false, 45, 54_000)).toBe("balanced");
  });
  it("can recover a profile while optional-effect degradation is withheld", () => {
    const controller = new AdaptiveQualityController("balanced", "high");
    for (let i = 0; i < 5; i++) controller.sample(20, false, 60, i * 1000, false);
    expect(controller.getCurrent()).toBe("balanced");
    for (let i = 0; i < 20; i++) controller.sample(60, false, 60, 10_000 + i * 1000, false);
    expect(controller.getCurrent()).toBe("high");
  });
  it("uses terrain hysteresis and bounded per-tile retries", () => {
    expect(shouldUseDetailedTerrain(false, 8_100_000, 40)).toBe(false);
    expect(shouldUseDetailedTerrain(false, 6_400_000, 40)).toBe(true);
    expect(shouldUseDetailedTerrain(true, 6_900_000, 40)).toBe(true);
    expect(shouldUseDetailedTerrain(true, 8_100_000, 40)).toBe(false);
    expect(shouldUseDetailedTerrain(false, 4_000_000, 80)).toBe(false);
    expect([0, 1, 2, 3].map(retryTile)).toEqual([true, true, false, false]);
  });
  it("measures visible overlays relative to the canvas, not a fixed sidebar", () => {
    expect(measureOverlayInsets({ left: 250, top: 40, right: 1440, bottom: 900 }, [
      { bounds: { left: 1100, top: 100, right: 1430, bottom: 800 }, edge: "right" },
      { bounds: { left: 0, top: 0, right: 240, bottom: 900 }, edge: "left" },
    ])).toEqual({ left: 12, top: 12, right: 352, bottom: 12 });
  });
  it("migrates v3 settings with closed drawer and 60 FPS, preserving prior choices", () => {
    expect(migratePreferences({ locale: "ru", graphicsQuality: "eco", units: "imperial", reduceMotion: true }))
      .toMatchObject({ locale: "ru", graphicsQuality: "eco", units: "imperial", reduceMotion: true, earthFrameRateMode: "60", earthLayerDrawerOpen: false });
  });
});
