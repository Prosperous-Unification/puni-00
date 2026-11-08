## Why

The anonymous chat counts completed exchanges while publishing text before completion, so repeated cancellations obtain extra replies. New drafts reset conversation counters, daily source identities change at midnight, and proxy trust and aggregate spending need stronger boundaries before further public use.

## What Changes

- Preserve anonymous entry, eight completed exchanges, Send, Stop, Retry, Start over and manual proposals.
- Bound paid attempts, persist browser allowances across drafts, and enforce rolling source/browser and new-conversation windows across restarts.
- Limit site spend over an hour and a month in addition to existing daily limits and pause.
- Authenticate forwarded client identity at the network boundary.
- Provide a preview-only secret URL fragment that resets the requesting browser's test allowance without erasing financial records or relaxing site spending limits.

## Non-Goals

Prospect sign-in, email verification, fingerprinting, external CAPTCHA, new user steps, automatic billing reconciliation, unlimited testing inference.

## Constraints

Additive SQLite migration with down.sql; transactional admission before provider calls; current response states; no secrets or raw addresses in logs; Bun and Nx; watched production-path negative proofs; canonical host gate before merge/deploy. Preserve existing drafts. Testing reset is operator-secret protected and unavailable on production origins.

## Capabilities

### New Capabilities

- `anonymous-inference-hardening`: durable attempt, browser, rolling admission, spend and network boundaries with a scoped preview test reset.

### Modified Capabilities

None.

## Domain Terms

Browser allowance; Paid attempt.

## Decisions Recorded

None; policies and the preview control are reversible.

## Impact

Website API, SQLite adapter, invisible frontend URL-fragment consumption, preview gateway/deployment configuration, website runbook and public/private release receipts. No new dependency.
