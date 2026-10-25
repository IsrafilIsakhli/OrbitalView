# Production preparation — 2026-10-25

Status: release preparation in progress; public distribution is not approved by this report.

## Changes

- Upgraded Zod and constrained DOMPurify to patched compatible versions. Updated Vite, Vitest, jsdom, cssnano and vulnerable transitive development dependencies without changing the Cesium version or renderer.
- Updated compatible native TLS, certificate roots, QUIC and Tokio dependencies in both Rust lockfiles. Removed legacy Windows ZIP extraction from the updater. Published update formats remain raw signed NSIS/MSI, macOS application tarballs and Linux AppImages.
- Added a Production quality workflow for main pushes and pull requests: frontend checks, production build, release tooling, dependency audits, working-tree secret scan, Windows native Clippy/tests and gateway tests.
- Added checksum-pinned Gitleaks history scanning to quality and release gates, with only three immutable historical public-key fingerprints allowlisted after decoding and confirming they are public Minisign keys. Added a main-only Windows NSIS candidate build after all quality gates, including an updater signature and SHA-256 file; artifacts are retained for 14 days and are not published as a public release.
- Added dependency audits to the release workflow and an early tag-only check for the public repository token and destination write access, before spending time building installers.
- Fresh installations can use explicitly labelled limited public NASA access without distributing a private API key. Public feeds use a persistent six-hour attempt interval, including failures, and APOD keeps its daily TTL. Force refresh and process restart respect the interval. HTTP 429 is not immediately retried. Registered native credentials keep existing refresh policies.
- Fixed DONKI routing after NASA's September 2026 service migration: replaced the failing NASA gateway proxy with the official public CCMC API, without forwarding private API credentials. Live APOD and NeoWs returned HTTP 200; the new CME/flare/storm routes returned HTTP 200 with valid arrays (25, 2 and 0 events for the checked week).
- Updated all five NASA locale messages and privacy/developer documentation. Aligned Node requirements with the test environment. Ignored local release artifact directories to prevent accidentally committing stale installers.

## Local verification

- Frontend: 60 test files / 218 tests pass after dependency updates.
- ESLint, TypeScript, production build, chunk budgets and update-policy validation pass.
- Release artifact/tooling integration tests pass; checksum tampering, missing architectures, unsafe destinations and secret/source uploads are rejected.
- Full frontend dependency audit: zero advisories as of this check.
- Both Rust lockfiles: zero vulnerability findings after updates. This does not mean zero warnings: the desktop graph still includes 12 upstream unmaintained-package notices and Linux `glib` 0.18.5's `VariantStrIter` unsoundness notice (RUSTSEC-2024-0429). No blanket advisory suppression was added. The GTK dependency requires an upstream-compatible resolution and Linux reachability review before Linux release acceptance.
- Working-tree heuristic secret scan: no findings. Gitleaks 8.30.1 scanned all 23 currently reachable commits (~2.83 MB) with zero unreviewed findings after the three public-key fingerprint exceptions. Private credentials were not printed or saved.
- Rust formatting passes. Fresh local native compilation/test execution is blocked by missing Microsoft C++ linker `link.exe`; old cached test binaries and installers are not accepted as evidence for these changes. New NASA tests cover public access, forced-refresh quota protection, restart-persistent failure cooldown and HTTP 429 behavior; execution must be confirmed on the Windows CI runner.
- GitHub [Production quality run 40230486110](https://github.com/IsrafilIsakhli/OrbitalView/actions/runs/40230486110) passed for `c1825da`: frontend production checks, native dependency audits, Windows Rustfmt/Clippy, all native tests and translation-gateway tests. The subsequent DONKI migration and installer-candidate changes require their own new CI result.

## External configuration and release gates

Read-only GitHub metadata confirms `TAURI_SIGNING_PRIVATE_KEY` and the `WIKIMEDIA_CONTACT` variable are configured in the source repository. Values were not printed or saved. The public updater repository `IsrafilIsakhli/OrbitalVision-Releases` is not readable with the configured account, and `PUBLIC_RELEASES_TOKEN` is absent from the source repository secret names. No Windows Authenticode or Apple signing/notarization secrets were listed.

Before public distribution:

1. Confirm the Windows CI run for this revision, then build fresh installers with Desktop release. Install/launch/update/uninstall-test the resulting packages. Browser Earth performance evidence in the prior repair report is not native package acceptance.
2. Make the configured binary-only release repository available and add a narrowly scoped `PUBLIC_RELEASES_TOKEN` with release write access there. Confirm updater key pairing by producing and verifying real signed update artifacts. No private key should be sent in chat or embedded in an installer.
3. Decide whether unsigned Windows / ad-hoc macOS distribution is acceptable, or configure the corresponding signing/notarization certificates. The website manifest records actual trust state.
4. For dependable NASA data, provision a registered native credential or a separately operated authenticated gateway. Public demo access is a limited fallback subject to shared per-IP quotas, not a service-level guarantee. English news remains usable when the optional translation gateway is not deployed.
5. Resolve/review Linux dependency notices and complete the platform installation, upgrade, offline and performance checks in the [release checklist](../distribution/release-checklist.md). The release workflow repeats the full-history secret scan before packaging.
6. Only publish a tag's draft after all applicable gates pass. This preparation does not create or publish a public release, and the stale local `release-artifacts` installer is excluded.

References: [NASA public-access limits](https://api.nasa.gov/assets/html/authentication.html), [DOMPurify advisory](https://github.com/advisories/GHSA-cg2g-xh64-v4q7), [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [Linux GLib notice](https://rustsec.org/advisories/RUSTSEC-2024-0429.html).
