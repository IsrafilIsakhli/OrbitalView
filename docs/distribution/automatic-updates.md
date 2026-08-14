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
- Required updates open a non-dismissible security prompt and begin the signed download automatically.
- Download progress is visible. Windows uses passive installer mode; macOS and Linux relaunch after installation.
- Failed signature verification or installation leaves the current version unchanged and offers a retry.
- Development and browser builds never contact the update endpoint.

## Linux limitation

Automatic self-update is guaranteed for the AppImage distribution. `.deb` and `.rpm` packages remain available for system package workflows, but the public website should recommend AppImage when users want in-app updates.
