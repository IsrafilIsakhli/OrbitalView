# Module 3 Performance Baseline

Date: 2026-08-06  
Build: Tauri optimized release with Vite production assets  
Profile: balanced, continuous rotation, bundled NASA base plus high-resolution ArcGIS imagery loaded

## Live dataset

| Item | Result |
| --- | ---: |
| Active OMM records | 16,303 |
| Active SATCAT records | 16,733 |
| OMM format | CelesTrak JSON/OMM |
| Cache freshness | 2 hours |
| Balanced render budget | 12,000 points |
| Propagation cadence | 1 second, complete catalog |

The runtime catalog was fetched at 2026-08-06T16:15:59.307Z. The cache contained a current `ISS (ZARYA)` record with epoch 2026-08-06T01:17:37.872384.

## Reference machine

- Windows host with 20 logical processors
- NVIDIA GeForce RTX 4060 Laptop GPU, driver 32.0.16.1088
- Intel UHD Graphics, driver 32.0.101.6790
- WebView2 / WebGL 2

## Results

| Metric | Result | Notes |
| --- | ---: | --- |
| In-engine FPS | 60 FPS | Visible production-window HUD after surface and satellite initialization |
| Frame target | 60 FPS | Balanced adaptive profile |
| CPU | 1.55% | Five-second aggregate sample normalized across 20 logical processors |
| Working set | 639.3 MB | Seven-process Tauri/WebView2 tree |
| Private memory | 759.2 MB | Seven-process Tauri/WebView2 tree |
| GPU 3D peak | 27.93% | Three one-second Windows GPU Engine samples for the application tree |
| GPU active-engine average | 13.63% | Average of six non-zero matching GPU engine samples |
| Root responsiveness | Passed | Native window reported responding throughout the sample |
| Production build | Passed | TypeScript and Vite assets plus optimized Rust host |

The host reports both a discrete and integrated compatible adapter. The engine requests a high-performance WebGL context and adapts quality from the context actually selected by WebView2; the external counter identifies physical adapter index 0 but does not expose a reliable product-name mapping.

## Interpretation

The reference machine sustains the 60 FPS target while propagating the complete live active catalog and rendering the balanced 12,000-point budget. The working set includes Cesium terrain/imagery caches, the WebView2 process model, the WASM propagator, two normalized source catalogs, and GPU-facing point buffers.

The application automatically reduces point count, resolution scale, terrain cache, clouds, stars, fog, and antialiasing on lower capability or sustained low-FPS hardware. High quality removes the satellite point cap.

## Validation limits

The release surface showed no engine or layer recovery state after the final fix. The host security policy did not permit attaching an independent browser console, so runtime console text was not externally captured. Render errors are now surfaced through a localized recovery screen with a technical detail instead of producing a silent black canvas.
