# Third-Party Notices and Data Attribution

Orbital Vision is an independent product. Provider names, logos and marks belong to their respective owners. Their appearance identifies a source and does not imply affiliation, sponsorship or endorsement.

This document is an attribution and compliance guide for the project's direct integrations. Individual media items can have more specific licenses; the attribution shown with an item or on its source page controls for that item.

## Data, imagery and service providers

### CelesTrak

Orbital catalog, OMM and SATCAT data are obtained from [CelesTrak](https://celestrak.org/). Requests are cached and scheduled to respect the [CelesTrak Usage Policy](https://celestrak.org/usage-policy.php). CelesTrak data is not an operator-validated ephemeris or conjunction service.

### The Space Devs

Launch and mission records are obtained from [Launch Library 2](https://thespacedevs.com/llapi), and news metadata is obtained from the [Spaceflight News API](https://www.spaceflightnewsapi.net/). The Space Devs and the original news publishers retain rights in their respective services and content. Orbital Vision stores summaries and canonical source links; it does not republish full articles.

### NASA

NASA Open APIs and NASA-hosted media are used with source acknowledgement. NASA states that much of its content is generally not subject to copyright in the United States, but third-party material identified on NASA pages can have separate rights. NASA identifiers must not imply endorsement. See NASA's [Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).

### NOAA Space Weather Prediction Center

Operational space-weather products are obtained from the [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov/). NOAA information is presented with its source time and freshness and is not an endorsement or warranty. See NOAA's [Website Disclaimer](https://www.noaa.gov/disclaimer).

### Open-Meteo

Weather data is provided by [Open-Meteo](https://open-meteo.com/) under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). Orbital Vision displays weather for public launch-pad coordinates and may normalize units and presentation. Open-Meteo identifies upstream forecast datasets in its [licence information](https://open-meteo.com/en/license).

### Wikidata and Wikimedia Commons

Optional satellite images are resolved by exact NORAD identifier through Wikidata and Wikimedia Commons. Every available image keeps its creator, license and source-page attribution in the satellite inspector. Wikimedia content is governed by the license on the individual file page. API use follows the Wikimedia Foundation [API Usage Guidelines](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines) and [User-Agent Policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy).

### Cesium and ArcGIS

The Earth workspace is built with CesiumJS and displays provider attribution through Cesium's credit display. Imagery and terrain can be supplied by ArcGIS services and other identified sources. The credit display must not be hidden, removed or covered. See the [Cesium content usage and attribution guide](https://cesium.com/learn/ion/content-usage-and-attribution-guide/) and [Esri CesiumJS terms and attribution guidance](https://developers.arcgis.com/cesiumjs/terms-of-use/).

### External publishers

Space News titles, summaries, images and links originate from the publisher identified on each item. Opening the full article navigates to that publisher. Reuse outside Orbital Vision is subject to the publisher's terms.

## Direct open-source software

Orbital Vision incorporates open-source software. Important direct dependencies include:

| Component | License family | Project |
| --- | --- | --- |
| Tauri and official plugins | Apache-2.0 / MIT | [Tauri](https://tauri.app/) |
| React and React DOM | MIT | [React](https://react.dev/) |
| CesiumJS | Apache-2.0 | [CesiumJS](https://github.com/CesiumGS/cesium) |
| satellite.js | MIT | [satellite.js](https://github.com/shashwatak/satellite-js) |
| TanStack Query | MIT | [TanStack Query](https://tanstack.com/query/latest) |
| i18next and react-i18next | MIT | [i18next](https://www.i18next.com/) |
| Zustand | MIT | [Zustand](https://github.com/pmndrs/zustand) |
| Zod | MIT | [Zod](https://zod.dev/) |
| uPlot | MIT | [uPlot](https://github.com/leeoniya/uPlot) |
| Motion | MIT | [Motion](https://motion.dev/) |
| Fluent UI React Icons | MIT | [Fluent UI](https://github.com/microsoft/fluentui) |
| SQLite / rusqlite | Public domain and MIT | [SQLite](https://sqlite.org/copyright.html), [rusqlite](https://github.com/rusqlite/rusqlite) |
| reqwest, Tokio, serde and supporting Rust crates | MIT / Apache-2.0 and other compatible licenses | [crates.io](https://crates.io/) |

Exact dependency versions are locked in `pnpm-lock.yaml`, `src-tauri/Cargo.lock` and `services/translation-gateway/Cargo.lock`. Copyright notices and license texts supplied with dependencies remain in effect. This document does not replace those licenses.

## Product assets

The Orbital Vision name, logo, original interface, application code and original documentation are proprietary and covered by [LICENSE](LICENSE). No third-party provider grants rights in those product assets.
