import type { Scene } from "cesium";

import { readMemorySnapshot } from "./gpuCapabilities";
import { FrameWindow, type FrameStatistics } from "./frameStatistics";

export interface PerformanceSample {
  statistics: FrameStatistics | null;
  cpuRenderMs: number | null;
  gpuTimeMs: null;
  presentedFrames: number;
  memory: ReturnType<typeof readMemorySnapshot>;
}

export class PerformanceMonitor {
  private readonly window = new FrameWindow();
  private continuous = false;
  private target = 60;
  private presentedFrames = 0;
  private renderStartedAt: number | null = null;
  private cpuRenderMs: number | null = null;
  private removers: (() => void)[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly onSample: (sample: PerformanceSample) => void,
  ) {}

  start(): void {
    if (this.timer !== null) return;
    this.window.reset();
    this.removers = [
      this.scene.preRender.addEventListener(() => { this.renderStartedAt = performance.now(); }),
      this.scene.postRender.addEventListener(this.handlePostRender),
    ];
    this.timer = setInterval(() => this.onSample({
      statistics: this.continuous ? this.window.read(this.target) : null,
      cpuRenderMs: this.cpuRenderMs,
      gpuTimeMs: null,
      presentedFrames: this.presentedFrames,
      memory: readMemorySnapshot(),
    }), 1_000);
  }

  setMode(continuous: boolean, target: number): void {
    if (this.continuous !== continuous || this.target !== target) this.window.reset();
    this.continuous = continuous;
    this.target = target;
  }

  dispose(): void {
    this.removers.forEach((remove) => remove());
    this.removers = [];
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.window.reset();
    this.cpuRenderMs = null;
  }

  private readonly handlePostRender = (): void => {
    const now = performance.now();
    this.presentedFrames += 1;
    this.cpuRenderMs = this.renderStartedAt === null ? null : now - this.renderStartedAt;
    if (this.continuous) this.window.push(now);
  };
}
