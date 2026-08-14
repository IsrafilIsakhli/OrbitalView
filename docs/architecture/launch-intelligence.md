# Launch & Mission Intelligence Architecture

Module 4 adds live launch operations without coupling external providers to the
React shell or the Cesium engine.

## Data flow

1. The Rust host requests the Launch Library 2.3 upcoming-launch and event
   endpoints.
2. Each successful paginated response is validated, reduced to its results
   collection, and written to the application cache.
3. The frontend invokes a single native `space_intelligence` boundary and uses
   Zod to validate every launch and event independently.
4. TanStack Query owns freshness, retries, and cross-screen request sharing.
5. Launch and mission views consume normalized records; the Cesium launch layer
   receives only coordinates and presentation-safe domain data.

The selected launch-pad weather follows the same path through the native
`launch_weather` boundary. Open-Meteo is queried only after a launch with valid
coordinates is selected.

## Reliability and rate discipline

- Launches and events use a 30-minute native disk cache.
- Anonymous Launch Library usage is bounded to at most four requests per hour
  during normal operation: one launch request and one event request per refresh.
- Launches are cached before the event request begins, so a slow second request
  cannot discard a successful launch response.
- Launch weather uses a 15-minute cache keyed by coordinates rounded to three
  decimal places.
- Expired data remains eligible as a last-known-good fallback when an upstream
  request fails.
- Response-size limits, coordinate limits, HTTPS-only external links, schema
  validation, and scoped Tauri opener permissions form the trust boundary.

## Rendering boundary

`CesiumLaunchLayer` implements the existing `EarthEngineLayer` contract in the
`launch` slot. It deduplicates upcoming missions by launch-site coordinates,
uses GPU-batched Cesium billboard and label collections, and adapts its render
budget to the engine quality profile. Amber diamond launch-pad billboards remain
at the real LL2 WGS84 coordinate, clamp to terrain, use screen-space separation,
and retain normal Earth depth testing. It has no knowledge of React, network
requests, or provider payloads.

The Earth surface stack now includes the bundled NASA Black Marble 2012 image.
Cesium's day/night imagery alpha blend displays it only on the unlit hemisphere,
above the online surface imagery and below operational overlays.

## UI modules

- `LaunchDashboard` owns the next-launch hero, real UTC countdown, launch
  timeline, mission detail, imagery credit, and selected-window weather.
- `MissionDashboard` owns upcoming EVAs, flybys, dockings, celestial events, and
  a compact launch manifest.
- `SearchPalette` shares the cached query and searches satellites, launches,
  companies, rockets, missions, and events without creating another network
  request.
- All product copy is delivered through Azerbaijani, English, Russian, and
  Spanish launch namespaces.

## Security

Remote launch imagery is limited by CSP to the Launch Library media host.
External URLs are normalized to HTTPS and opened through the official Tauri
opener plugin. Local Tauri asset fetches and WebAssembly compilation are allowed
explicitly; general JavaScript `unsafe-eval` remains disabled.
