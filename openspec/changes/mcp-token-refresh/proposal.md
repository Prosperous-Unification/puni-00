## Why

MCP access tokens live five minutes (`TTL_MS`, `apps/wbs/mcp-01/src/oauth.ts`)
and mcp-01 issues no refresh token: metadata advertises only
`authorization_code`. Sessions live in a process `Map` and the signing key comes
from `generateKeyPairSync` at startup, so every dev deploy (which restarts the
source-run mcp-01 inside `wbs-dev-src`) invalidates every token. The provider
refresh token, when the provider returns one for `offline_access`, is dropped at
the callback, and nothing refreshes the upstream token that be-01 checks.

Dany, 2026-09-19: "mcp auth must automatically refresh."

## What Changes

- mcp-01 issues a **strictly single-use, rotating refresh token** bound to
  `client_id`; any reuse revokes the whole refresh family.
- mcp-01 keeps the upstream side alive itself: before a tool call and on an MCP
  refresh it refreshes the provider token under a database lease, retrying a
  be-01 401 once after a successful refresh before ending the session through
  `mcp-auth-failure-signout`.
- Sessions, families and keys survive restarts: an mcp-01-owned SQLite store,
  provider tokens under versioned authenticated encryption, and signing and
  store keys loaded as current plus optional previous.
- Access-token lifetime becomes configuration. Its default is decided by
  `mcp-auth-failure-signout` task 0.1: 5 minutes if the client uses
  `refresh_token`, otherwise 1 hour, still revocable per request through the
  session store.

## Non-Goals

No prod or k3s rollout (MCP is dev-only today), no shared database with be-01,
no scope or registration-policy change, no blue/green support.

## Constraints

OAuth 2.1 public-client rules. R5: missing, malformed or unreadable key or store
fails startup; tampered ciphertext fails closed. Additive migrations with
`down.sql`.

## Capabilities

### Modified Capabilities

- `mcp-session`: sessions become durable and refreshable.

## Domain Terms

Refresh family, Upstream refresh lease. Add to `CONTEXT.md` before
implementation.

## Decisions Recorded

ADR: mcp-01 owns its SQLite store (alternatives in `design.md`).

## Impact

mcp-01 `oauth.ts`, `http.ts`, `server.ts`, new `session-store.ts` + migrations,
dev env keys and a store path that survives a dev sync. Depends on
`mcp-oidc-store` and `mcp-auth-failure-signout`.
