# Earth & Orbit Engine Architecture

Status: production Earth/SSA composition implemented  
Last updated: 2026-08-09

## Scope

Module 2 provides Orbital Vision's production 3D Earth foundation. It deliberately contains no satellite records, orbit propagation, mission APIs, launch data, or live telemetry. The ISS preset is a camera position only.

## Runtime boundary

The React interface owns localized controls and a low-frequency telemetry overlay. Cesium owns the canvas, scene graph, render loop, clock, camera, and GPU resources outside React reconciliation. UI code consumes only the `EarthEngine` contract and dynamically loads the Cesium implementation when the Explore surface mounts.

`CesiumEarthEngine` is the composition root for the graphics runtime. It creates and disposes the widget, installs scene services, applies quality policy, exposes camera commands, and publishes immutable snapshots. UI components do not import Cesium types.

## Scene composition

- A fetch-independent ocean-toned ellipsoid is always available, so no image request can terminate renderer startup.
- The base globe uses a bundled 5400 × 2700 NASA Blue Marble Next Generation image with full geographic coverage. Cesium's packaged Natural Earth II tiles and a neutral polar-cap surface remain successive offline fallbacks. `SurfaceProviderCoordinator` upgrades imagery to Esri ArcGIS World Imagery and terrain to ArcGIS WorldElevation3D independently. Terrain is adaptive: the global and polar views use the complete ellipsoid to avoid Web Mercator polar gaps, while close views below 5,000 km and within ±70° enable high-resolution elevation. A provider failure preserves the base globe and reports a degraded state.
- Cesium's UTC system clock drives the Sun, globe lighting, dynamic atmosphere lighting, day/night terminator, and sky objects.
- `SkyAtmosphere`, ground atmosphere, high dynamic range, Rayleigh/Mie scattering parameters, fog, logarithmic depth, and Sun bloom are configured as scene capabilities.
- `ProceduralStarLayer` provides a deterministic GPU point field without depending on runtime skybox texture requests.
- `ScientificCloudLayer` uses the NASA GEOS-5 footprint as a thin WGS84-aligned shell on balanced/high WebGL2 paths. Eco and unsupported paths retain an imagery-layer fallback; neither route presents the visual separation as measured cloud altitude.
- Cinematic Earth rotation runs inside the render loop and pauses after direct camera input. Reduced-motion preferences disable it.

## Camera system

Camera behavior is isolated in `CesiumCameraController`. It configures inertia and input limits, suspends rotation after user interaction, and owns eased transitions to four presets:

- Earth: global overview
- Low Earth Orbit: close orbital perspective
- ISS View: camera-only 420 km perspective
- Moon View: mean Earth–Moon distance perspective

Presets are data-driven and can be extended without changing the UI control contract. Earth overview range is derived from vertical FOV, canvas size and target projected diameter instead of a fixed altitude. Every transition clears stale reference transforms, and satellite/launch focus applies inspector-aware horizontal safe-area composition.

## Adaptive quality

Hardware capability detection records WebGL version, renderer/vendor strings when available, texture limits, MSAA limits, antialias support, logical CPU count, and reported device memory. It selects an initial `eco`, `balanced`, or `high` profile and never exceeds the user's graphics preference.

Quality profiles coordinate resolution scale, terrain screen-space error, terrain cache size, target frame rate, MSAA/FXAA, fog, cloud render path, catalog-signal budget, semantic-marker/label budget and context-orbit/sample budget. `AdaptiveQualityController` uses sustained one-second FPS samples with asymmetric thresholds: degradation reacts quickly to persistent pressure, while upgrades require a longer stable interval. Adaptation pauses while terrain tiles are loading but remains active during camera interaction and follow.

When automatic rotation is disabled, Cesium request-render mode prevents unnecessary continuous redraws.

## Extensibility

`EarthLayerRegistry` owns independent lifecycle contracts for these reserved slots:

- `system`
- `satellite`
- `launch`
- `weather`
- `mission`

Layers receive only the Cesium scene, clock, render request function, and current quality. They can mount, unmount, change visibility, receive quality changes, and dispose deterministically. Future modules can plug into these slots without changing React or the engine core.

## Resource lifecycle

All Cesium events, camera handlers, performance sampling, surface-provider listeners, primitives, layers, and the widget are released through one idempotent teardown path. Initialization failures also execute the same release path before the localized error surface is shown.

## Security and network posture

The desktop content security policy permits only the selected ArcGIS imagery and elevation endpoints plus local Cesium workers/assets. No Cesium ion token is embedded. CelesTrak is accessed only by the native Rust client, not by WebView JavaScript. NASA, SpaceX, The Space Devs, launch weather, and mission telemetry endpoints are absent.
