import type { CameraCompositionInsets } from "../contracts/earth-engine";

export interface OverlayBounds { left: number; top: number; right: number; bottom: number }
export interface MeasuredOverlay { bounds: OverlayBounds; edge: keyof CameraCompositionInsets }

export function measureOverlayInsets(viewport: OverlayBounds, overlays: MeasuredOverlay[]): CameraCompositionInsets {
  const insets: CameraCompositionInsets = { left: 12, right: 12, top: 12, bottom: 12 };
  for (const { bounds, edge } of overlays) {
    if (bounds.right <= viewport.left || bounds.left >= viewport.right ||
      bounds.bottom <= viewport.top || bounds.top >= viewport.bottom) continue;
    const amount = edge === "left" ? bounds.right - viewport.left :
      edge === "right" ? viewport.right - bounds.left :
        edge === "top" ? bounds.bottom - viewport.top : viewport.bottom - bounds.top;
    insets[edge] = Math.max(insets[edge], amount + 12);
  }
  return insets;
}
