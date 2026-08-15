# Orbital Vision Privacy Notice

Effective date: 15 August 2026

Orbital Vision is a local-first desktop application. This notice explains what the application stores locally and which external services it contacts. It applies to the official desktop builds distributed by the project owner.

## What Orbital Vision does not operate

- Orbital Vision does not require an account.
- Orbital Vision does not include first-party advertising, behavioral analytics or cross-app tracking.
- Orbital Vision does not sell personal information.
- Orbital Vision does not upload the user's favorites, preferences or locally created ground-station profiles to an Orbital Vision account service.

## Information stored on the device

Depending on the features used, the application stores the following locally:

- language, appearance, units, quality, notification and update preferences;
- favorite satellites and missions, notification history and deduplication state;
- provider-scoped caches for CelesTrak, Launch Library 2, NASA, NOAA SWPC and Open-Meteo results;
- a local Space News database, search index, cached translations and validated image thumbnails;
- a local Orbital Analysis database containing ground-station profiles created by the user;
- locally generated exports selected by the user; and
- sanitized operational diagnostics needed to explain provider freshness and errors.

Ground-station profiles may contain coordinates entered by the user. Orbital pass calculations for those profiles run locally. Launch-weather requests use the public coordinates of the selected launch pad, not the user's analysis-station profile.

## Credentials

A NASA API key saved through Settings is stored by the operating system's secure credential facility: Windows Credential Manager, macOS Keychain or the supported Linux secret service. The credential value is not returned to the React interface. A native process environment variable and an ignored development-only `.env.local` file may be used by developers as fallbacks.

Do not place credentials in screenshots, public issues, exported diagnostic text or repository files.

## External network requests

When online features are enabled or opened, the native application may contact:

- CelesTrak for orbital catalog and SATCAT data;
- The Space Devs for Launch Library 2 and Spaceflight News data;
- NASA Open APIs for NASA intelligence;
- NOAA Space Weather Prediction Center for operational space-weather products;
- Open-Meteo for weather at public launch-pad coordinates;
- Wikidata and Wikimedia Commons for optional, exact-NORAD satellite media enrichment;
- ArcGIS services for Earth imagery and terrain used by the Cesium scene;
- the configured translation gateway for eligible Space News titles and summaries; and
- GitHub Releases for signed application-update metadata and downloads.

These services receive ordinary network metadata such as the device's public IP address, request time, user agent and requested resource. Their own privacy notices and terms govern their handling of that information. Orbital Vision does not control those services.

Space News translations are optional. If a translation gateway is configured, the English title and summary to be translated, target language and request metadata are sent to that gateway. Original English news and previously cached translations remain available when the gateway is unavailable.

## Media and external articles

Validated provider media may be downloaded by the Rust backend, resized and stored in a local cache. Opening a full news article or another external source leaves Orbital Vision and opens the user's default browser. The destination website may collect information under its own policies.

## Retention and deletion

Provider and image caches use bounded retention or freshness rules. News and translation data may remain as a last-good offline copy until pruned or cleared. Preferences, favorites and analysis profiles remain until the user changes or deletes them or clears application data.

Settings provides controls for applicable provider caches and saved credentials. Uninstall behavior varies by operating system and may leave application-data directories behind. Users who want a complete removal should also delete Orbital Vision's application data and cache through their operating-system tools after uninstalling.

## Updates to this notice

Material changes will be included in release notes and committed with an updated effective date. The version of this notice shipped with a release governs that release.

## Contact

Privacy questions can be directed to the repository owner through the project's GitHub repository. Security vulnerabilities must be reported privately as described in [SECURITY.md](SECURITY.md).
