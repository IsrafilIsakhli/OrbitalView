# Orbital Vision automatic updates

Orbital Vision uses the official Tauri v2 updater on Windows, macOS and Linux AppImage builds. Every update package is verified with the Orbital Vision minisign public key embedded in the native application before it can be installed.

## Signing key

The private key was generated outside the repository at:

```text
C:\Users\israf\.orbital-vision-release\orbital-vision-updater.key
```

Back this file up in a secure password manager or encrypted offline storage. Never commit it, attach it to a release, send it in chat, or place it in website files. Losing it prevents future installed versions from accepting updates.

Add the complete private-key file content to the GitHub repository secret `TAURI_SIGNING_PRIVATE_KEY`. The current key has no password, so `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` may be an empty repository secret. Platform code-signing credentials are separate from this updater key.

The matching public key is intentionally committed at `release/updater-public-key.txt` and embedded in the native updater. It is safe to publish, but it must never be replaced unless a deliberate key-rotation migration has been designed for already installed clients.

## Release policy

`release/update-policy.json` is the source of truth for update behavior and localized release notes.

- Normal update: use `"severity": "optional"` and keep `minimumSupportedVersion` at the last mandatory version.
- Critical update: use `"severity": "critical"` and set `minimumSupportedVersion` equal to the new release version.
- The next optional release must retain the previous critical version as `minimumSupportedVersion`. Users who skipped that critical release will therefore still receive a required update.

Example sequence:

```text
1.1.0 optional -> minimumSupportedVersion 1.0.0
1.2.0 critical -> minimumSupportedVersion 1.2.0
1.3.0 optional -> minimumSupportedVersion 1.2.0
```

The workflow rejects missing locale notes, mismatched versions and invalid critical policy.

## Publishing a release

`release/channel.json` is the sole repository setting. The private source repository builds packages; only binaries, signatures, checksums and manifests go to `IsrafilIsakhli/OrbitalVision-Releases`. Configure `PUBLIC_RELEASES_TOKEN` as a fine-grained token with Contents write access to **that repository only**. Do not substitute the source repository's token. The release repository must already exist and be public. Nothing in the local implementation publishes a release.

1. Set the same SemVer in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` and `release/update-policy.json`.
2. Choose the policy and write AZ/TR/EN/RU/ES release notes.
3. Run `pnpm release:validate` and the normal quality gates.
4. Commit, push and create the matching `vX.Y.Z` tag.
5. GitHub builds native packages and signed updater artifacts on Windows, macOS and Linux runners.
6. The workflow creates a draft GitHub Release containing installers, signatures, `latest.json`, website manifest and checksums.
7. Complete native smoke tests and publish the draft.

Only a published non-prerelease GitHub Release is returned by the `/releases/latest/download/latest.json` endpoint. Draft review therefore cannot accidentally update users.

## Runtime behavior

- The app checks 1.5 seconds after startup, every six hours, and after returning to a window that has not checked for at least 30 minutes.
- Normal updates show `Update now` and `Later`. Dismissal lasts for the current app session; Settings can reopen the update.
- Required updates open a non-dismissible prompt and begin the signed download automatically on supported self-updating package types.
- An existing offer does not prevent a newer release check; strict SemVer prerelease ordering applies.
- Before installation, tracked local writes finish, analysis/rendering pause, native provider refreshes pause and in-flight cache/translation writes drain. A 30-second drain timeout cancels installation and restores operation.
- Download progress is visible. Windows uses passive installer mode; macOS and Linux relaunch after installation.
- Failed signature verification prevents installation. Failed installation triggers recovery of paused application work; actual OS-installer rollback is a native test requirement, not a guarantee made by this application.
- Development and browser builds never contact the update endpoint.

## Linux limitation

Self-update is enabled only for a build marked `ORBITAL_PACKAGE_KIND=appimage` and running in an AppImage environment. DEB/RPM builds offer the matching architecture/package download for manual package-manager installation, including critical releases. Unknown package types never self-install.

## Windows package identity and migration

CI builds NSIS and MSI separately with `ORBITAL_PACKAGE_KIND=nsis` or `msi`. They request `windows-x86_64-nsis` and `windows-x86_64-msi` respectively. No default Windows target is published: an unidentified MSI must not become NSIS. macOS builds use `ORBITAL_PACKAGE_KIND=dmg` and the standard architecture-specific target, both backed by the universal signed updater archive.

The package kind is compiled into the executable. Local multi-format Tauri builds without that variable are development/testing builds with self-update disabled. For release candidates use the per-package CI jobs (or explicitly build each package separately with its matching variable and generated updater config). Do not distribute one executable as several package kinds.

Clients whose embedded old source-repository URL is inaccessible cannot receive a remote endpoint change through that URL. Download and install the matching new package once, preserving the application identifier and user-data directories. New installations then use the public channel. Never replace the updater signing key to work around migration.

Current sign-off and outstanding gates: [0.1.2 readiness report](../release-readiness/0.1.2.md).
