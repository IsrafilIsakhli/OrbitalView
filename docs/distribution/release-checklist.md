# Public desktop release checklist

Use this checklist for every public Orbital Vision release. A generated draft is not a public release and does not reach the automatic updater.

## Ownership and release metadata

- [ ] Version matches `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and `release/update-policy.json`.
- [ ] Release notes exist in AZ, TR, EN, RU and ES.
- [ ] `LICENSE`, `NOTICE`, `TERMS.md`, `PRIVACY.md`, `SECURITY.md` and `THIRD_PARTY_NOTICES.md` are current.
- [ ] Provider or dependency changes are reflected in third-party notices.
- [ ] No provider name, logo or content implies endorsement.

## Secrets and supply chain

- [ ] A committed-file and Git-history secret scan is clean.
- [ ] Dependency advisories have been reviewed for frontend, native and translation-gateway lockfiles.
- [ ] GitHub Actions contains `TAURI_SIGNING_PRIVATE_KEY`; the private key is absent from the repository and release assets.
- [ ] GitHub Actions variable `WIKIMEDIA_CONTACT` contains a current public project or operator contact URL.
- [ ] Optional Windows and Apple signing credentials are present or the unsigned/ad-hoc trust state is deliberately accepted.
- [ ] Build actions and package lockfiles are reviewed and unchanged unless part of the release.

## Quality gates

- [ ] TypeScript typecheck, ESLint, frontend tests and production build pass.
- [ ] Rustfmt, Clippy with `-D warnings`, native tests and translation-gateway tests pass.
- [ ] Update policy validation passes.
- [ ] Native runtime has no console errors or unhandled rejections.
- [ ] Real CelesTrak, LL2, NASA, NOAA, Open-Meteo and SFN smoke tests pass without fake data.
- [ ] Existing caches, preferences, favorites and notification history survive upgrade.

## Native package QA

- [ ] Windows x64 EXE and MSI install, launch, update and uninstall are tested.
- [ ] Apple Silicon DMG install, first launch, update and uninstall are tested.
- [ ] Intel Mac or Rosetta path is tested.
- [ ] Linux x64 AppImage, DEB and RPM are tested on their intended families.
- [ ] Linux ARM64 AppImage is tested on ARM64 hardware.
- [ ] Credential stores, notifications, external links, exports and offline restart work on each supported OS.
- [ ] Earth renders the real 16K+ catalog without a second Cesium instance or sustained memory growth.

## Release integrity

- [ ] `SHA256SUMS.txt` matches every distributed artifact.
- [ ] Tauri updater signatures validate and `latest.json` references the intended tag.
- [ ] `release-manifest.json` reports the real Windows/macOS trust state.
- [ ] Website download detection is tested but still exposes all platforms.
- [ ] The draft release is published only after all required native checks are signed off.
