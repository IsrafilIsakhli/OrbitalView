# ADR 0003: CelesTrak OMM and Worker-Owned SGP4

Date: 2026-08-06  
Status: accepted for Module 3 review

## Context

Orbital Vision needs current public orbital elements for more than sixteen thousand active objects, future catalog-number compatibility, responsive rendering, controlled provider traffic, and deterministic offline behavior. Propagation must not block React or force thousands of entities through reconciliation.

## Decision

Use CelesTrak active GP OMM JSON as the orbital source and active SATCAT JSON as the metadata source. Access both through a Rust `reqwest` service with independent two-hour caches, last-known-good fallback, response-size limits, one in-process request gate, and explicit freshness metadata.

Use satellite.js 7.1's single-thread WASM bulk runtime inside a dedicated Web Worker. Transfer typed arrays to an application-owned Cesium layer and render with batched primitive collections. Use the pure JavaScript propagator only for the currently selected object's orbit polyline.

Use OMM rather than TLE because CelesTrak documents OMM as compatible with nine-digit catalog numbers, while the legacy TLE format cannot represent newer six-digit catalog IDs.

## Consequences

Positive outcomes:

- The UI thread remains responsive while the complete active catalog propagates once per second.
- CelesTrak traffic respects the provider's update cadence and survives slow SATCAT responses.
- Future six- through nine-digit catalog identifiers do not require a data-format migration.
- Cesium point primitives keep draw-call and memory overhead substantially below one-entity-per-object designs.
- Provider, propagation, rendering, and UI can be tested or replaced independently.

Trade-offs:

- The first uncached SATCAT response is several megabytes and can take tens of seconds.
- satellite.js WASM adds about 183 KB to the dedicated Worker bundle.
- CelesTrak owner and status fields are catalog codes; richer organizations and media require a separately approved enrichment source.
- OMM freshness is not live telemetry. Positions are propagated estimates based on the latest published elements.

## Rejected alternatives

- Browser-direct CelesTrak access: weaker cache control, CSP expansion, duplicated downloads, and provider coupling in UI code.
- TLE-only ingestion: incompatible with the current catalog-number transition.
- React entities for every object: unacceptable reconciliation and allocation pressure.
- Propagating all orbit trails for all objects: multiplicative CPU and memory cost without commensurate product value.

