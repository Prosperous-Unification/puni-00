## Why

mcp-01 keeps dynamically registered OAuth clients in a process-local map
(`apps/wbs/mcp-01/src/oauth.ts`). Every deploy restarts mcp-01, so afterwards a
client that still holds its `client_id` gets a bare `400 invalid_request` from
`GET /mcp/oauth/authorize` (dev, 2026-10-21, issue #607). Refresh grants keep
working because families live in the SQLite MCP store, so stale sessions survive
while fresh authorization fails, and every connected client has to clear its
authentication by hand after each deploy.

## What Changes

- Registered clients move into the MCP store beside refresh families, through a
  new paired store migration `20261021120000_mcp_client`. Lifetimes (10-minute
  unproven sliding expiry, 20-minute absolute unproven cap, 24-hour proven
  lifetime), the global, per-source unproven and per-source proven caps, and
  promotion after a successful code exchange keep their meaning across restarts.
- Authorization with an unknown or expired `client_id` answers `400` with
  `error: invalid_client` and an `error_description` asking the client to
  register again. Every other malformed authorization request, including a
  redirect URI the known client did not register, stays `invalid_request`.

## Non-Goals

No change to the `/register` or token endpoint response shapes, to client
lifetimes or caps, or to refresh behavior: a refresh grant still neither checks
nor extends the client. Authorization codes, pending logins, organization
choices and reauthentication markers stay in memory; they are minutes-long.

## Constraints

The migration is additive (blue and green share the store mid-swap) and ships
its `down.sql`. A promotion reservation held across one code exchange stays in
process memory: a stored reservation would outlive a process that died
mid-exchange and refuse that client's later exchanges until it expired. Stored
rows are trusted state: a malformed row throws rather than reading as an absent
client. R5 negatives for each new check.

## Capabilities

### Modified Capabilities

- `mcp-session`: registered clients survive restarts; unknown clients are told
  to register again.

## Domain Terms

Registered MCP client (added to `CONTEXT.md`).

## Decisions Recorded

None earn an ADR; the reservation choice is JSDoc on `promotionReservations`.

## Impact

mcp-01 `oauth.ts`, `session-store.ts`, `store-migrations.ts`, a new
`drizzle/20261021120000_mcp_client/`, tests, README and
`docs/auth-integration.md`. The class is renamed `McpOAuthServer`, since it is
no longer in-memory.
