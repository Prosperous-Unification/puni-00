## Why

An MCP caller whose authorization has failed stays "signed in" and stuck. Two
paths, both observed in `apps/wbs/mcp-01/src`:

1. **Failed use.** When be-01 rejects the upstream access token behind a live
   MCP session, `wbs-client.ts` turns the 401 into an MCP tool error ("sign in
   again and retry") inside a successful MCP response. The client never sees
   HTTP 401, keeps its token, and every later call fails the same way.
2. **Failed login.** A callback that ends in `access_denied` (no `wbs:read`
   group), an upstream error, or a failed exchange answers the browser with a
   bare JSON body (`oauth.ts` `callback`). The MCP client is never told, and the
   identity provider's session survives, so the retry silently reuses the same
   refused account.

Dany, 2026-09-19: "unsuccessful login for MCP must automatically log you out."

## What Changes

- A failed authenticated use ends the MCP session: mcp-01 deletes it (and, once
  `mcp-token-refresh` lands, its refresh family) and answers **HTTP 401 with
  `WWW-Authenticate: Bearer error="invalid_token"`** plus the existing
  `resource_metadata`, so a conforming client discards its tokens and restarts
  authorization without the user doing anything.
- A failed login returns to the MCP client: callback failures after the client's
  redirect URI is known redirect there with `error` (RFC 6749 §4.1.2.1) and the
  original `state`, instead of a JSON dead end.
- The next login after a failed one re-authenticates: the following authorize
  for that browser sends `prompt=login` upstream. If provider discovery
  advertises `end_session_endpoint`, the failure page also ends the provider
  session.

## Non-Goals

No token refresh (separate change `mcp-token-refresh`), no persistent storage,
no change to the be-01 web login, no provider-specific logout code.

## Constraints

Keep `mcp-oidc-store` semantics (wrong-state callbacks never burn a live login).
Never redirect to an unregistered URI: errors before the client and redirect URI
are validated stay local. R5: an unreadable be-01 answer is a failure, not a
pass.

## Capabilities

### New Capabilities

- `mcp-session`: when an MCP caller's session ends and what the client is told.

## Domain Terms

MCP session (new): the mcp-01 record behind one issued MCP access token. Add to
`CONTEXT.md` in the design interview.

## Decisions Recorded

Assumption A1 — "log you out" means both paths above; falsified if Dany meant
only one. Assumption A2 — `prompt=login` is provider-agnostic enough; falsified
if the production provider ignores it (then end-session becomes required).

## Impact

mcp-01 `oauth.ts`, `http.ts`, `wbs-client.ts`, their tests; `CONTEXT.md`. No
migration, no be-01 or fe-01 change. Depends on `mcp-oidc-store` landing first.
