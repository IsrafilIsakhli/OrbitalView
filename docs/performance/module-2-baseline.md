# Module 2 Performance Baseline

Date: 2026-08-06  
Build: optimized Rust release host with Vite production assets  
Sample: 15-second warm-up followed by a 10-second steady-state native process sample

## Reference machine

- Windows desktop host with 20 logical processors
- NVIDIA GeForce RTX 4060 Laptop GPU, driver 32.0.16.1088
- Intel UHD Graphics, driver 32.0.101.6790
- WebView2 process model

Windows' legacy adapter-memory field reported 4 GB and 2 GB respectively; those values are included only as OS-reported compatibility data and are not treated as authoritative dedicated VRAM figures.

## Results

| Metric | Result | Notes |
| --- | ---: | --- |
| Desktop launch | Passed | Native main window handle created; no early exit |
| Process count | 7 | Orbital Vision host plus WebView2 subprocesses |
| Working set | 377.9 MB | Aggregate steady-state process tree |
| Private memory | 247.7 MB | Aggregate steady-state process tree |
| CPU | 0.00% | Occluded/hidden-window sample; confirms background throttling but is not an active-interaction benchmark |
| Release executable | 8,428,544 bytes | Rust/Tauri host; web assets are embedded separately by Tauri |
| FPS | Not externally captured | In-engine one-second FPS telemetry is implemented; local WebView inspection was denied by the host security policy |
| Selected GPU | Not externally captured | Engine requests high-performance WebGL and reports the selected renderer in its HUD; host inspection was denied |

## Interpretation

The sample verifies release startup, WebView2 stability, cleanup, and idle/occluded memory behavior. It does not claim an interactive FPS result. A visible, unobstructed GPU benchmark on the release window is still required before the 60 FPS target can be certified for this machine.

## Engine performance controls

- Lazy Cesium engine import and separate production chunk
- WebGL capability detection and user-quality cap
- Eco, balanced, and high profiles
- Sustained-sample automatic degradation and conservative recovery
- MSAA where available with FXAA fallback
- Terrain screen-space error and cache budgets per profile
- Cloud count/noise budgets per profile
- Cesium request-render mode when cinematic rotation is disabled
- Deterministic listener, primitive, provider, and widget teardown

