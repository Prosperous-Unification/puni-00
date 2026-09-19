## Why

An MCP caller whose authorization has failed stays connected and stuck
(`apps/wbs/mcp-01/src`, read at `origin/main` 1eeacb0b):

1. **Failed use.** `caller-auth.ts` swaps the MCP token for the stored upstream
   token and keeps no local session identity. When be-01 rejects that upstream
   token, `wbs-client.ts` returns a tool error ("sign in again and retry") and
   `server.ts` wraps it in a successful MCP result. The MCP session stays live,
   so every later call fails the same way; nothing makes the client re-authorize.
2. **Failed login.** In `oauth.ts` `callback`, a missing `wbs:read` answers the
   browser with a bare JSON 400; exchange and upstream-verification exceptions
   propagate as server errors. The MCP client is never told, and the provider
   session survives, so a retry silently reuses the refused account.

Dany, 2026-09-19: "unsuccessful login for MCP must automatically log you out."

## What Changes

- Authentication carries the local MCP session identity (`jti`) alongside the
  upstream token into every tool call.
- A be-01 401 that is not the configured Basic edge challenge ends the MCP
  session and returns a tool error saying the session ended. The MCP SDK cannot
  turn a tool call into an HTTP 401, so the logout takes effect on the client's
  next request, which receives `401` with `error="invalid_token"` and re-runs
  authorization. (`mcp-token-refresh` later inserts one upstream refresh first.)
- Failed logins return to the client: every failure after the pending
  authorization is matched maps through one table to an RFC 6749 `error`,
  redirects to the validated client URI with `state`, and revokes any provider
  refresh token the refused login produced.
- The next login after a failure re-authenticates: a separate signed,
  short-lived marker cookie makes the next authorize send `prompt=login`.

## Non-Goals

No provider end-session (the client URI is not a provider-registered logout
URI), no refresh, no persistence, no be-01 or fe-01 change.

## Constraints

Keep `mcp-oidc-store` semantics. Never redirect to an unvalidated URI. R5 and
production-path negatives for redirect safety and edge-challenge detection.

## Capabilities

### New Capabilities

- `mcp-session`: when an MCP session ends and what the client is told.

## Domain Terms

MCP session, Reauthentication marker. Add to `CONTEXT.md` before
implementation.

## Decisions Recorded

A1: "log you out" covers both paths. A2: the user's client re-authorizes after
`401 invalid_token`; task 0.1 proves or falsifies this before any code.

## Impact

mcp-01 `caller-auth.ts`, `http.ts`, `server.ts`, `wbs-client.ts`, `oauth.ts`;
`libs/wbs/adapters/auth` `authorizationUrl` gains `prompt`. Depends on
`mcp-oidc-store`.
