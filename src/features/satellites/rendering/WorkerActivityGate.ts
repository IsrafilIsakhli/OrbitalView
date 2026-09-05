/** Pause immediately; coalesce rapid resumes before posting expensive worker work. */
export class WorkerActivityGate {
  private resume: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly publish: (active: boolean) => void) {}

  set(active: boolean): void {
    this.cancel();
    if (!active) { this.publish(false); return; }
    this.resume = setTimeout(() => {
      this.resume = null;
      this.publish(true);
    }, 32);
  }

  cancel(): void {
    if (this.resume !== null) clearTimeout(this.resume);
    this.resume = null;
  }
}
