# Retire prospect sign-in

## Why

The funnel has two conversation designs: the anonymous, claim-bound `/conversation*` that is live
since 2026-10-07, and an account-owned `/chat*` and `/concept*` path behind prospect OIDC and a
demo sign-in that no deployment could reach, because no OIDC client was ever provisioned. Every
guardrail since then was built twice, and the unreachable path still holds a known lock-up on
unsettled usage. ADR 0039 (2026-10-11 amendment, batch 10 decision D1) removes the second design.
WBS 060.05.1 part 2, 080.24.08 (one stream pump) and the scope side of 080.24.06 (one accounting
rule) close with this change.

## What Changes

- **API**: `GET /session`, `DELETE /session`, `GET /session/oidc/start`,
  `GET /session/oidc/callback` (and its `/api` form), `POST /session/demo`, `GET /chat`,
  `POST /chat`, `POST /chat/stream`, `POST /chat/cancel`, `POST /concept` and
  `POST /concept/revision` answer `404 not_found` and write nothing. `/draft`, `/entry`, `/brief`,
  `/intakes` and `/proposals` lose their signed-in branches and authorize only by the draft claim.
- **Startup**: any `OIDC_*` environment setting, even an empty one, stops the API with
  `prospect sign-in was retired on 2026-10-11 (ADR 0039); remove OIDC_<NAME>`.
- **Code**: one stream pump with one caller; the store loses every account writer
  (`submitAccount`, the account chat, concept, session, OIDC and `provider_call` writers and the
  account reservation); the inference pause trips only inside `admitConversationOperation`; the
  concept preview UI and the unused `@ai-sdk/react` and `@assistant-ui/*` dependencies go.

## Non-Goals

No migration and no dropped table: the account tables stay (blue and green share SQLite; additive
migrations), retention still covers their rows, and the site-day spend still sums
`provider_call` until it is confirmed empty on the deployed database. No change to
`/conversation*`, the manual brief, the operator routes or `DEMO_AUTH`'s name. No private-repo
change (slice S5 drops the `OIDC_*` keys from the secret allowlist).

## Constraints

Removals only in `server.ts`, so a parallel `GET /operator/funnel` merges cleanly. Every retired
route answers exactly like an unknown route. Each new or changed check has a watched negative
(R5). Public repository; Bun and Nx; the h2puni gate.

## Capabilities

### New Capabilities

- `funnel-scope`: exactly one conversation API, the retired routes' 404, and the startup refusal
  of `OIDC_*` settings.

### Modified Capabilities

None in `openspec/specs/`. Retired unarchived deltas: `website-abuse-guardrails` capability
`prospect-sign-out` (its spec file is marked retired), the `website-abuse-guardrails`
`request-windows` requirement "Per-path windows include the OIDC routes" only (marked retired in
place; its other requirements stand) and the sign-in lines of `assistant-ui-build`
`build-experience` ("Google sign-in", "After sign-in, Build SHALL show the saved Home request",
"Unknown usage SHALL retain its reservation ... until reconciled"), which archiving this change
supersedes. The `puni-website-funnel` lines were rewritten in place by the scope slice (S1).

## Domain Terms

Legacy account rows: `prospect_*`, `software_request`, `chat_*`, `provider_call` and
`request_concept_preview` rows written before this change; read by retention and the site-day sum,
written by nothing.
