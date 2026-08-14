# Orbital Vision

Orbital Vision is a local-first, cross-platform space-intelligence and space-situational-awareness platform for Windows, macOS and Linux. It combines a real Cesium Earth scene, 16,000+ propagated orbital objects, launch and mission operations, NASA intelligence, NOAA space weather, and multilingual Space News behind a typed Tauri/Rust security boundary.

## Product capabilities

- Unified Space Intelligence Command Dashboard with real provider provenance and freshness
- CesiumJS Earth/SSA workspace with real CelesTrak OMM data and worker-owned SGP4 propagation
- Semantic satellite LOD, real orbit and ground-track geometry, selection, focus and follow
- Launch Library 2 upcoming, active and completed mission flows
- Open-Meteo forecast matching for real launch-pad coordinates
- Exact LL2 launch-designator to CelesTrak international-object matching; no name-based telemetry inference
- NASA APOD, NeoWs and DONKI intelligence with independent component caches
- NOAA SWPC alerts, R/S/G scales, planetary K-index and solar-wind summary
- Spaceflight News article/blog/report archive with local SQLite, FTS5 and cached translations
- Azerbaijani, Turkish, English, Russian and Spanish runtime localization
- Local Control Center for provider health, cache, retry/backoff and data operations
- Indexed Ctrl+K navigation across destinations, NORAD objects, launches, missions, rockets, pads, news and cached NASA intelligence
- Persistent favorites and rate-limited operational notifications

## Data and security boundaries

- React never contacts CelesTrak, LL2, NASA, NOAA, Open-Meteo or SFN directly.
- Provider requests, retry policy, bounded response streaming and caches live in Rust.
- CelesTrak, LL2, NASA, NOAA and weather retain provider-scoped atomic JSON caches.
- Space News and translation memory use the dedicated bundled SQLite database.
- NASA credentials resolve from the operating system's secure credential store (Windows Credential Manager, macOS Keychain or Linux Secret Service), then native process environment, then an ignored debug-only `.env.local` file.
- Frontend code can only see credential status; the key is never returned over IPC.
- External navigation accepts normalized public HTTPS URLs through one native command.
- NASA and LL2 media are validated, resized and cached natively; the CSP does not permit arbitrary remote image hosts.
- Runtime data is never replaced with fake coordinates, synthetic orbit telemetry or guessed provider relations.

## Technology baseline

- Tauri 2 and Rust
- React 19, TypeScript and Vite
- CesiumJS 1.143
- satellite.js 7 in a dedicated Web Worker
- TanStack Query and Zustand
- i18next with typed namespace parity
- SQLite (bundled), WAL and FTS5 for Space News
- Vitest, Testing Library and Rust unit tests

## Supported desktop packages

- Windows x64: NSIS (`.exe`) and MSI installers
- macOS 12+: universal DMG for Apple Silicon and Intel Macs
- Linux x64 and ARM64: AppImage, Debian (`.deb`) and RPM packages

AppImage is the broad Linux fallback. DEB targets Debian/Ubuntu-family systems and RPM targets Fedora/RHEL/openSUSE-family systems. Native release artifacts must be produced on their matching operating-system runners.

The macOS build defaults to a free ad-hoc signature, so it can be distributed without a paid Apple account. When Apple Developer credentials are configured in CI, the same build is automatically Developer ID signed and notarized. The release manifest tells the website whether first-launch security instructions are required.

## Local development

Common prerequisites are Node.js 22+, pnpm 11+ and stable Rust. Windows also requires WebView2 and Visual Studio Build Tools; macOS requires Xcode command-line tools; Linux requires WebKitGTK 4.1 and the distribution build packages listed in the release guide.

```powershell
pnpm install
pnpm tauri:dev
```

For local NASA development, prefer saving the key from Settings. A native-process `NASA_API_KEY` or ignored `.env.local` entry remains available as a development fallback.

## Quality gates

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features --locked
cargo test --manifest-path services/translation-gateway/Cargo.toml --locked
pnpm tauri:build
```

Platform-specific build commands are `pnpm tauri:build:windows`, `pnpm tauri:build:macos` and `pnpm tauri:build:linux`. The GitHub desktop release workflow builds every supported package and generates a machine-readable website manifest plus SHA-256 checksums.

Cross-platform packaging, signing, native QA and website download integration are documented in [docs/distribution/cross-platform-release.md](docs/distribution/cross-platform-release.md).

Signed optional and critical update behavior is documented in [docs/distribution/automatic-updates.md](docs/distribution/automatic-updates.md).

Architecture is documented in [docs/architecture](docs/architecture), decisions in [docs/decisions](docs/decisions), and release evidence in [docs/performance](docs/performance) and [docs/screenshots](docs/screenshots).
