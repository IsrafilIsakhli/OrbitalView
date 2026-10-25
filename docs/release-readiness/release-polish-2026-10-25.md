# Release polish — 25 October 2026

## Completed

- Fixed satellite point and label updates that mutated Cesium's internal position before its setter ran. This skipped GPU invalidation, leaving visible markers frozen while propagation and tracking continued.
- Reuse one scratch vector when publishing catalog positions; use the public position setter for selection and hover markers.
- Avoid rebinding the follow-camera transform when the propagated target has not changed. Keep terrain clearance and user zoom/orbit controls active.
- Avoid repeated selection-clear notifications and unchanged follow-policy updates.
- Keep adaptive quality degradation available when many surface tiles are pending, rather than suppressing load adaptation indefinitely.
- Remove the Spaceflight News API v4 label from the news header and compact the counter card.
- Remove NASA credential controls from Settings. Existing native credential handling is preserved; README setup instructions updated.
- Replace the radius canvas with a responsive, localized orbital-plane diagram, radius/altitude readouts and a time slider. Angular phase is integrated from elapsed time and h/r² instead of mapping every analysis interval onto one revolution.
- Synchronize chart cursors with the radius time slider; initialization and resize no longer replace the selected sample.

## Verification

- TypeScript and ESLint: pass.
- Frontend production build and repository bundle budgets: pass. Cesium's existing large-chunk warning remains.
- Vitest: 58 files / 209 tests passed.
- Rust library tests: 53 passed, 1 previously ignored.
- Release tooling tests: 10 passed; update policy validation passed.
- Earth interaction regression: real cached catalog of 16,797 objects, zero page errors, bounded wheel/button/keyboard/right-drag zoom, stable target tracking, two render-target resizes during the wheel stress case, no overflow at 320/390/768/1440 widths.
- Radius visual regression: real cached elements propagated by the analysis worker; time selection and resize preservation passed, all five languages captured, no page errors or horizontal overflow.
- Browser app smoke: all five languages; English sizes 320 through 3840; navigation and Settings lazy loading passed with no page errors. Native providers intentionally unavailable in this browser-only case.
- Reports: `docs/screenshots/earth-zoom-stability/after.json`, `docs/screenshots/release-polish/report.json`, `docs/screenshots/release-polish/browser-smoke.json`.

## Remaining release limitation

The current Windows packaging attempt failed with `linker link.exe not found` during the Rust release link. No new Windows installer was produced. Existing installers under target/release/bundle and release-artifacts predate these changes and must not be represented as this build.

The MSVC C++ build environment must be available before building NSIS/MSI. This run did not verify a freshly linked native WebView build, installer execution, native FPS, or a long-session soak. Chromium interaction measurements are regression evidence, not native performance acceptance. No deployment, publishing, signing, or release upload was performed.
