## 1. Durable key and store (red first)

- [ ] 1.1 Test: two `InMemoryMcpOAuth` instances built from the same `MCP_SIGNING_KEY` both verify one token. Fails today (ephemeral key). Then load the key from config; startup test for missing and malformed key (R5), each with a `Proof:`.
- [ ] 1.2 `session-store.ts` over bun:sqlite with the three tables from `design.md`, `migration.sql` + `down.sql`, digest-only token columns, AES-GCM provider tokens. Test that no raw token or provider token appears in the database file bytes. Negative: store raw; the byte scan must fail.
- [ ] 1.3 Move `sessions` behind the store. Restart test: issue, rebuild the handler on the same file and key, then call. Fails before the move.

## 2. Refresh grant

- [ ] 2.1 Token endpoint returns `refresh_token`; metadata/registration advertise the grant. Tests through the real HTTP handler.
- [ ] 2.2 `grant_type=refresh_token`: consume + successor in one transaction; client binding; expiry (idle and absolute). One test per scenario in the spec.
- [ ] 2.3 Reuse detection with the 10 s race allowance. Tests: replay after 11 s revokes the family (all tokens refused); replay at 5 s returns the same successor. Negative: remove family revocation; the "all tokens refused" assertion must fail.

## 3. Upstream refresh

- [ ] 3.1 Keep `tokens.refreshToken` from `callback` in the family (encrypted).
- [ ] 3.2 On MCP refresh within 120 s of provider expiry, call `BrowserOidcClient.refresh` (stubbed), persist rotation. Refusal ends the family through `mcp-auth-failure-signout`'s `endSession` path and answers `invalid_grant`.

## 4. Deploy and close

- [ ] 4.1 Dev is the only live MCP (read 2026-09-19: `https://dev.wbs.bulletpoints.club/mcp`, served by `nx run-many -t serve … wbs-mcp-01` inside the `wbs-dev-src` container, restarted by every dev deploy; prod `/mcp` answers 405). Put the store file under the dev data directory that survives a dev sync, and `MCP_SIGNING_KEY`/`MCP_STORE_KEY` in the dev env written by `bun run dev:setup`/sops. Prod and the k3s lab descriptor (`deploy/k8s/wbs/lab/mcp-01.Dockerfile`) get the same variables only when mcp-01 ships there; add a runbook note for key rotation.
- [ ] 4.2 ADR `docs/adr/`: mcp-01 owns its SQLite store (alternatives from design.md). `CONTEXT.md`: **Refresh family**.
- [ ] 4.3 Gate with `bin/h2puni-gate.sh <sha>`; `verify.md` with every `Proof:`.
- [ ] 4.4 Dev acceptance with Claude's connector: stay connected more than 1 hour and across one mcp-01 redeploy without a browser prompt.
