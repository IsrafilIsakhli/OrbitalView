export type EarthRenderMode = "continuous" | "on-demand" | "suspended";

export interface RenderActivity {
  workspace: boolean;
  document: boolean;
  update: boolean;
  motion: boolean;
}

/** Update preparation is a veto, never overridden by a workspace resume. */
export function resolveRenderMode(activity: RenderActivity): EarthRenderMode {
  if (!activity.workspace || !activity.document || activity.update) return "suspended";
  return activity.motion ? "continuous" : "on-demand";
}

export function boundedResolutionScale(width: number, height: number, desired: number): number {
  const area = Math.max(1, width) * Math.max(1, height);
  return Math.max(0.1, Math.min(desired, 1.5, Math.sqrt(8_300_000 / area)));
}
