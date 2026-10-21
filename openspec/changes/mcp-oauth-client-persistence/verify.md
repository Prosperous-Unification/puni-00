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

## Review of PR #622 (2026-10-21): merge after fixes

Fresh results after the fixes, same laptop scope (`wbs-mcp-01` targets only):

| Command                                                                     | Result                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------- |
| `env -u CLAUDECODE bunx nx run wbs-mcp-01:test --skip-nx-cache`             | 460 pass, 0 fail, 2007 `expect()` calls, 19 files |
| `bunx nx run wbs-mcp-01:typecheck` / `:lint` / `:build` (`--skip-nx-cache`) | all succeeded, lint 0 problems                    |
| migration lint on `20261021120000_mcp_client/migration.sql`                 | exit 0                                            |
| `bunx openspec validate --all --json`                                       | 266 items, 266 passed, 0 failed                   |

### Fixed

| Finding                                                                               | Change                                                                                                                                                                                                                     | Failure proof (fault → failing test)                                                                                            |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 a stored client kept authorizing to a callback removed from `HOSTED_REDIRECTS`   | `/authorize` also requires `isListedRedirect(redirectUri)`; same `invalid_request`                                                                                                                                         | dropping `isListedRedirect` → `refuses a stored redirect that is no longer on the allowlist` answered 302 instead of 400        |
| CI: CodeQL alert #19 `js/insufficient-password-hash` at `session-store.ts` `digestOf` | `oauthError` renamed `protocolError` (see below)                                                                                                                                                                           | CodeQL on the pushed head; not runnable locally                                                                                 |
| S3-1 RFC citation for `invalid_client` was wrong                                      | comment now says token-endpoint code (RFC 6749 §5.2) reused because §4.1.2.1 forbids a redirect; README, `CONTEXT.md`, `docs/auth-integration.md` say the 400 reaches the browser and client re-registration is unobserved | wording only                                                                                                                    |
| S3-3 an extension computed before a concurrent promotion could shorten it             | `extendClient` sets `MAX(expires_at, ?)`                                                                                                                                                                                   | plain `SET expires_at = ?` → `never shortens a lifetime when an extension follows a promotion` read 1600000 instead of 87400000 |
| S3-4 `admitClient` JSDoc claimed cross-process counting with no negative              | JSDoc softened to what holds: the IMMEDIATE transaction takes the write lock first; no two-process test                                                                                                                    | wording only                                                                                                                    |
| S3-5 migration comment overstated "additive"                                          | comment and proposal now say an older release refuses to open the migrated store (ledger not a prefix), as for the binding migration, and `rollbackMcpStore` has no production caller                                      | wording only; the edited `migration.sql` changes its checksum, which is safe because no store has applied it                    |

CodeQL path (SARIF of analysis 1999916783 for `refs/pull/622/merge`): the source was "a call to
oauthError", classified as a password by CodeQL's name heuristics. It flowed through the test
helper `tokenResponse`, into `credentials.refresh_token` in `oauth.test.ts`, then
`McpSessionStore.familyForRefreshToken`/`prepareRefresh` and on to `digestOf`'s SHA-256. The
same alert (#19) has been open on `main` since 2026-10-13, at the line `digestOf` held then. This
PR moved `digestOf` (to make room for `clientOf`), which changed the alert fingerprint, so the PR
check reported it as new. No password is involved: the hashed value is a 256-bit random refresh
token, and a fast digest is the right lookup key for it. Renaming the helper removes the
misclassified source rather than suppressing the alert. Whether CodeQL agrees is shown by the
check on the pushed head, not by any local run.

### Recorded, not changed

- S3-2: the #607 symptom recurs at lower frequency, because a proven client lives 24 h while
  its refresh family lives 14 days idle / 30 days absolute, and a refresh neither checks nor
  extends the client. Follow-up issue
  [#623](https://github.com/Prosperous-Unification/puni-00/issues/623).
- S3-6 and S3-7: the review marked them note-only, needing no change. Their text was not
  passed to this change's author, so they are recorded here by id only.
