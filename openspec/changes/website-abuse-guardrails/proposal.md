# Website abuse guardrails

## Why

The anonymous paid conversation goes live with one in-memory minute window per path, the allowance and Argon2id as the whole defence. A script can burn the $10 site ceiling every day because it resets at midnight, drafts and proposals have no daily bound, the operator login allows 30 guesses a minute, half the routes have no window, and nobody is told. Dany asked for rate limiting and a thought-through session model first.

## What Changes

- **Request windows**: a general per-source window over every route beside the per-path windows; `Retry-After` on 429; expired OIDC logins swept.
- **Daily caps**: per-source, per-email and site-wide UTC-day caps on drafts and proposal requests, durable in SQLite.
- **Operator login**: lockout per source and per account before the Argon2id verify, with an alert.
- **Browser check**: a self-hosted proof of work once per conversation before the first paid reply; invisible, no third party; the manual path stays free of it.
- **Inference pause**: at 80% of the site-day ceiling paid inference pauses until an operator resumes it; Build shows a paused state; operators can pause by hand.
- **Alerts**: spend, pause, lockout, cap and error alerts recorded durably, pushed to one webhook, free of personal data.
- **Sessions**: a prospect sign-out route; the model is written down.

## Non-Goals

No CAPTCHA vendor, no accounts for chat, no account-path redesign, no edge limiter on the shared WBS Caddy, no metrics pipeline (k3s follow-up), no outbound email, no allowance changes.

## Constraints

Additive migration `009_guardrails` with `down.sql`; blue and green share one SQLite writer, so nothing per request writes a row. Every check needs a watched negative (R5). No prompt, email or address in logs or alerts. Public repository; Bun, Nx, the h2puni gate.

## Capabilities

### New Capabilities

- `request-windows`: general and per-path minute windows.
- `daily-caps`: durable UTC-day caps.
- `operator-login-lockout`: lockout before verification.
- `browser-check`: proof of work before the first paid reply.
- `inference-pause`: persisted pause, visible to visitors.
- `guardrail-alerts`: durable alerts, optional webhook.
- `prospect-sign-out`: sign-out for the optional account session.

### Modified Capabilities

None in `openspec/specs/`; superseded lines of the unarchived `anonymous-conversation` delta are named in `design.md`.

## Domain Terms

Request window; Daily cap; Login lockout; Browser check; Inference pause; Guardrail alert.

## Decisions Recorded

- [ADR 0035](../../../docs/adr/0035-bot-deterrence-is-a-self-hosted-proof-of-work.md)

## Impact

`apps/website/{be-01,fe-01}`, `libs/website/*` (migration 009, `@noble/hashes`), `docs/website/*`; private: Home form copy, `GUARDRAIL_WEBHOOK_URL`, k3s Traefik follow-up.
