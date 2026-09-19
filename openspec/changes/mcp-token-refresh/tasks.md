## 0. Before implementation

- [ ] 0.1 Requires `mcp-auth-failure-signout` task 0.1's result; set the `MCP_ACCESS_TOKEN_TTL` default from it and record why in `verify.md`.
- [ ] 0.2 Design interview; `CONTEXT.md`: **Refresh family**, **Upstream refresh lease**. ADR for the mcp-01-owned store.

## 1. Keys and store

- [ ] 1.1 Keys from config (current + previous). Tests: two handlers on one key verify each other's tokens; rotation scenario; missing, malformed and unreadable key each fail startup with the variable named, each with a `Proof:`.
- [ ] 1.2 `session-store.ts`: schema from `design.md`, `migration.sql` + `down.sql`, digest-only tokens, versioned AES-GCM with AAD. Tests: raw tokens absent from the main file **and** `-wal`; tamper and unknown-version revoke the family; unreadable/corrupt file fails startup. Negative per check with `Proof:`.
- [ ] 1.3 Sessions behind the store; restart scenario through the real HTTP handler.

## 2. Refresh grant

- [ ] 2.1 Token response and metadata/registration advertise `refresh_token`.
- [ ] 2.2 Consume + successor in one transaction; client binding; idle and absolute expiry. One test per spec scenario.
- [ ] 2.3 Reuse revokes the family atomically. Negative: skip revocation; "every token refused" must fail.

## 3. Upstream refresh

- [ ] 3.1 Keep provider refresh token and expiry (from `expiresIn`, else verified `exp`) at callback; tests for missing refresh token, missing `expiresIn`, rotation without a new token.
- [ ] 3.2 CAS lease + refresh before be-01 calls and on MCP refresh; retry one be-01 401 after success; refusal → `revokeFamily` → signout path. Two-connection test asserts exactly one provider call. Negative: drop the CAS; the count assertion must fail.

## 4. Deploy and close

- [ ] 4.1 Dev only: store under the dev data directory that survives a sync; keys in the dev env via `bun run dev:setup`/sops; runbook note for rotation.
- [ ] 4.2 Gate with `bin/h2puni-gate.sh <sha>`; `verify.md` with every `Proof:`.
- [ ] 4.3 Dev acceptance from server logs, across one dev redeploy: if 0.1 found the client refreshes, it calls `/token` with `grant_type=refresh_token` across more than one access-token lifetime and never `/authorize`; otherwise it makes no `/authorize` call within the configured lifetime, and tool calls keep working while mcp-01 refreshes the provider token itself.
