export interface FrameStatistics {
  fps: number;
  medianFrameTimeMs: number;
  p95FrameTimeMs: number;
  lateFrameRatio: number;
}

/** Bounded active-render intervals, not reciprocal one-second frame counts. */
export class FrameWindow {
  private readonly timestamps = new Float64Array(2_400);
  private readonly intervals = new Float64Array(2_400);
  private cursor = 0;
  private count = 0;
  private previous: number | null = null;

  reset(): void { this.previous = null; this.cursor = 0; this.count = 0; }

  push(now: number): void {
    if (this.previous !== null && now > this.previous) {
      this.timestamps[this.cursor] = now;
      this.intervals[this.cursor] = now - this.previous;
      this.cursor = (this.cursor + 1) % this.timestamps.length;
      this.count = Math.min(this.count + 1, this.timestamps.length);
    }
    this.previous = now;
  }

  read(target: number): FrameStatistics | null {
    const sorted: number[] = [];
    for (let index = 0; index < this.count; index += 1) {
      if ((this.previous ?? 0) - this.timestamps[index]! <= 10_000) sorted.push(this.intervals[index]!);
    }
    if (sorted.length < 2) return null;
    sorted.sort((a, b) => a - b);
    const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]!;
    const median = percentile(0.5);
    return {
      fps: 1_000 * sorted.length / sorted.reduce((sum, interval) => sum + interval, 0),
      medianFrameTimeMs: median,
      p95FrameTimeMs: percentile(0.95),
      lateFrameRatio: sorted.filter((interval) => interval > 1_500 / target).length / sorted.length,
    };
  }
}
