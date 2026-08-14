# NASA Open APIs Provider

Module 6 introduces NASA astronomy, near-Earth-object, and space-weather data without changing the existing CelesTrak, Launch Library 2, Open-Meteo, satellite.js, or Cesium pipelines.

## Native boundary

Only the Rust host contacts `api.nasa.gov`. React invokes one typed `nasa_intelligence` command and never receives or stores the API key. The native service resolves five independent components in parallel:

| Component | Official endpoint | Product use | Native TTL |
| --- | --- | --- | --- |
| APOD | `/planetary/apod` | Daily astronomy feature | 24 hours |
| NeoWs | `/neo/rest/v1/feed` | Seven-day close-approach list | 3 hours |
| DONKI CME | `/DONKI/CME` | Recent coronal mass ejections | 1 hour |
| DONKI flare | `/DONKI/FLR` | Recent solar flares | 1 hour |
| DONKI storm | `/DONKI/GST` | Recent geomagnetic storms | 1 hour |

The endpoints, authentication rules, response shapes, and default 1,000-request-per-hour key limit were verified against the official [NASA Open APIs documentation](https://api.nasa.gov/) on 2026-08-07. The supplied development key was also checked against APOD, NeoWs, and DONKI with successful HTTP 200 responses.

## Security

Installed builds resolve the key from Windows Credential Manager first. A native-process `NASA_API_KEY` is the fallback; debug builds may additionally read the ignored workspace file `.env.local`. The frontend receives only `configured`, `source` and `verified` status. The secret is never returned to React, localStorage, the frontend bundle, logs or diagnostics. Error messages never include request URLs because NASA authentication is supplied as a query parameter.

The frontend content security policy does not allow connections to `api.nasa.gov`; the API remains native-only. APOD media is downloaded through a provider-scoped native cache with HTTPS, public-address, redirect, MIME, size and decode limits. External links pass through the centralized native public-HTTPS command.

## Validation and normalization

The Rust provider performs response-size, JSON, and top-level payload-shape validation before writing a cache entry. The TypeScript boundary validates each APOD, asteroid, close-approach, CME, flare, and storm DTO with Zod. Invalid records are rejected individually, so one malformed object cannot discard an otherwise valid feed.

Normalized domain objects expose provenance:

- `source`
- `sourceId`
- `retrievedAt`
- `observedAt`
- `lastUpdated`
- `isStale`

NeoWs objects retain NASA's authoritative `is_potentially_hazardous_asteroid` designation. The application does not invent a danger score or label every near-Earth object as dangerous.

## Resilience and rate control

Each component has its own cache file, expiry, status, and diagnostics. A fresh cache response avoids an upstream request. An expired component performs at most one retry with a short backoff for timeouts, network failures, HTTP 429, or server errors. If refresh fails, a last-known-good component is returned as `stale`; a feed without usable live or cached data becomes `unavailable` while the other feeds remain active.

Diagnostics contain only safe operational fields:

- provider and logical request name
- duration
- status
- cache hit
- retry count
- error type
- remaining rate-limit count when NASA returns it

TanStack Query deduplicates dashboard requests and treats the combined native snapshot as fresh for 30 minutes. React does not poll on an interval.

## UI

NASA Intelligence is a dedicated workspace linked from the unified Command Dashboard and Ctrl+K. It presents APOD attribution, upcoming close approaches, recent DONKI events, independent feed status, timestamps, and degraded/cache states. NOAA SWPC is a separate operational provider and does not replace or relabel DONKI data.
