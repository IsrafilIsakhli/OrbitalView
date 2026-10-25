/** Enter detailed terrain once the user approaches Earth, then retain its
 * quadtree when zooming out. Cesium coarsens its tiles by screen-space error;
 * replacing the provider on every zoom discards even the loaded parent tiles.
 * Polar coverage still has separate entry/exit bands and a local fallback. */
export function shouldUseDetailedTerrain(currentlyDetailed: boolean, height: number, latitudeDegrees: number): boolean {
  return (currentlyDetailed || height < 6_500_000) &&
    Math.abs(latitudeDegrees) < (currentlyDetailed ? 75 : 72);
}

export function retryTile(timesRetried: number): boolean {
  return Number.isFinite(timesRetried) && timesRetried >= 0 && timesRetried < 2;
}
