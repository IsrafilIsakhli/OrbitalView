# ADR 0002: CesiumJS Earth Engine Boundary

Status: accepted  
Date: 2026-08-06

## Context

Orbital Vision needs a high-fidelity, geospatially correct Earth renderer that can later host thousands of tracked objects without coupling UI components to a graphics library. The engine must support terrain, real UTC lighting, physical atmosphere, camera flight, GPU primitives, streaming data sources, and deterministic disposal in a Windows WebView2 host.

## Decision

Use pinned CesiumJS 1.143 as the rendering foundation behind an application-owned `EarthEngine` interface.

Cesium assets and workers are copied into the production bundle. A local Natural Earth base prevents a blank offline start; ArcGIS World Imagery and WorldElevation3D are progressive remote enhancements. Cesium's scene graph and render loop remain outside React, and all future visual domains enter through `EarthLayerRegistry` lifecycle contracts.

Use Cesium `CloudCollection` for the Module 2 visual cloud layer. It is explicitly non-meteorological. Use system UTC for lighting and clock behavior. Use capability- and performance-based quality profiles rather than one fixed rendering configuration.

## Consequences

- The application gains a mature WebGL geospatial engine, globe/terrain tiling, camera math, atmospheric rendering, and worker infrastructure.
- The Cesium engine chunk is large, so it is split and lazy-loaded only on the Explore surface.
- Remote high-resolution imagery and terrain require connectivity; local fallback rendering remains available.
- Real cloud weather, satellite tracking, and orbital calculations remain separate future layers.
- The UI is insulated from Cesium, making later engine upgrades or focused testing possible without rewriting product surfaces.

