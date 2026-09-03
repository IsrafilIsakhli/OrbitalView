# Orbital Vision cross-platform desktop release

## Supported release matrix

| Platform | Architecture | User-facing packages | Native security store |
| --- | --- | --- | --- |
| Windows | x86_64 | NSIS `.exe`, MSI | Windows Credential Manager |
| macOS 12+ | Universal (Apple Silicon + Intel) | `.dmg` | macOS Keychain |
| Linux | x86_64, aarch64 | AppImage, `.deb`, `.rpm` | Secret Service / desktop keyring |

AppImage is the distribution-independent Linux fallback. DEB and RPM packages provide normal package-manager installation for the two main Linux distribution families. A package built for one CPU architecture is never presented as compatible with the other architecture.

## Platform configuration

Common application configuration stays in `src-tauri/tauri.conf.json`. Tauri automatically merges the matching platform file:

- `tauri.windows.conf.json`: frameless Windows shell, Mica, NSIS and MSI;
- `tauri.macos.conf.json`: native macOS window, macOS 12 minimum, universal app and DMG;
- `tauri.linux.conf.json`: native Linux window, AppImage, DEB and RPM.

The React shell receives a build-time target identifier. Windows keeps Orbital Vision's custom title bar. macOS and Linux use their native window frames, so the application does not imitate Windows controls on those platforms.

## Optional production signing

The release pipeline works with or without paid signing credentials:

- without credentials, Windows is unsigned and macOS receives an ad-hoc signature;
- with credentials, Windows receives Authenticode and macOS is Developer ID signed, notarized and stapled;
- the website manifest exposes the trust mode and whether manual security approval is required.

Required GitHub Actions secrets for Windows:

- `WINDOWS_CERTIFICATE`: base64-encoded code-signing PFX;
- `WINDOWS_CERTIFICATE_PASSWORD`.

Required GitHub Actions secrets for macOS:

- `APPLE_CERTIFICATE`: base64-encoded Developer ID Application P12;
- `APPLE_CERTIFICATE_PASSWORD`;
- `APPLE_SIGNING_IDENTITY`;
- `KEYCHAIN_PASSWORD`;
- `APPLE_API_ISSUER`;
- `APPLE_API_KEY`;
- `APPLE_API_KEY_BASE64`: base64-encoded App Store Connect private key.

Required non-secret GitHub Actions variable:

- `WIKIMEDIA_CONTACT`: a current public project or operator contact URL used in the descriptive Wikimedia API User-Agent. Satellite media enrichment remains disabled if it is missing.

When all Apple secrets are configured, the Mac build is signed, submitted for notarization and stapled by Tauri. Without them, the same workflow creates a universal ad-hoc DMG that can be published for free. On first launch, macOS users must use `System Settings → Privacy & Security → Open Anyway`. After approval, macOS remembers the exception for that application.

Unsigned Windows packages may trigger Microsoft Defender SmartScreen. This is separate from installer creation and does not prevent website download.

Linux release files are accompanied by `SHA256SUMS.txt`. AppImage itself does not provide a universal platform trust prompt equivalent to Apple notarization or Windows Authenticode, so the public website must expose the checksum and HTTPS source.

## Release procedure

1. Update the same semantic version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and `release/update-policy.json`.
2. Pass the local frontend and Rust quality gates.
3. Create and push a signed Git tag such as `v1.0.0`.
4. `.github/workflows/desktop-release.yml` validates the version and update policy, then builds on native Windows, macOS and Linux runners.
5. If signing secrets exist, the workflow uses them; otherwise it produces unsigned/ad-hoc packages and records that fact in the manifest.
6. The publish job creates a draft GitHub release, `SHA256SUMS.txt`, `release-manifest.json`, signed updater artifacts and `latest.json`.
7. Publish the draft only after native smoke tests have passed on at least one Windows machine, one Apple Silicon Mac, one Intel Mac or Rosetta path, one Debian-family system and one RPM-family system.

The complete sign-off list is maintained in [release-checklist.md](release-checklist.md). A draft must remain unpublished while any required native package gate is incomplete.

Updater key setup, optional/critical release policy and runtime behavior are documented in [automatic-updates.md](automatic-updates.md).

## Website download contract

The website must not hardcode versioned installer filenames. It reads:

```text
https://github.com/IsrafilIsakhli/OrbitalVision-Releases/releases/latest/download/release-manifest.json
```

The manifest includes platform, CPU architecture, package format, SHA-256 and the exact release URL. Website logic should:

1. detect Windows, macOS or Linux only as a recommendation;
2. show the recommended primary package;
3. always expose an “Other platforms” list;
4. recommend DMG on macOS, EXE on Windows and AppImage on unknown Linux distributions;
5. never silently choose x86_64 for an ARM64 Linux device;
6. display the current version and checksum source.

The binary repository is configured in `release/channel.json`; source remains private. `PUBLIC_RELEASES_TOKEN` is restricted to Contents write on the binary repository. The workflow uploads a draft only after frontend/native checks and a complete nine-installer manifest audit. Publication is a separate human decision. A successful build is not proof of native installation or runtime compatibility.

Build each package with its own `ORBITAL_PACKAGE_KIND`: `nsis`, `msi`, `dmg`, `appimage`, `deb`, or `rpm`. The workflow does this for every matrix job. MSI and NSIS update targets are separate; DEB/RPM updates remain manual. Ad-hoc macOS/unsigned Windows are explicitly identified in the manifest; absence of security warnings is not promised.
7. inspect `trust.requiresManualSecurityApproval`; for an ad-hoc macOS build, show the first-launch `Open Anyway` instructions beside the download button.

Because the manifest is attached to the GitHub `latest` release, a new tagged release updates the website's installer selection without editing the website.

## Native QA that cannot run on Windows

Before public release, verify on native targets:

- application launch and native window controls;
- Cesium WebGL rendering and 16K+ catalog performance;
- NASA key persistence in Keychain or Secret Service;
- notifications and permission prompts;
- external links and native file export dialogs;
- SQLite/cache paths and offline restart;
- macOS Gatekeeper acceptance after notarization;
- AppImage executable permission and DEB/RPM clean install/uninstall;
- no console errors and no second Cesium/Worker instance.

Windows tests prove shared TypeScript and Rust behavior, but they do not replace these platform-native release gates.
