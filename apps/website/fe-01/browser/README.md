# Local analytics fixture

`analytics.mjs` runs the real non-debug Google tag in intercepted HTTPS browser contexts. It serves the public `analytics-home.mjs` adapter fixture at `https://dev.puni.dev/` and a built public app at `https://dev.app.puni.dev`. Home here is a public adapter integration test; the licensed private site's built Home and cross-host integration require their separate verification.

Run with Bun, the repository's existing dependencies, an installed Chrome or `PUNI_CHROMIUM_PATH`, and unique local ports. Keep the API scripted: `conversation-api.mjs` owns a real disposable SQLite store and substitutes its provider transport without reading a provider secret or making paid calls.

For example, start these commands from the repository root, using separate terminals for the long-lived processes:

```sh
WEBSITE_API_PORT=32861 APP_ORIGIN=https://dev.app.puni.dev PUBLIC_ORIGIN=https://dev.puni.dev WEBSITE_DATABASE_PATH=/tmp/puni-analytics.sqlite bun apps/website/fe-01/browser/conversation-api.mjs

VITE_ANALYTICS_ENABLED=true VITE_ANALYTICS_ENVIRONMENT=development VITE_ANALYTICS_MEASUREMENT_ID=G-R0JM3R4SSV VITE_API_ORIGIN=https://dev.puni.dev/api VITE_SITE_ORIGIN=https://dev.puni.dev bunx vite build --config apps/website/fe-01/vite.config.ts

bunx vite preview --config apps/website/fe-01/vite.config.ts --host 127.0.0.1 --port 42861

PUNI_API_ORIGIN=http://127.0.0.1:32861 PUNI_APP_ORIGIN=http://127.0.0.1:42861 PUNI_SCREENS_DIR=/tmp/puni-analytics-proof bun apps/website/fe-01/browser/analytics.mjs
```

The default run has sixteen enabled cases. It checks canonical first Home before interaction, startup ordering/navigation, denied storage, acceptance without controller replay, rejection/withdrawal, stored rejection, loader recovery/two-attempt bound, cookieless memory deduplication, responsive controls, chat/manual confirmation and recovery/reload, and submission while loading/blocked. A separate disabled artifact uses `VITE_ANALYTICS_ENABLED=false` and `PUNI_ANALYTICS_CASE=disabled`. A named case can be selected with `PUNI_ANALYTICS_CASE`; `metadata` selects `home-first`.

Without `PUNI_GOOGLE_TAG_PATH`, the runner fetches the official non-debug runtime. To reproduce an exact runtime, download that URL with response headers, retain the acquisition time and SHA-256, and pass the path. `tag-identity.json` records the runtime hash, byte count, source URL, supplied path and run time; a supplied file's official provenance requires its separate acquisition receipt. The fixture has no synthetic-vendor pass mode.

Every Google collector destination is fulfilled locally with HTTP 204; no measurement is sent to Google. GET fields and newline-delimited POST fields are decoded together with their request envelope. The fixture snapshots commands, insertion state and storage while the page is alive, retains interception through context closure, then saves and inspects the complete captured requests. Receipts retain raw requests, decoded fields, sanitized Google commands, command snapshots at script insertion, storage names and the verdict. The accepted-then-withdrawn case creates and confirms a real permitted lead marker and functional session sentinel before rejection, then checks marker removal and sentinel preservation. The official tag can use its `stripProtocol` transport experiment; only exact canonical locations with or without `https://` are accepted, and the raw spelling remains in receipts. Consent-update pings (`gcu=1`) and SDK `user_engagement` are separated from controller replay using the command history. Screenshots cover the public Home fixture and controls at 320, 390 and 1440 pixels.

The fixture proves controlled browser enqueue, collector payload and storage behavior. It does not establish Google ingestion, attribution, account settings, modeled traffic or processed reports. Stop all owned API/preview processes when finished. Production, Ads/account settings and private projections are outside this fixture.
