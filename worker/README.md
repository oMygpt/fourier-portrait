# Encrypted sketch storage

Worker: `fourier-portrait-share` · R2 binding: `SKETCHES` → `fourier-portrait-sketches`.
No DNS routes are configured. Deploy to workers.dev with `npx wrangler@4.166.0 deploy --config worker/wrangler.toml`, supplying account/token through the environment, never the config.

Apply `lifecycle.json` through the Cloudflare R2 bucket lifecycle API. Its enabled age rule covers every object and schedules deletion after 2,592,000 seconds. The Worker independently refuses to serve objects at age 30 days, even if asynchronous lifecycle deletion has not yet run. Already downloaded copies cannot be recalled.

- `POST /s`: positive `Content-Length` required; maximum 1 MiB, enforced again while streaming. Stores opaque bytes and returns `201 {"id":"<128-bit base64url>"}`.
- `POST /s` accepts an optional `X-Delete-Hash` header (base64url SHA-256 of a 256-bit client-held delete token), stored as object metadata. The token itself never reaches the server until deletion.
- `DELETE /s/:id` with `X-Delete-Token`: hashes and compares in constant time; `204` on success or if already gone, `403` on mismatch or for legacy objects without a hash, `400` on malformed input.
- Every path is also served under `/api` (route `fourier.jupyter.pro/api/*`), so the production site calls it same-origin. Same-origin `GET`s carry no `Origin` and are allowed; `POST`/`DELETE` always require an allowed `Origin`.
- `GET /s/:id`: ciphertext as `application/octet-stream`. Missing/expired objects return empty `204`; clients use the embedded tone map. Invalid id syntax is `400`.
- CORS permits only `https://fourier.jupyter.pro`, the legacy `https://omygpt.github.io` and `http://localhost[:port]`. OPTIONS handles browser preflight (`GET, POST, DELETE`).
- Every response is `no-store` / `nosniff`. No body logging, analytics or Worker observability is enabled.

The server does not receive keys or plaintext; normal network metadata (IP, timing and ciphertext length) is still visible to the provider. CORS is not authentication. This is a public unauthenticated upload endpoint with per-request limits, not a comprehensive anti-abuse system; monitor Cloudflare quotas and add provider-side rate limits if needed.

The only client API URL is `SKETCH_API_BASE` in `encrypted-sketch.mjs`. A future custom-domain migration must also update the allowed site origin here if the site's origin changes. No DNS changes are needed for the current workers.dev deployment.

Tests: `node --test worker/worker.test.mjs`.
