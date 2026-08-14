# ADR 0004: Launch Library 2.3 with native resilient caching

## Status

Accepted for Module 4.

## Context

Orbital Vision needs multi-provider launch, mission, pad, agency, rocket, media,
and event data. The anonymous data service has a strict request allowance and
launch schedules change frequently.

## Decision

Use Launch Library 2.3 as the normalized global launch and event source. Access
it only through the Rust host, with independent 30-minute launch and event cache
components and last-known-good fallback. Use Open-Meteo for selected-pad weather
with a separate 15-minute coordinate cache. Keep CelesTrak as the satellite
authority.

Do not add an unofficial SpaceX-specific API. SpaceX, NASA, Roscosmos, ESA,
commercial operators, and other providers are represented through the same
provider-neutral launch model.

## Consequences

- The product obtains one coherent world launch timeline and media model.
- Normal anonymous usage remains below the service's published hourly limit.
- A provider outage does not immediately empty a previously working product.
- Launch Library editorial timing remains authoritative and may shift close to
  launch.
- Weather is available only inside Open-Meteo's forecast horizon.
