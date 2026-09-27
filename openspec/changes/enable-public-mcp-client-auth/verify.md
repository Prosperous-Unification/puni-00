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

- `isRedirect` admits the six reviewed hosted callbacks as exact strings and a literal loopback
  host (`localhost`, `127.0.0.1`, `[::1]`) over HTTP(S) at any port from 1 to 65535. A loopback
  query may not pre-set `code`, `state`, `iss` or `error*`. ChatGPT's stable
  `https://chatgpt.com/connector_platform_oauth_redirect` is admitted because every
  authorization response now carries the RFC 9207 `iss` and metadata advertises
  `authorization_response_iss_parameter_supported`. Callback-ID URIs stay out.
- `OAuth client redirects` (oauth.test.ts) covers each hosted entry, seven loopback shapes, 35
  near-misses, a loopback flow at its own port, another-port and substituted-redirect token
  refusals, exact per-client authorization and `iss` on success and `access_denied`.
  `bunx nx run wbs-mcp-01:test --skip-nx-cache`: 267 tests, all pass.
- R5 proof: a parsed `hostname.endsWith` hosted match failed nine near-miss cases with
  `Expected: 400`, `Received: 201`. Removing the token `redirect_uri` comparison failed the
  substitution and loopback other-port tests with `Received: 200`. Both restored.
- Not proven: that ChatGPT's connection displays the stable URI, and that Claude, VS Code and
  Perplexity accept the added `iss` parameter. Both need the live client acceptance run.
