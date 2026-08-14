# ADR 0006: Native NASA Open APIs Foundation

## Status

Accepted on 2026-08-07.

## Context

Orbital Vision needs a verified astronomy feature, upcoming near-Earth-object approaches, and recent space-weather events. NASA authentication must not enter the WebView bundle, raw provider payloads must not become UI contracts, and one failing NASA product must not disable the entire dashboard.

## Decision

Use the official NASA Open APIs service through a dedicated Rust provider. Fetch APOD, the seven-day NeoWs feed, and the DONKI CME, flare, and geomagnetic-storm feeds as five independently cached components. Normalize all payloads into Orbital Vision domain models after native and Zod validation.

Use a runtime `NASA_API_KEY` environment variable in release builds and an ignored `.env.local` development fallback only in debug builds. Do not expose NASA connectivity through the frontend content security policy.

Expose component-level `fresh`, `stale`, and `unavailable` states plus safe structured diagnostics. Use last-known-good data after an upstream failure and never substitute demo data.

## Consequences

- NASA credentials remain outside source control and the frontend bundle.
- APOD, NeoWs, and DONKI can degrade independently.
- Cache TTLs and request limits are controlled in one native provider.
- The internal domain model can outlive NASA response-shape changes.
- An installed release must receive `NASA_API_KEY` in its native runtime environment until a future OS credential-store settings flow is explicitly implemented.
- NOAA remains a separate Phase 3 provider; DONKI is not treated as a replacement for NOAA operational products.
