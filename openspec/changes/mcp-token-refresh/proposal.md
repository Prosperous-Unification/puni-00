## Why

MCP access tokens live five minutes (`TTL_MS`, `apps/wbs/mcp-01/src/oauth.ts`)
and mcp-01 issues no refresh token: metadata advertises only
`authorization_code` and the token endpoint accepts nothing else. A connected
client such as Claude therefore has to send the user through the browser again
every five minutes. Two more facts make any refresh useless today: sessions live
in a process `Map`, and the signing key comes from `generateKeyPairSync` at
startup, so every deploy or restart invalidates every token. The upstream refresh
token the provider already returns (the shared client requests `offline_access`)
is discarded at the callback.

Dany, 2026-09-19: "mcp auth must automatically refresh."

## What Changes

- mcp-01 issues a **rotating, one-time refresh token** with every access token and
  accepts `grant_type=refresh_token`; metadata and registration advertise it.
- A refresh keeps the upstream side alive: mcp-01 stores the provider refresh
  token for the session and refreshes it through the shared `BrowserOidcClient`
  when the upstream access token is near expiry.
- MCP sessions and refresh families survive restarts and blue/green swaps: a
  small SQLite store owned by mcp-01, with the provider refresh token encrypted at
  rest, and a signing key loaded from deploy secrets instead of generated.
- Reuse of a consumed refresh token revokes the whole family.

## Non-Goals

No change to access-token lifetime, scopes, registration policy or the be-01
web session. No shared database with be-01.

## Constraints

OAuth 2.1 public-client rules: rotation plus reuse detection, bound to
`client_id`. Keep `mcp-oidc-store` semantics. Blue/green: two mcp-01 processes
may share the store mid-swap, so its migrations are additive. R5 throughout: a
missing key or unreadable store fails startup; it never falls back to an
ephemeral key.

## Capabilities

### Modified Capabilities

- `mcp-session` (from `mcp-auth-failure-signout`): sessions become durable and
  refreshable.

## Domain Terms

Refresh family: every refresh token descended from one login. Add to
`CONTEXT.md`.

## Decisions Recorded

ADR needed: mcp-01 owns a SQLite store (alternatives: in-memory plus persisted
key only; storing sessions in be-01). See `design.md`.

## Impact

mcp-01 `oauth.ts`, `http.ts`, new `session-store.ts` + migration + `down.sql`,
dev secrets (signing key, store encryption key) and a store path that survives a
dev sync. MCP runs only on dev today (source-run inside `wbs-dev-src`, restarted
by every dev deploy), which is where users lose sessions most. Depends on
`mcp-oidc-store` and `mcp-auth-failure-signout`.
