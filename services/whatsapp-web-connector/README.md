# WhatsOrder WhatsApp Web connector

Persistent QR-linked transport for the WhatsOrder pilot. It is intentionally a
separate service because Vercel functions cannot hold a long-lived WhatsApp Web
socket.

## Required environment

- `WHATSORDER_APP_URL` — public WhatsOrder URL, for example `https://whatsorder.example`
- `WHATSORDER_CONNECTOR_SECRET` — at least 32 random bytes; use the same value as
  `WHATSAPP_WEB_CONNECTOR_SECRET` in the Next.js deployment
- `CONNECTOR_DATA_DIR` — persistent encrypted-at-rest volume path (default `/data/sessions`)
- `PORT` or `CONNECTOR_PORT` — defaults to `8080`

The Next.js deployment also needs:

- `WHATSAPP_WEB_CONNECTOR_URL` — public HTTPS URL of this service
- `WHATSAPP_WEB_CONNECTOR_SECRET` — the shared secret above
- `GEMINI_API_KEY` — required only when AI answers beyond deterministic greeting/menu intents
- optionally `WHATSAPP_AI_MODEL`

## Deployment requirements

Deploy the Dockerfile on a service that supports a persistent volume, one
always-on instance, HTTPS, and outbound internet access. Mount the volume at
`/data`. Do not run multiple connector replicas against the same session
directory.

WhatsApp Web credentials never enter Supabase or the browser. They remain in
the connector volume. App-to-connector and connector-to-app requests are signed
with a five-minute replay window.

This is an unofficial WhatsApp Web integration. A restaurant may need to scan a
new QR after logout or a WhatsApp-side session reset, and WhatsApp may restrict
unsupported automation. Keep the existing official Cloud API transport
available for restaurants requiring an officially supported connection.

