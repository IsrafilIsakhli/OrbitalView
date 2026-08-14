# Module 6 NASA Intelligence Baseline

Date: 2026-08-07  
Platform: Windows x64, production Tauri build  
Provider state: APOD, NeoWs, DONKI CME, DONKI flare, and DONKI storm current

## Provider policy

| Feed | Cache TTL | Dashboard query stale time | Native retry |
| --- | ---: | ---: | ---: |
| APOD | 24 hours | 30 minutes | 1 retry |
| NeoWs | 3 hours | 30 minutes | 1 retry |
| DONKI components | 1 hour | 30 minutes | 1 retry |

The cold dashboard issues the five independent NASA requests concurrently. Warm starts are served from native disk cache without repeating unexpired upstream calls. Each response is capped at 16 MiB.

## Live verification

- APOD, NeoWs, and DONKI returned HTTP 200 with the configured native key.
- The production dashboard rendered a current APOD, near-Earth approaches, DONKI events, and all five feed states.
- 1440 × 900 rendered four dashboard card regions with live normalized data.
- 1080 × 680 reported zero horizontal-overflow elements and a document width equal to the viewport width.
- 3840 × 2160 reported zero horizontal-overflow elements and a document width equal to the viewport width.
- Navigating to the existing satellite workspace retained the complete 16,307-object live catalog and its 60 FPS telemetry on the reference machine.

## Bundle observation

The production frontend completed successfully. The main application chunk was 375.66 kB before gzip and the application stylesheet was 91.63 kB before gzip. Cesium remains isolated in its existing engine chunk, so the NASA dashboard does not duplicate the globe runtime.

## Evidence

- `docs/screenshots/module-6-nasa-dashboard.png`
- `docs/screenshots/module-6-nasa-dashboard-1080.png`
