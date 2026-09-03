import type { Scene } from "cesium";

import { readMemorySnapshot } from "./gpuCapabilities";

export interface PerformanceSample {
  fps: number;
  frameTimeMs: number;
  memory: ReturnType<typeof readMemorySnapshot>;
}

export class PerformanceMonitor {
  private frameCount = 0;
  private lastSampleAt = performance.now();
  private removePostRender: (() => void) | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly onSample: (sample: PerformanceSample) => void,
  ) {}

  start(): void {
    if (this.removePostRender) {
      return;
    }
    this.frameCount = 0;
    this.lastSampleAt = performance.now();
    this.removePostRender = this.scene.postRender.addEventListener(
      this.handlePostRender,
    );
  }

  dispose(): void {
    this.removePostRender?.();
    this.removePostRender = null;
    this.frameCount = 0;
  }

  private readonly handlePostRender = (): void => {
    this.frameCount += 1;
    const now = performance.now();
    const elapsed = now - this.lastSampleAt;
    if (elapsed < 1_000) {
      return;
    }

    const fps = (this.frameCount * 1_000) / elapsed;
    this.onSample({
      fps: Math.round(fps * 10) / 10,
      frameTimeMs: Math.round((1_000 / fps) * 10) / 10,
      memory: readMemorySnapshot(),
    });
    this.frameCount = 0;
    this.lastSampleAt = now;
  };
}
