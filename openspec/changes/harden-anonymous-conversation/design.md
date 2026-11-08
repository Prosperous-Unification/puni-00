## Context

The approved scope is invisible hardening of the current anonymous guided-scoping journey, plus an operator-only preview reset. Main already contains structured scoping answers and reply recovery; those behaviors must be preserved. Existing daily source salts are shared in SQLite and retained for today and yesterday. Preview deployment is privately governed Kubernetes, rather than the historical Compose stack.

## Goals / Non-Goals

Keep the successful path and all visible controls; close generation-count, reset, midnight, restart and forwarded-address gaps. Preserve additive deployment and content-retention behavior. No prospect authentication, fingerprint vendor or new visitor step.

## Decisions

### Durable admission and accounting

Add migration 014 with its down.sql. Keep counters and a content-free paid-attempt ledger separate from removable conversation text. Ledger rows retain reservation, settlement, admitted timestamp, conversation, browser and daily source identities for at least the current month and the rolling windows. Backfill existing paid operations and preserve legacy provider_call accounting. Changes to settlement must stay atomic with the original operation, including writes from an outgoing compatible binary; database triggers are an acceptable way to maintain the ledger during mixed-version operation. Refused operations never debit an allowance. Admission remains one immediate transaction.

Ten paid attempts bound retries independently of the eight completed-turn display. A browser allowance is a random host-only HttpOnly cookie, validated/minted by the server and bound to its drafts; a missing cookie does not move an existing draft. Existing drafts remain available through their current claims and receive a conservative legacy binding. Browser and source windows are three conversations and USD0.30 per rolling 24 hours; source lookups include the current and previous day's salted hash. New paid conversations are limited to one/minute per browser and source and twenty/minute site-wide. Busy windows return rate_limited plus Retry-After without permanently exhausting a conversation.

Site spend remains USD10/day with its existing USD8 pause and four-call concurrency cap; add USD2/rolling hour and USD100/UTC month. Site accounting is independent of content retention. Time-window refusals use existing API/UI states and include recovery timing where applicable. Demo replies do not consume paid allowances.

### Network trust

Explicit trusted socket addresses/CIDRs gate forwarded-source use. Runtime parsing rejects malformed trusted ranges; public forwarded deployments require a configured peer boundary. Preview gateway/NetworkPolicy and secret/config wiring must match actual Kubernetes traffic. The API is never exposed as a public NodePort/host port. The private deployment repository owns those manifests and proofs.

### Preview reset

The operator opens `/#test-reset=<secret>` on the app. A startup helper removes this fragment synchronously before any analytics, then calls `POST /testing/reset` with the secret in `X-Puni-Test-Reset` and credentials. Normal requests and UI acquire no dependency on reset configuration. A high-entropy environment value enables reset only on the exact development site paired with `dev.request.puni.dev` or legacy `dev.app.puni.dev`, or local loopback; the API rejects production enablement. The endpoint compares digests in constant time and requires the exact app Origin. An authorized reset establishes a fresh scoped test allowance, records counter baselines as necessary, and reopens an exhausted claimed conversation without deleting its history. Site financial ceilings, automatic/operator pause and concurrency remain authoritative. A reset must fence/abort the claimed conversation’s in-flight attempt before renewing its counters; other open drafts retain their original browser binding and allowances. No secret is committed, logged, included in errors or placed in an HTTP URL. A generated secret and final test link are delivered through a private local credential artifact.

## Risks / Trade-offs

Cookie clearing and distributed sources can still create new anonymous identities. The controls raise cost and bound spend, not prove one human. Shared source addresses can reach limits sooner. The browser claim adds first-party storage that must be described in privacy documentation. Short windows and proxy peers require actual deployment verification; source-only checks do not prove the live boundary.

## Migration Plan

Create the additive schema, preserve old inserts/settlements, verify down.sql and rollback compatibility, then deploy matching public snapshots and private runtime/gateway configuration. Canonical gate runs the exact public SHA under the host lock. Back up SQLite and record its complete migration ledger before rollout. Verify served release identities, existing user flow, negative proxy/reset probes and persistence before declaring deployment complete.

## Open Questions

None. The owner authorized all six controls, the unchanged user journey, the scoped URL testing reset, merge and preview deployment. USD100/month is an application ceiling; any stricter existing provider-key ceiling remains unchanged.
