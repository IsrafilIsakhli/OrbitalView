/** Enter detailed terrain only for surface inspection, then retain its
 * quadtree when zooming out. Cesium coarsens its tiles by screen-space error;
 * replacing the provider on every zoom discards even the loaded parent tiles.
 * Polar coverage still has separate entry/exit bands and a local fallback. */
export function shouldUseDetailedTerrain(currentlyDetailed: boolean, height: number, latitudeDegrees: number): boolean {
  // Loading and replacing an elevation quadtree at orbital altitudes adds
  // shader/tile stalls to every first satellite focus with no visible benefit.
  return (currentlyDetailed || height < 120_000) &&
    Math.abs(latitudeDegrees) < (currentlyDetailed ? 75 : 72);
}

export function retryTile(timesRetried: number): boolean {
  return Number.isFinite(timesRetried) && timesRetried >= 0 && timesRetried < 2;
}
