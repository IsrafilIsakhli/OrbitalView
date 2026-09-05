# Earth focus, follow and visual refinement — 2026-09-05

Implemented locally on the existing 0.2.0 candidate. No tag, installer publication,
updater release, provider/cache deletion or preference reset was performed.

## Camera and tracking

- Follow binds the current view to the selected object's east/north/up reference
  frame without jumping. Each tick updates the frame and preserves the user's
  local camera position and orientation, including wheel zoom and drag orbit.
- Focus/follow cancels pending return and existing flights. Canvas input can
  interrupt a flight. Object focus suppresses cinematic auto-rotation until an
  explicit preset or close; it is no longer just a ten-second pause.
- A camera-only clearance guard prevents tracked-frame rotation through Earth
  and known terrain (900 m clearance). Satellite positions are never clamped.
- Follow stops when selecting another object or propagation becomes invalid.
  Releasing follow preserves the world camera pose. A catalog refresh preserves
  the selection, follow session and category focus; the handoff request is
  consumed after one successful focus instead of refocusing on refresh.
- Camera/layer updates run in preUpdate before Cesium captures render matrices.
  The decorative selected-ring pulse no longer forces continuous idle renders.

The existing CelesTrak provider, SGP4 worker, orbit/ground-track geometry and
scientific sampling/LOD budgets are retained.

## Scene and interface

- Sunlight/night-side rendering no longer fades away with orbital zoom distance.
  The initial view is oriented 38 degrees from the real subsolar longitude to
  present more illuminated surface while retaining the terminator.
- The optional static GEOS-5 shell remains 7.5 km above the ellipsoid, a visual
  separation only. Clouds use the real Sun direction. At low camera altitude
  the shell hands off to imagery: 35 km descending / 60 km ascending hysteresis.
  Imagery remains visible until the shell is ready, and only one is visible.
- Cloud ordering uses collection events rather than repeated reordering checks.
- Smaller Earth overview, clearer layer header and render-details disclosure,
  full-width 44 px category group controls, readable hidden categories, icon
  camera presets and larger context-card metadata.
- The mobile layer sheet has a bounded height and visible close button. HUD/dock
  are hidden while that sheet is open so their measured safe areas cannot
  overlap into a negative Earth viewport. The backdrop no longer blurs Earth.

## Verification

Evidence: `docs/screenshots/earth-camera-refinement/after.json` and
`docs/screenshots/earth-camera-refinement/stability/browser-report.json`.
The harness is development-only and reads the native CelesTrak cache without
modifying it. Online ArcGIS requests are intentionally blocked to verify local
NASA fallback. This is not a native WebView/installer test.

- Real cache: 16,531 objects; fetched 2026-09-04T22:30:24.682Z.
- Wheel zoom persists across subsequent target frames; drag orientation remains
  under user control; follow release camera displacement 0 m.
- Catalog refresh: zero additional focus flights, follow remains enabled.
- Follow during a focus flight: no concurrent camera flight remains.
- Hidden Earth: frame count 566 → 566, worker frames 25 → 25; render loop disabled.
- 50 workspace cycles, 50 category cycles and 20 selection cycles: one live
  orbit worker; scene primitives 14 → 14, satellite primitives 11,204 → 11,204.
- Warm resume: 21.8 ms in this isolated run. Unmount: zero workers/canvases.
- Time Lens pause/resume and return-to-now passed; update pause veto passed.
- AZ/TR/EN/RU/ES and 320×568 through 3840×2160: no horizontal overflow reported.
- Optional cloud failure fell back to imagery. Non-cloud render failure paused
  the engine; no uncaught page errors were observed.

Short instrumentation sample: NVIDIA RTX 4060 Laptop / ANGLE D3D11, Chromium,
1440×900, high profile, real cache and local imagery, 12 seconds of auto-rotation.
The last ten-second window recorded approximately 60 FPS, median 16.7 ms and
P95 21.4 ms. This is a short absolute measurement, **not an FPS improvement claim**.
The earlier screenshots already include some initial refinement, use a different
clock time, and are not a controlled visual/performance A/B baseline.

TypeScript, ESLint and all 190 frontend tests across 53 files passed, including
the real-Cesium camera and cloud fallback regressions. Production Vite compilation passes.
The existing release CSS budget remains blocked: about 200.7 kB vs 150 kB;
largest non-Cesium chunk about 419 kB vs 550 kB. Limits were not raised.

Native Windows interaction/driver QA, live online terrain QA, 60-minute memory
plateau, 120 Hz hardware testing and macOS/Linux installer tests remain required
before release approval. No native FPS guarantee is made from Chromium output.

## Recovery

Verified checksum checkpoints include the pre-existing dirty and untracked work:

- `.release-baselines/2026-09-04T22-33-56-354Z` (648 files, initial checkpoint).
- `.release-baselines/2026-09-04T23-51-00-722Z` (659 files, before follow-frame integration).

Each contains `manifest.json`, its SHA-256 and a `files/` recovery copy. Restore
only individually reviewed source files after comparing their recorded hashes;
do not overwrite later user edits wholesale. Cache and credentials were excluded.
