# verify — enable-public-mcp-client-auth

## Spec-time commands

The repository-root command bunx @fission-ai/openspec@1.12.0 validate --all --json exited 0: 126 passed, 0 failed. This change was valid. File-scoped bunx prettier --check exited 0 for all seven packet files.

## Planned commands — pending implementation

- `bun test apps/wbs/mcp-01/src/http.test.ts apps/wbs/mcp-01/src/oauth.test.ts` and `bun run test:unit` for mounted auth and session paths.
- Public HTTPS `curl` probes for each well-known route, followed by attended ordinary-user OAuth/read/write/refresh/revocation smoke without printing credentials.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`, file-scoped `bunx prettier --check`, and `bin/h2puni-gate.sh <sha>` on h2puni at the committed implementation SHA.

## Planned checks — pending implementation

- **Pending:** Rendered production ingress and mounted discovery tests for both protected-resource URLs and authorization-server metadata; public HTTPS response/status/content-type/issuer proof.
- **Pending:** Mounted DCR, authorization and token cases for exact hosted and arbitrary-port loopback redirects; reject lookalikes, changed hosted path/query/port, credentials, fragments and redirect substitution.
- **Pending:** Read-only default, explicit `wbs:read wbs:write` request and grant, owned-project write, restricted foreign-created project refusal, viewer refusal, cross-organization 404, audited super-admin recovery and same-organization unrestricted project success, token expiry, actual refresh, replay and revocation tests.
- **Pending R5 proof:** Remove a discovery route; ingress test must fail on frontend fallback. Restore and record output.
- **Pending R5 proof:** Accept a host suffix or swap grant redirect; mounted negative must fail. Restore and add adjacent Proof: comments.
- **Pending R5 proof:** Bypass write-scope or revocation check; mounted write/revocation tests must fail. Restore and record output.
- **Pending:** Live public URL authentication and refresh trace with ordinary WBS account, grant-bound organization, recorded role and disposable project. The 3600-second default is documented; observed dev TTL and refresh remain unverified here.
- **Pending:** Format, lint, typecheck and host gate. No public connectivity or application behavior has been verified at spec time.

## Implementation evidence (WBS 010.4.8)

### 1. Public discovery routing

- The prod and staging Ingress overlays route the three discovery URLs to `wbs-mcp` as `Exact`
  paths; `/mcp`, `/api`, `/ws` and the SPA fallback are unchanged. Other `/.well-known/*` paths
  still reach the frontend.
- `env -u CLAUDECODE bun test tools/tool-deploy/src/k8s/mcp-manifest.test.ts`: 7 pass, 0 fail.
  Before the overlay change the discovery case failed on both hosts with `Expected: "wbs-mcp"`,
  `Received: "wbs-frontend"`.
- R5 proof: removing the `/.well-known/oauth-protected-resource/mcp` rule from the prod overlay
  failed `routes each discovery URL on prod to mcp-01` the same way; restored, 7 pass.
- Mounted handler: `serves every public discovery URL through the mounted handler with
consistent URLs` (http.test.ts) checks status, JSON content type and resource/issuer/token URL
  consistency for the production `MCP_PUBLIC_URL`.
- The h2puni Caddy edge already carries the same three narrow routes for dev
  (`tools/tool-remote-scripts/src/lib/site.ts`, covered by `site.test.ts`). The compose prod
  vhost runs no mcp-01, so it gains no routes; public prod MCP arrives with the k3s overlay.
- Live, read-only, 2026-09-27: `curl` of the three URLs on `https://dev.wbs.bulletpoints.club`
  returned 200 `application/json` with resource `https://dev.wbs.bulletpoints.club/mcp` and
  issuer `https://dev.wbs.bulletpoints.club/mcp/oauth`. On `https://wbs.bulletpoints.club` all
  three returned 200 `text/html` (the SPA), because prod still serves from the compose vhost.
  The k3s prod overlay is not deployed; public prod discovery stays unproven.

### 2. Bounded redirects

- `isRedirect` admits the five reviewed hosted callbacks (Claude twice, VS Code web, Perplexity
  twice) as exact strings and a literal loopback host (`localhost`, `127.0.0.1`, `[::1]`) over
  HTTP(S) at any port from 1 to 65535. A loopback query may not pre-set `code`, `state`, `iss` or
  `error*`. Every authorization response now carries the RFC 9207 `iss` and metadata advertises
  `authorization_response_iss_parameter_supported`, which is ChatGPT's first condition.
  ChatGPT's stable `https://chatgpt.com/connector_platform_oauth_redirect` is still refused: its
  second condition, a connection observed displaying that exact URI, is unmet, so it and any
  callback-ID URI enter only as a reviewed entry after that observation.
- `OAuth client redirects` (oauth.test.ts) covers each hosted entry, seven loopback shapes, 36
  near-misses, a loopback flow at its own port, another-port and substituted-redirect token
  refusals, exact per-client authorization and `iss` on success and `access_denied`.
  `bunx nx run wbs-mcp-01:test --skip-nx-cache`: 267 tests, all pass.
- R5 proof: a parsed `hostname.endsWith` hosted match failed nine near-miss cases with
  `Expected: 400`, `Received: 201`. Skipping the literal loopback pattern failed 127.1,
  LOCALHOST, ports 0 and 080 and `javascript://localhost`; dropping the response-field check
  failed the four planted-query cases. Removing the token `redirect_uri` comparison failed the
  substitution and loopback other-port tests with `Received: 200`. Both restored.
- Not proven: which callback a ChatGPT connection displays, and that Claude, VS Code and
  Perplexity accept the added `iss` parameter. Both need the live client acceptance run.

### 2b. Registration keeps the listed subset (mcp-registration-callbacks, 2026-09-27)

- Found by the import-guide lane: one unlisted URI refused a whole registration, so VS Code
  (lists `https://insiders.vscode.dev/redirect` first) could not sign in natively. Decided with
  Astra (gpt-6-astra, high): list Insiders exactly; register only the listed subset and return it
  (RFC 7591 §3.2.1), refusing when nothing is left; refuse malformed entries atomically; keep
  `cursor://` out (RFC 8252 §7.1 dotless private-use scheme, MCP requires HTTPS or loopback); keep
  a pre-set loopback `state` refused (Continue signs in with a URI other than the one it
  registers, so admitting it would not help).
- `isMalformedRedirect` refuses the list; `isListedRedirect` filters it. Authorization and token
  exchange still compare exact strings.
- New tests in `OAuth client redirects`: VS Code's four callbacks, a mixed list registering only
  `https://vscode.dev/redirect` with authorization refused (400, no `Location`) for the dropped
  `cursor://` and `https://evil.example/callback`, an all-unlisted list, 17 malformed entries
  (null, a number, relative, not a URI, 513 bytes, credentials, fragment, empty fragment, planted
  `code`/`%63ode`/`state`/doubled `state`/`iss`/`error`/`error_description`/`error_uri`, planted
  `code` on an unlisted host), and ten near-misses for Insiders and Cursor.
  `env -u CLAUDECODE bun test` in apps/wbs/mcp-01: 316 pass, 0 fail.
- R5 proofs, each observed failing then restored: no malformed check failed all 17 malformed
  cases (`Received: 201`); registering the list unfiltered failed the mixed-list test and 36
  near-misses; no fragment test failed both fragment cases; no response-field test failed 13
  planted-field cases; no empty-subset check failed the all-unlisted test and the near-misses;
  no Insiders entry failed the hosted and VS Code tests.
- Astra review (gpt-6-astra, high): no Critical. Important fixed: `new URL` repairs `%ZZ`,
  spaces and control characters, so such entries were dropped (or, on loopback, registered)
  instead of refusing the list; `URI_CHARACTERS` now checks RFC 3986 syntax first, with six new
  negatives. Dropping it failed all six. Minor fixed: the mixed-list scenario no longer cites
  VS Code's fully listed callbacks. 322 mcp-01 tests pass.
- Not proven: a live VS Code or VS Code Insiders sign-in. VS Code signs in on
  `http://127.0.0.1:33418/` or a hosted callback; on another loopback port exact matching
  refuses it.

### 3. Write scope

- mcp-01 forwards the caller's upstream IdP token, whose groups are the account's full grant, so
  be-01 alone could not tell a `wbs:read` MCP authorization from a write one. `createServer`
  now refuses every non-GET tool unless the verified MCP caller holds `write`, and every GET
  tool unless it holds `read`, before be-01 is called. A test pins that every non-GET tool of the real document is a be-01 `write-scope`
  operation.
- The refusal is a tool result naming `insufficient_scope` and the scope to request. It is not
  an HTTP 403 `WWW-Authenticate: Bearer error="insufficient_scope"` step-up challenge; that would
  need the HTTP layer to parse JSON-RPC bodies and is left open.
- Mounted (oauth.test.ts `MCP write scope through the mounted endpoint`): an omitted scope
  grants `wbs:read` and its write is refused with no be-01 call; a requested write that the
  account lacks is narrowed to `wbs:read` and refused; an explicit, granted `wbs:read wbs:write`
  writes as the signed-in user's upstream token.
- R5 proof: disabling the guard failed the two `the MCP grant scope` write refusals
  (server.test.ts) and the omitted-scope and narrowed-scope mounted refusals on
  `toContain('insufficient_scope')`; disabling the read half failed `refuses a read tool to a
caller without wbs:read`. Restored, `bun test` in apps/wbs/mcp-01: 275 pass, 0 fail.
- Not changed: standalone mode still accepts a verified upstream IdP bearer token at `/mcp`,
  whose own groups then decide write access, and gateway mode trusts decoded claims. Both are
  existing authentication contracts outside the MCP OAuth grant.

### 4. Refresh and revocation

- mcp-01 already rotated single-use refresh tokens, revoked a family on replay and refreshed
  the upstream token under a lease; WBS 080.19 reporting of failed tool-call refreshes and
  session ends is unchanged. Three gaps are closed:
  - A refresh judges the token before session capacity, so a replay at capacity still revokes
    the family instead of answering 429.
  - A refresh honours a requested `scope` subset (RFC 6749 §6) for that access token, keeps the
    family's grant for later refreshes, and refuses expansion with `invalid_scope` without
    consuming the refresh token.
  - Revocation throws on a session-store failure instead of answering 200 as if revoked. An
    unverifiable or unknown token still answers 200 (RFC 7009).
  - A refresh propagates a session-store failure instead of answering `invalid_grant`; only an
    undecryptable family (already revoked by the store) is refused. A non-text `scope` field is
    `invalid_request`, not an omitted scope.
- Mounted tests (oauth.test.ts `MCP write scope, refresh and revocation through the mounted
endpoint`): a write after access expiry and refresh reaches be-01 with the refreshed upstream
  token; replay ends the successor's access and refresh; replay at capacity does too; revocation
  ends access and refresh; narrowing and expansion as above; a token narrowed to `wbs:write`
  cannot export; a file-valued scope is refused; store failures reject during refresh and
  revocation.
- R5 proofs: the capacity-first order failed the capacity replay test with 429; ignoring the
  requested scope failed narrowing (`wbs:read wbs:write`) and expansion (200); the catch-all
  failed the store-failure test (resolved); skipping `revokeFamily` in the revocation endpoint
  failed the revocation test (write 200, not 401); a catch-all around `prepareRefresh` failed
  the refresh store-failure test; reading scope through `stringField` failed the file-scope
  test; an unguarded GET failed the narrowed-export test. All restored: 285 pass, 0 fail.
- The 3600-second `MCP_ACCESS_TOKEN_TTL` default is unchanged: no live refresh trace exists.

### Pending behind organization activation (WBS 010.5.2)

Same-organization member or admin success on another creator's unrestricted project, viewer
refusal (403), cross-organization 404, restricted-project noncreator refusal (403) and the
audited super-admin recovery override are be-01 project-authorization outcomes of a grant bound
to an organization. Organizations are inert until activation, and mcp-01 grants carry no
organization yet, so these stay unimplemented and untested here. mcp-01 forwards each caller's
own upstream identity, so be-01's rules will apply unchanged once they exist; the grant-bound
organization claim is the remaining mcp-01 piece.

### Not run

- Live public URL acceptance (task 4.1): DCR, sign-in, read, reversible write, expiry, refresh
  and revocation against a deployed URL. Only the read-only discovery `curl` above was run.
- The h2puni host gate; the orchestrator runs it on the integration branch.
