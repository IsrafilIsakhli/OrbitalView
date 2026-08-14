# Module 5 performance baseline

Measured on 2026-08-07 from the optimized Tauri release build after the scene and live catalogs reached steady state.

## Environment

- GPU: NVIDIA GeForce RTX 4060 Laptop GPU through ANGLE Direct3D 11 / WebGL 2
- CPU topology: 20 logical processors
- Quality profile: High / Ultra adaptive tier
- Scene: animated UTC Earth, atmosphere, stars, NASA GEOS-5 cloud map, night lights, launch sites, satellite markers, and real orbit paths
- Live data: 16,307 valid orbital objects, 13 recent rocket bodies, 12 showcase orbit paths, 100 launches, and 34 launch sites

## Results

| Metric | Result |
| --- | ---: |
| Engine frame rate | 59.9-60.1 FPS |
| Process-tree CPU, 5-second average | 2.27% of total machine capacity |
| Process-tree working set | 912.8 MB |
| Process-tree private memory | 1,047.2 MB |
| GPU engine utilization, 5 samples | 25.40% average |
| GPU engine utilization peak | 28.00% |
| Application console warnings/errors | 0 |

The process-tree figures include the native Tauri host and six WebView2 subprocesses. GPU utilization is the sum of Windows GPU-engine counters belonging to that process tree.

## Interpretation

The RTX 4060 sustains the target 60 FPS with all high-quality layers active and substantial GPU headroom. CPU cost remains low because SGP4 propagation runs in a dedicated worker and Cesium batches point and polyline primitives. Memory is dominated by Cesium terrain/imagery caches, WebView2, the 16,307-object catalog, and GPU resources.

Module 6 should add a repeatable low-end integrated-GPU profile and a long-duration memory plateau test before introducing live weather raster layers.
