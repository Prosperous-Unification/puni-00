## Why

PUNI currently shows an analytics invitation to every new visitor, while the owner wants a small card only for consent regions. The downloaded country database is not connected to the app, and its licence attribution and monthly replacement reminder are missing.

## What Changes

- Estimate country locally from the existing trusted client address using the owner's verified November 2026 DB-IP Lite MMDB.
- Show the compact card in the EEA, UK, Switzerland and unknown-country cases. Known other countries use the regional default without an arrival card. Existing explicit privacy choices always win.
- Keep Privacy choices available everywhere and measurement separate from request handling.
- Link to DB-IP on every site/app page using this feature; retain source, licence and unchanged-database notices.
- Add a dated monthly replacement note, next due 1 December 2026, and nonsecret dataset/update-due metadata.

## Non-Goals

Precise location, nationality or legal-residence detection; per-visitor third-party lookup; automatic database downloads; new persistent IP/country records; paid inference activation; production release; owner About/blog edits.

## Constraints

Use the supplied archive and provider-verified extracted checksum, preserve trusted-proxy and privacy isolation boundaries, never grant storage from missing/invalid country responses, preserve explicit opt-out and no-history-backfill behavior, bundle data only in the server, retain visible attribution and unknown-country fallback. Production remains held.

## Capabilities

### New Capabilities

- `regional-analytics`: local country lookup, regional cookie defaults and arrival-card visibility, attribution, maintenance and packaged-data checks.

### Modified Capabilities

None; the new capability supersedes the location-independent fresh-choice rule only where explicitly stated.

## Domain Terms

Country estimate; consent region; regional default. Definitions are in docs/website/CONTEXT.md.

## Decisions Recorded

None; the reader and local dataset can be replaced without changing the visitor contract.

## Impact

Website API/app/contracts/analytics, their private snapshots, licensed site footer/runtime, API build assets and website maintenance docs. Adds a pure JavaScript MMDB reader; no schema migration.
