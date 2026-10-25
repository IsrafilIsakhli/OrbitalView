# Earth scene repair — 25 October 2026

The report in `docs/screenshots/earth-scene-repair/` contains before/after captures from the same real cached CelesTrak catalog (16,797 objects). Online and offline cases are separate.

## Root causes and fixes

- Graphics quality was treated as a hardware recommendation cap. On Intel UHD, choosing High actually applied Balanced. Manual selections now apply their own profiles immediately; load adaptation reduces optional effects and resolution within the chosen profile. At a 1440 × 900 viewport the normal render sizes are 1152 × 720, 1440 × 900 and 1728 × 1080.
- The old 45 FPS Eco limiter produced uneven presentation on a 60 Hz display. All profiles now use the selected display ceiling, with frame scheduling synchronized to the measured browser cadence.
- Every object selection restyled the entire catalog. Selection now updates its own markers, suppresses duplicate context orbit lines and skips hover GPU picking while the camera is moving or an inspector is open.
- The selected object now has an independent 5 Hz SGP4 worker stream. Bulk propagation remains at 1 Hz. Results carry a time-state revision so queued forecast responses cannot rewind or freeze a live target. Earth workers pause in celestial views and inactive workspaces.
- Detailed terrain was entered at 6,500 km camera altitude, invalidating the terrain quadtree during ordinary satellite focus. It is now entered below 120 km for surface inspection, then retained to avoid repeat invalidation.
- Near-nadir translated camera composition was losing its offset during Cesium heading/pitch/roll conversion. HUD composition now uses the perspective frustum, keeping Earth centred in the usable viewport without moving the physical target or introducing an end-of-flight jump.
- The default globe is larger; the corner header no longer consumes the full width of the desktop safe area. The star background is quieter and decorative. The current quality is visible in the header.
- Lunar inspection uses the illuminated side of the real UTC lunar position and the bundled NASA LRO surface. A body-centred inertial camera frame preserves manual controls as Earth-fixed coordinates rotate.
- Cesium's solar billboard measures distance using the camera's local position, which makes a body-centred close solar view incorrectly tiny. The Sun inspection view now uses a 3D illustrative photosphere at the real ephemeris position, explicitly labelled as a model rather than live imagery.
- Moon/Sun views support bounded wheel, button and keyboard zoom. Orbital layers are hidden and paused there, user layer visibility is preserved on return, and switching presets clears temporary object focus.
- LEO/ISS static presets now match their displayed 1,850 km / 420 km altitudes and open over the daylight hemisphere. The ISS preset remains explicitly distinct from tracking the real ISS.

## Verification scope

Automated checks cover explicit quality output, worker cadence and suspension, stale time-state rejection, repeated selection/close, animated follow/close, body camera orientation, zoom bounds, and responsive lunar/solar layouts. Online imagery and offline NASA fallback are tested separately. Sources, scripts and screenshots remain local to this repository.

These are browser tests of the same scene engine with the actual cached orbital elements, not a new native installer or a native FPS certification. Initial Cesium loading and the first online close-view tile/shader warm-up can still produce brief main-thread work; phase-labelled long-task measurements are retained in the JSON reports instead of being hidden.
## Check results

- 60 Vitest files, 218 tests passed.
- TypeScript, ESLint and the production build/bundle budget passed.
- Online scene audit: no page errors or external request failures; ArcGIS imagery reached high-resolution status.
- All manual quality profiles matched their requested values and produced distinct render sizes.
- The selected-target stream produced 8 updates in 1.6 seconds while the bulk catalog produced 1–2.
- Earth propagation stopped during celestial inspection; user visibility returned correctly.
- Lunar/solar zoom and layouts at widths 320, 390, 768 and 1440 passed without overflow.
- Twelve repeated selection/close cycles and an animated focus/follow/close sequence ended with no stale selection or follow state.
- Default Earth projection matched the measured usable viewport centre within 2 pixels.
- Secret-pattern scan and whitespace check passed.

Reproduce the browser checks with `scripts/earth-scene-audit.mjs` and the existing real-cache Earth QA entry. The harness no longer forces the private quality method: it exercises the normal preferences-to-engine path.
- Final Earth wheel/button/keyboard/right-drag regression passed with no page errors, no layout overflow, two render-target resizes and stable presented-frame tracking (spread below 0.001 pixel). During the isolated wheel interaction, median frame interval was 16.7 ms and P95 25.4 ms; these remain Chromium measurements rather than native acceptance.
- The tracking regression now samples scene postRender: raw worker positions between paints are not mistaken for a visible frame against the previous camera matrix.
