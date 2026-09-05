/** Separate entry/exit bands prevent provider churn during small camera moves.
 *  Thresholds sit well below the default Earth overview so plain ellipsoid
 *  shading costs nothing at global scale, yet real relief arrives early enough
 *  that orbiting/zooming towards a region visibly "pops" into 3D terrain. */
export function shouldUseDetailedTerrain(currentlyDetailed: boolean, height: number, latitudeDegrees: number): boolean {
  return height < (currentlyDetailed ? 8_000_000 : 6_500_000) &&
    Math.abs(latitudeDegrees) < (currentlyDetailed ? 75 : 72);
}

export function retryTile(timesRetried: number): boolean {
  return Number.isFinite(timesRetried) && timesRetried >= 0 && timesRetried < 2;
}
