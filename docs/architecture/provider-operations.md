# Native Provider Operations

Status: implemented  
Last updated: 2026-08-09

## Boundary

All external provider access remains inside the Rust host. Shared provider code is intentionally limited to transport, bounded streaming, retry classification, cache helpers, health persistence and scheduling. CelesTrak, LL2, NASA, NOAA, Open-Meteo and SFN keep their own domain DTOs and public commands.

## Reliability

- Every streamed JSON response enforces a provider-specific maximum before and during download.
- Safe error contracts expose code, category, retryability and correlation identity without raw URLs, filesystem paths, response bodies or secrets.
- Failed refreshes preserve last-known-good data.
- Provider tasks run independently; one stalled service cannot serialize every background refresh.
- Retry cadence is bounded at approximately 1, 5 and 15 minutes with provider-specific jitter.
- `Retry-After` is honored by providers that expose it.
- Operational health is persisted in `app_data_dir/operations-health-v1.json`; a restart clears only transient `refreshing` state.

## Cache ownership

- CelesTrak, LL2, NASA, NOAA and weather: provider-scoped atomic JSON files.
- Space News and translation memory: bundled SQLite with WAL and migrations.
- Remote media: provider-scoped WebP thumbnails under `app_cache_dir/remote-media-v1`.
- Cache clearing accepts only the native `ProviderId` enum and fixed directories; arbitrary paths never cross IPC.

## Scheduler

The scheduler exists only while the Tauri process runs. CelesTrak, LL2, NASA, NOAA and SFN each have an independent task. Translation processing uses its persistent queue. Open-Meteo remains on-demand because a geographic launch site is required.
