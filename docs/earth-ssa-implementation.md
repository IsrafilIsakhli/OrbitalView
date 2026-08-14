# Earth SSA implementation

## Architecture audit

- Satellite truth source: CelesTrak OMM + SATCAT, normalized into `SatelliteRecord`.
- Propagation: the existing `satellite.js` WASM bulk propagator remains in a Web Worker. The main thread receives transferable typed arrays once per second.
- Rendering: satellites remain in Cesium GPU primitive collections. Catalog signals, bounded semantic markers, interaction primitives, selected orbit, ground track, trail and direction cue are separate, reusable passes.
- Launch truth source: Launch Library 2.3. Upcoming launches are grouped into real sites only when published coordinates exist.
- Rocket detail source: Launch Library 2.3 launcher-configuration detail responses are fetched lazily by real configuration ID and cached for 24 hours.
- Weather truth source: Open-Meteo current/hourly data, cached for 15 minutes.
- NASA modules and their native cache remain unchanged.
- No NOAA provider or NOAA cache exists in this repository. No NOAA capability is claimed by the UI.

## Interaction lifecycle

1. Hovering a rendered primitive exposes a lightweight tooltip and a debounced short orbit preview without selecting it.
2. Clicking a satellite or launch site creates one exclusive Earth selection.
3. Satellite selection requests two truthful geometries from the Worker: a stable ECI-derived space orbit in one reference frame and a time-varying ECF ground track. It renders the orbit, recent trail, direction cue and surface track before opening the shared inspector frame.
4. Focus and Follow are explicit actions. Escape clears either object type and releases Follow.
5. Ctrl+K satellite and launch results route to Earth and request the same selection/focus lifecycle.

## Visual system

- The Earth camera derives its startup longitude from Cesium's real Sun position, keeps the terminator visible with a 61 degree offset, and calculates range from FOV, viewport size and desired Earth occupancy.
- ArcGIS World Imagery remains the live high-resolution surface source. The bundled NASA Blue Marble fallback, Black Marble night layer and GEOS-5 cloud layer remain attributable, deterministic offline fallbacks.
- Sun lighting, limb atmosphere, ground atmosphere, night-light alpha and imagery tone are calibrated as one scene rather than independent decorative overlays.
- Balanced/high quality uses a thin WGS84-aligned GEOS-5 cloud shell; eco and incompatible WebGL paths use the imagery-layer fallback without moving the cloud footprint.
- The right controller owns clouds, night lights, bounded context orbits, selected ground track, launch sites and all nine satellite categories. Category focus and category visibility are independent operations.
- The catalog taxonomy includes science missions alongside station, Starlink, navigation, weather, communications, rocket body, debris and other active objects.
- Bottom context cards are derived from the real priority station and next Launch Library 2 launch. They enter the same selection path as direct globe interaction.

## Performance boundaries

- Eco, balanced and high profiles cap catalog signals at 6,000, 12,000 and the full catalog; semantic markers are independently capped at 90, 160 and 240.
- Normal halos are removed. Small distance-translucent signals, bounded semantic markers and an always-retained interaction pass provide the visual hierarchy.
- One selected orbit and one ground track are rendered at a time. Context orbits are quality-bounded at 1, 2 and 3 and selected from real altitude/inclination/RAAN diversity.
- Category toggles update collection visibility without restarting the Worker or rebuilding the full catalog.
- Hover orbit calculation is debounced and performed in the existing propagation Worker. Stale preview responses are discarded.
- Primitive collections and timers have explicit cleanup; selected/hover primitives are updated in place and no parallel Cesium entity system was introduced.
- Rocket technical detail is demand-loaded instead of expanding every upcoming-launch response.

## Data honesty

- Missing API fields render as unavailable; they are never inferred from a rocket name or mission title.
- Every inspector exposes its source and freshness/cached state.
- Launch sites are not created when LL2 omits coordinates.
- Payload names appear only when LL2 publishes a spacecraft payload in the launch response.
- Category counts shown in the controller are calculated from normalized live CelesTrak records, not UI constants.
- Science classification uses a bounded list of established mission-name families; unmatched objects remain in the honest `other-active` category.
- Every semantic marker and representative orbit points to a real catalog index and real propagated coordinate.

## Native verification snapshot

The 2026-08-09 native QA run loaded 16,316 CelesTrak objects and 34 Launch Library 2 sites through the Tauri boundary. The category total exactly reconciled to the catalog total:

| Category | Count |
| --- | ---: |
| Space stations | 17 |
| Starlink | 10,893 |
| Navigation | 115 |
| Meteorological | 15 |
| Science missions | 34 |
| Communications | 783 |
| Rocket bodies | 15 |
| Orbital debris | 2 |
| Other active | 4,442 |
| **Total** | **16,316** |

The same native session verified overview, Starlink/debris focus, ISS selection and smooth follow, Escape cleanup, and the real Wenchang launch-site inspector. The 30-second high-profile run held 60 median FPS and 16.67 ms P95 frame time with no console errors or warnings.
