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
- **Pending:** Read-only default, explicit `wbs:read wbs:write` request and grant, owned-project write, foreign-project refusal, token expiry, actual refresh, replay and revocation tests.
- **Pending R5 proof:** Remove a discovery route; ingress test must fail on frontend fallback. Restore and record output.
- **Pending R5 proof:** Accept a host suffix or swap grant redirect; mounted negative must fail. Restore and add adjacent Proof: comments.
- **Pending R5 proof:** Bypass write-scope or revocation check; mounted write/revocation tests must fail. Restore and record output.
- **Pending:** Live public URL authentication and refresh trace with ordinary WBS account and disposable project. The 3600-second default is documented; observed dev TTL and refresh remain unverified here.
- **Pending:** Format, lint, typecheck and host gate. No public connectivity or application behavior has been verified at spec time.
