# Live Satellite Engine Architecture

Status: production SSA redesign implemented  
Last updated: 2026-08-09

## Scope

Module 3 adds real active-Earth-orbit data, SGP4 propagation, batched rendering, search, selection, an inspected orbit path, and current derived telemetry. It does not add launches, mission APIs, weather, debris, deep-space missions, or fabricated satellite records.

## Data boundary

The Rust host is the only runtime allowed to contact CelesTrak. It fetches active General Perturbations data as OMM JSON and active SATCAT metadata as JSON. The two responses are validated and cached independently under the application cache directory.

Each component has a two-hour freshness window. A fresh component never triggers a network request. When refresh fails, a last-known-good component is returned with an explicit stale flag. OMM is persisted before the larger SATCAT request begins, so a slow metadata response can never discard successful rate-limited orbital data. Responses are capped at 64 MB and the native client uses a 90-second timeout.

The TypeScript boundary validates the native payload with Zod, rejects malformed records individually, joins metadata by NORAD catalog ID, and exposes normalized immutable `SatelliteRecord` objects. Owner and operational fields remain provider codes where CelesTrak supplies codes rather than descriptive names.

## Propagation boundary

High-frequency orbital work never runs in React or on the UI thread. A dedicated module Worker owns satellite.js 7.1's single-thread WASM `BulkPropagator` and updates every valid active object once per second using current UTC.

The Worker transfers typed arrays rather than cloning object graphs:

- ECF positions in meters
- propagation error codes
- altitude and ECI velocity magnitude telemetry

Only selected, hovered and a quality-bounded set of context objects use the JavaScript propagation path for orbit geometry. Samples are first retained in ECI. A space orbit transforms every sample with one reference-timestamp GMST frame; a ground track transforms each sample with its own timestamp. This keeps the space orbit a stable plane while preserving the Earth-fixed ground trace.

## Rendering boundary

`CesiumSatelliteLayer` is an `EarthEngineLayer` plugin in the reserved satellite slot. It owns reusable collections for catalog signals, semantic symbols, interaction markers, labels, space orbits, trail/direction geometry and terrain-aware ground track. React receives low-frequency immutable snapshots only; it never owns per-frame positions.

Catalog-signal budgets are 6,000 in eco, 12,000 in balanced, and the complete catalog in high quality. Semantic-marker budgets are independently bounded at 90, 160 and 240. Deterministic real-object selection uses category priority and altitude/inclination/RAAN diversity. Propagation still covers the complete catalog at every quality level.

All normal markers are depth-tested against Earth and have no halo. Hover and selection use a separate, depth-tested interaction pass so quality sampling never hides the active object. Category visibility and category focus are independent, and neither operation restarts the Worker or rebuilds the complete point collection.

## Interaction

Clicking a satellite or choosing a search result selects the real catalog record. The information panel presents CelesTrak metadata plus current derived altitude, velocity, latitude, and longitude. Selection displays a label, stable full orbit, terrain-aware ground track, trail and direction cue. Focus moves to the visible hemisphere; follow uses per-frame damping over the 1 Hz propagated positions.

Search is lazy and starts only after the palette is open and at least two characters are entered. It matches real names and NORAD IDs and does not download a second catalog.

## Lifecycle and failure behavior

Catalog requests are deduplicated by TanStack Query. Layer unmount terminates the Worker, destroys the Cesium input handler, removes all primitive collections, and releases WASM memory. Engine failures retain a support-safe technical detail on the localized recovery surface. Provider failures degrade independently without terminating the base globe.
