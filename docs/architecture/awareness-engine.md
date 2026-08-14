# Personal Awareness architecture

Module 5 adds a local-first awareness boundary without coupling the Earth engine or live-data clients to interface components.

## Responsibilities

The awareness domain owns four concepts:

- favorites for satellites, launches, and mission events;
- in-app notifications and read state;
- alert preferences, including lead time and native delivery opt-in;
- deduplication keys that prevent repeated alerts across refreshes and restarts.

The domain types are independent of React, Cesium, Tauri, and remote API payloads. Feature screens convert their existing satellite, launch, or event model into the small `FavoriteInput` contract at the boundary.

## State boundary

`awarenessStore.ts` is the single local state owner. Zustand provides narrow selectors and actions, while the persistence middleware stores only durable user state in the versioned `orbital-vision.awareness` local-storage record.

Hard limits keep storage predictable:

- 250 favorites;
- 120 notifications;
- 500 delivered deduplication keys.

Persisted data is merged with current defaults so new settings can be introduced without invalidating older installations. Invalid or oversized arrays are bounded while hydrating.

## Notification generation

`NotificationEngine` consumes the existing launch-intelligence query as a read-only input. It evaluates once per data refresh and once per minute for countdown boundaries. It creates:

- a daily data-sync notification;
- a daily stale-cache warning when applicable;
- launch countdown alerts for the next launch and favorited launches;
- mission countdown alerts for favorited events.

Every generated notification has a stable semantic deduplication key. Native delivery only happens after the in-app notification has been accepted by the store, so refreshes cannot repeat a Windows toast.

## Native platform boundary

`nativeNotifications.ts` is the only frontend module that imports the Tauri notification API. Permission is requested only from the notification settings user action. The Tauri capability file grants only permission-state checks, permission requests, and notification delivery.

The rest of the product remains platform-agnostic and fully usable when native notifications are unavailable or declined.

## UI integration

The navigation rail and command-bar bell consume a derived unread count. Favorites and notification destinations are routed by type through `AppShell`; they reuse the existing satellite and launch selection stores rather than introducing a second navigation protocol.

All visible strings are in the `awareness` localization namespace for Azerbaijani, English, Russian, and Spanish.

## Extension points

Future modules can add notification producers for conjunction alerts, satellite passes, weather thresholds, telemetry state changes, and deep-space mission events. Producers must publish the same domain notification shape and use stable deduplication keys. Cross-device sync can later replace the persistence adapter without changing the UI or producer contracts.
