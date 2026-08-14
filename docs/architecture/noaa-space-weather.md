# NOAA SWPC Space Weather

Status: implemented  
Last updated: 2026-08-09

## Official products

The native provider reads official public products from `services.swpc.noaa.gov`:

- watches, warnings, alerts and summaries;
- NOAA R/S/G scales;
- planetary K-index observations;
- solar-wind speed summary when supplied.

The data is normalized without creating a synthetic severity score. Unknown or unavailable values remain absent and render as unavailable, never as scale zero.

## Resilience

Responses are fetched in parallel through the bounded shared HTTP client. The snapshot TTL is five minutes. Successful payloads are written atomically to `app_cache_dir/noaa-swpc-v1`; network, rate-limit, server, parsing or offline failures preserve the last-good snapshot as stale.

## Product use

The unified dashboard presents scale, latest Kp, official alert count, source and freshness. The detail workspace shows individual official alerts and timestamps. The awareness engine can generate deduplicated NOAA notifications subject to quiet hours and the native three-per-hour cap. NOAA does not replace NASA DONKI and is not used as an Earth cloud texture.
