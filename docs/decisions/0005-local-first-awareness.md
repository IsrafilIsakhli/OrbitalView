# ADR 0005: Local-first personal awareness

## Status

Accepted for Module 5.

## Context

Orbital Vision needs favorites, countdown alerts, notification history, and Windows notifications before user accounts or a cloud synchronization service exist. The feature must remain private, fast, useful offline, and isolated from the rendering and live-data engines.

## Decision

Use a versioned Zustand persistence store as the Module 5 source of truth. Generate alerts locally from the already normalized launch and mission data. Keep native Windows delivery behind a minimal Tauri platform adapter and explicit user permission. Store semantic deduplication keys alongside the notification history.

## Consequences

- Favorites, settings, and in-app history survive restarts without an account.
- Alert generation does not add a new network dependency.
- Permission denial or an unsupported host cannot break the in-app experience.
- Notifications are produced only while Orbital Vision is running.
- Cross-device synchronization and background delivery while the app is closed require a future storage/scheduling adapter.
