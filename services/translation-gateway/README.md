# Orbital Vision Translation Gateway

Product-managed gateway between the desktop application and a translation provider. Provider credentials remain on the server and are never compiled into the Tauri client.

Required environment:

- `LIBRETRANSLATE_URL` — HTTPS LibreTranslate base URL. Localhost HTTP is accepted for development.
- `LIBRETRANSLATE_API_KEY` — optional provider key.
- `BIND_ADDR` — defaults to `127.0.0.1:8088`.
- `RATE_LIMIT_PER_MINUTE` — defaults to `30` per client IP.

The desktop application uses `ORBITAL_VISION_TRANSLATION_GATEWAY_URL` at build or runtime. Without it, Space News remains fully usable in original English and translation jobs stay queued locally.

Endpoints:

- `GET /health`
- `GET /v1/languages`
- `POST /v1/translations`

The gateway accepts English source text and only the Orbital Vision target locales `az`, `tr`, `ru`, and `es`. Batches are limited to 10 records and 12,000 characters. Article text is never scraped or logged.
