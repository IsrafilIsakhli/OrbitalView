# Module 4 Performance Baseline

Date: 2026-08-07  
Build: Tauri optimized release with Vite production assets  
Profile: high, continuous rotation, full satellite catalog, launch sites, NASA
night lights, ArcGIS imagery and adaptive terrain

## Live dataset

| Item | Result |
| --- | ---: |
| Active satellites | 16,303 |
| Upcoming launches | 100 |
| Unique rendered launch sites | 34 |
| Upcoming mission events | 29 |
| Launch weather hourly points per site | 384 |
| Launch data cache | 30 minutes |
| Weather cache | 15 minutes |

The validation snapshot included SpaceX Starlink Group 17-38 as the next launch,
29 upcoming space events, and live weather for the selected Vandenberg SLC-4E
launch window.

## Reference machine

- Windows host with 20 logical processors
- NVIDIA GeForce RTX 4060 Laptop GPU and Intel UHD Graphics
- WebView2 151 / WebGL 2

## Results

| Metric | Result | Notes |
| --- | ---: | --- |
| In-engine FPS | 60 FPS | Direct production WebView2 dataset reading |
| Active-scene CPU | 1.64% | Five-second process-tree sample, normalized across 20 logical processors |
| Settled idle CPU | 0.09% | Fully loaded scene without camera input |
| Settled working set | 1,005.4 MB | Seven-process Tauri/WebView2 tree after full terrain and WASM warm-up |
| Settled private memory | 931.4 MB | Seven-process Tauri/WebView2 tree |
| GPU 3D peak | 24.52% | Three one-second Windows GPU Engine samples |
| GPU active average | 23.41% | Active matching GPU-engine samples |
| Settled idle GPU | 0.22% | Peak while the fully loaded scene was stationary |
| Console warnings | 0 | Production WebView2 diagnostic session |
| Console errors | 0 | Production WebView2 diagnostic session |
| Root responsiveness | Passed | Native window responded throughout sampling |

## Interpretation

The high profile sustains the 60 FPS target while propagating the full active
satellite catalog, rendering 34 launch sites, loading high-resolution surface
providers, and retaining the 100-launch plus 29-event intelligence snapshot.
The memory figures include Cesium imagery and terrain caches, WebAssembly,
WebView2's process model, both normalized satellite catalogs, launch/event data,
and GPU-facing buffers. A short 1,598.8 MB working-set transient was observed
while terrain and WebAssembly resources compiled; it returned to approximately
1,005 MB after warm-up instead of accumulating.

Adaptive quality continues to lower resolution, MSAA, terrain cache, clouds,
stars, and satellite/launch render budgets on constrained hardware.

## Known limits

- Launch-window weather is available only within Open-Meteo's 16-day horizon.
- Launch and event timing is provider-supplied and may change near T-0.
- NASA Black Marble is a static 2012 composite; clouds remain a procedural visual
  layer rather than a meteorological cloud product.
- Rocket ascent paths, debris, live mission telemetry, and historical launches
  are not part of Module 4.
