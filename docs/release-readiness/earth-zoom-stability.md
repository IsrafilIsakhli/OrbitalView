# Earth zoom and tracking stability — 2026-09-06

## Reproduced causes

The previous interaction check covered short wheel gestures, not repeated large
scroll deltas. The new `scripts/earth-zoom-stress.mjs` uses the real local
CelesTrak catalog (16,531 objects) in an isolated development-only entry.

- Sixteen outward wheel bursts reached 219,999,999,999.97 m Earth altitude:
  the Earth controller reused a solar-scale maximum zoom distance.
- Thirty alternating wheel gestures at 220 ms spacing produced 60 observed
  render-size changes. The old 160 ms resolution recovery repeatedly recreated
  render targets between individual wheel events.
- Follow interpolated a camera-only target behind the latest visible worker
  position. At a very close range, the 1 Hz marker update could cross the view
  faster than the camera caught up.
- Terrain changed providers around altitude thresholds during motion, discarding
  the quadtree. Native navigation could also depth-pick satellite geometry rather
  than Earth's surface.

## Changes

- Bounded, symmetric logarithmic wheel input; normalized pixel/line/page deltas;
  limited queued input and per-frame integration; immediate direction reversal.
- Earth altitude / tracked range limit 100,000 km, 900 m minimum target range
  and clearance above the ellipsoid or known terrain. Invalid candidate moves
  stop along the requested path instead of crossing the globe and clamping back.
- Native pinch/right-drag retain public Cesium controls, lower inertia and an
  Earth-specific limit. Free-look is disabled and tilt is bounded. Moon/Sun
  presets retain their existing native wheel behavior and solar-scale bound.
- Wheel anchors use ellipsoid picking, not satellite/cloud depth. Depth-position
  picking is disabled; ID picking for satellite and launch selection is retained.
- Follow binds to the exact displayed worker frame without a separate delayed
  camera interpolation. SGP4, propagation rate, satellite coordinates, scientific
  orbit/ground-track samples and marker budgets are unchanged.
- Resolution recovers after 650 ms of quiet and completed camera motion, not
  between wheel ticks. Suspend cancels queued zoom; resume restores resolution.
- Terrain handoff waits for movement to settle. Once detailed terrain is active,
  zooming out retains its quadtree; Cesium selects coarse tiles itself. Polar
  fallback and provider error handling remain.
- 44 px zoom buttons and canvas-focused `+`, `-` and Home keyboard controls,
  localized in AZ/TR/EN/RU/ES. Moon/Sun disable these Earth-specific buttons.

## Evidence and boundaries

`docs/screenshots/earth-zoom-stability/before.json` and `after.json` record the
stress sequence. The earlier baseline does not include the subsequently added
button, keyboard and projection checks. This is a behavioral comparison, not a
controlled native FPS improvement benchmark.

- Outward bursts now stop below 100,000,000 m; inward gestures remain above the
  clearance bound. Button/keyboard direction assertions and right-drag pass.
- Close tracked-target projection spread over multiple worker frames: less than
  0.001 px; no page errors. Real propagation remains active.
- Alternating-gesture render-size observations: 60 before, 1 in the final run
  (the first observation counts the current target size). Final short gesture
  sample: median 16.7 ms, P95 22 ms, maximum 25.9 ms. Not a native FPS guarantee.
- 320, 390, 768 and 1440 px stress layouts: no horizontal document overflow.
- The existing full lifecycle smoke passed with the new camera: 50 workspace
  cycles, 50 category cycles, 20 selection cycles; scene primitives 14 → 14,
  satellite primitives 11,204 → 11,204. One worker; zero after teardown.
- Hidden frames 589 → 589 and worker frames 24 → 24. Warm resume about 19.7 ms
  in this isolated run. Time Lens, update veto, focus/drawer restoration passed.
- Five locales and sizes through 3840×2160 passed the lifecycle smoke. Short
  high-profile rotation on RTX 4060 Laptop / ANGLE D3D11 measured about 60 FPS.

The browser tests intentionally block ArcGIS to verify local NASA imagery.
Deferred/sticky terrain transitions have unit tests, but live online terrain,
native Windows WebView interaction, actual touch hardware, 120 Hz and a long
session still need device testing. No claim that every native driver issue is
eliminated is made. No installer or public release is published here.

Typecheck, ESLint and 199 frontend tests passed before the final sticky-terrain
assertion update; typecheck, ESLint and 14 targeted runtime/terrain tests passed
again after that change. Production Vite
compilation passes. The existing release CSS gate remains over budget:
201,275 bytes versus 150,000; non-Cesium JS maximum 419,855 versus 550,000.

## Recovery

Verified 688-file checksum copy before edits:
`.release-baselines/2026-09-06T00-01-10-519Z`.
Clean starting commit: `079842dfc9558b1ca53eaba23dd2e4a404714672`.
Compare and restore individual affected source files only; never clear user
cache/preferences or overwrite subsequent changes. No new runtime dependency.
