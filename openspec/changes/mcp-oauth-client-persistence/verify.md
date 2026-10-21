## Commands

Run 2026-10-21 in a worktree off `origin/main` 2bec392b, on the laptop, with only
`wbs-mcp-01` targets (the laptop RAM cap forbids the full workspace gate there).

| Command                                                                                                                    | Result                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `env -u CLAUDECODE bunx nx run wbs-mcp-01:test --skip-nx-cache`                                                            | 458 pass, 0 fail, 2001 `expect()` calls, 19 files (baseline before the change: 443 pass)                                 |
| `bunx nx run wbs-mcp-01:typecheck --skip-nx-cache`                                                                         | succeeded                                                                                                                |
| `bunx nx run wbs-mcp-01:lint --skip-nx-cache`                                                                              | succeeded, 0 problems                                                                                                    |
| `bunx nx run wbs-mcp-01:build --skip-nx-cache`                                                                             | succeeded (`main.js` 2.49 MB, migration SQL bundled as text)                                                             |
| `bunx prettier --check` over mcp-01, this change, `CONTEXT.md`, `docs/auth-integration.md`                                 | all formatted                                                                                                            |
| `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts apps/wbs/mcp-01/drizzle/20261021120000_mcp_client/migration.sql` | exit 0; the same command on a probe folder holding `DROP TABLE` and no `down.sql` exited 1 naming the missing `down.sql` |
| `bunx openspec validate --all --json`                                                                                      | 266 items, 266 passed, 0 failed; `mcp-oauth-client-persistence` valid with no issues                                     |

Not run here: `bunx nx format:check --all` and `bunx nx run-many -t test lint typecheck build`
across the workspace, and `bin/h2puni-gate.sh`. CI on the PR head is the full gate for this
change (task 4.2). No live client was exercised (task 4.3).

## Failure proofs

Each fault was injected into the production source, the named test run, and the source
restored; every `Proof:` comment names the same fault and test.

| Check                                         | Fault injected                                                                                         | Test observed failing                                                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clients persist in the store                  | store deletes every `mcp_client` row when it opens                                                     | `authorizes and exchanges a code for a client registered before the restart` (400 for 302), plus the restart cap, promotion and lifetime cases                                                                |
| Unknown client answers `invalid_client`       | that branch answers `invalid_request`                                                                  | `answers invalid_client with a re-register hint for an unknown client_id`, `answers invalid_client once an unproven client expires across a restart`                                                          |
| Malformed request stays `invalid_request`     | malformed branch answers `invalid_client`                                                              | `keeps the request error for a malformed authorization of a registered client`                                                                                                                                |
| Unregistered redirect stays `invalid_request` | redirect branch answers `invalid_client`                                                               | `registers a public client and refuses an unregistered redirect URI`, `authorizes only a URI registered to that client, even when it is allowlisted`                                                          |
| Authorization extension is stored             | `extendClient` call skipped                                                                            | `keeps an unproven client alive through its active authorization flow`, `keeps the absolute unproven lifetime an authorization extension stored before the restart`                                           |
| Promotion is stored                           | `promoteClient` call skipped                                                                           | `promotes a client only after a successful token exchange`, `keeps a promoted client proven and counted across the restart`                                                                                   |
| Census counts stored clients                  | census `total: 0`                                                                                      | `expires dynamic clients and frees their capacity`, `refuses registration at capacity without evicting a live connector`, `counts clients registered before the restart against the global and source limits` |
| Census lists the source's stored clients      | census `fromSource: []`                                                                                | `counts clients registered before the restart against the global and source limits`, `keeps a promoted client proven and counted across the restart`                                                          |
| In-memory promotion reservation               | reservation not added                                                                                  | `reserves proven-source capacity across concurrent token signing`                                                                                                                                             |
| Request sweep deletes expired clients         | `deleteExpiredClients` call dropped from `cleanup`                                                     | `deletes an expired client from the store when the next request sweeps`                                                                                                                                       |
| Store reads ignore expired rows               | `expires_at > ?` dropped from `client`, from `clientsFromSource`, from the census count (each in turn) | `keeps a registered client across a reopen until it expires`                                                                                                                                                  |
| Store deletes expired rows                    | `DELETE` replaced by `SELECT`                                                                          | `keeps a registered client across a reopen until it expires`                                                                                                                                                  |
| Malformed stored row throws                   | type checks dropped / redirect-list checks dropped / JSON error swallowed                              | `refuses a stored client with …` cases: `proven outside 0 and 1` and `a text expiry` / `an empty redirect list` and `a non-string redirect` / `unparseable redirect_uris`                                     |
| `down.sql` drops the table                    | `DROP TABLE mcp_client` replaced by `SELECT 1`                                                         | `rolls back to the binding migration, dropping clients, and forward again`                                                                                                                                    |

## Assumptions not observed

- That Claude Code or another MCP client re-registers by itself on `invalid_client` from the
  authorization endpoint is not observed. That response goes to the browser, not to the client's
  HTTP stack, so the `error_description` may only reach a human. The fix that does not depend on
  this assumption is persistence: a client within its lifetime no longer needs to register again.
- A refresh grant still neither checks nor extends the registered client (unchanged). A client
  that only refreshes for over 24 hours finds its `client_id` expired at its next authorization
  and is told to register again.
