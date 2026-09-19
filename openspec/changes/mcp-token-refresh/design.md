## Context

Read 2026-09-19 at `origin/main` 1eeacb0b: `InMemoryMcpOAuth` holds clients,
grants and sessions in maps; RS256 key per process (`kid: mcp-01-ephemeral`);
`sessions[jti] = {expiresAt, upstreamAccessToken}`. The shared client's
`BrowserOidcTokenSet.refreshToken` is optional: `offline_access` does not
guarantee one. MCP runs only on dev, one process, restarted by every dev sync.

## Decisions

1. **Store.** bun:sqlite file owned by mcp-01, migrated by mcp-01 at startup.
   `mcp_family(family_id, client_id, subject, scope, upstream_access_ct,
   upstream_refresh_ct, upstream_expires_at, idle_expires_at,
   absolute_expires_at, revoked_at, lease_owner, lease_until, version)`,
   `mcp_session(jti, family_id, expires_at)`,
   `mcp_refresh(token_digest, family_id, consumed_at, expires_at)`.
   Our tokens are stored as SHA-256 digests only. *Rejected:* persisted key
   without a store (families lost on restart); sessions in be-01 (couples
   deploys, gives mcp-01 write access to the product database).
2. **Keys.** `MCP_SIGNING_KEY_CURRENT` (+ optional `_PREVIOUS`), mirroring
   be-01's `JWT_SIGNING_KEY_CURRENT`; `kid` = JWK thumbprint; JWKS lists both;
   verification accepts both. `MCP_STORE_KEY_CURRENT` (+ optional `_PREVIOUS`).
3. **Encryption.** Blob = `version(1) ‖ nonce(12, random) ‖ AES-256-GCM(ct ‖ tag)`,
   AAD = `family_id ‖ column name`. Unknown version or failed tag → family
   revoked, logged, `invalid_grant`. Writes always use CURRENT.
4. **Rotation.** Consume and issue the successor in one transaction. Any
   presentation of a consumed token revokes the family (`revokeFamily`: sets
   `revoked_at`, deletes its sessions, in one transaction). No grace window.
5. **Upstream refresh.** Trigger: provider access expires within 120 s (expiry
   from `expiresIn`, else the verified token's `exp`; neither present is an R5
   error at login). Take the lease by CAS on `(lease_until < now, version)`;
   the loser waits up to 5 s then re-reads the winner's result. Persist a
   rotated provider refresh token when returned. No provider refresh token →
   the family's absolute expiry is capped at the provider access expiry, and
   the client re-authorizes then. Refusal → `revokeFamily` → signout path.
6. **Access-token lifetime.** `MCP_ACCESS_TOKEN_TTL`; default set from signout
   task 0.1 (5 min if the client refreshes, else 1 h). Every request checks
   the session row, so a long token is still revocable.
7. **Lifetimes.** Refresh idle 14 days, absolute 30 days, capped as in 5.
