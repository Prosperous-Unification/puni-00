## Context

Current state (read 2026-09-19 at `origin/main` 1eeacb0b): `InMemoryMcpOAuth`
holds `clients`, `grants`, `sessions` in process maps; `sessions` maps `jti` to
`{expiresAt, upstreamAccessToken}`; the RS256 key is generated per process
(`kid: mcp-01-ephemeral`). `upstreamTokenFor` returns the stored upstream access
token, so an MCP session is only as long-lived as that provider token, and the
provider's refresh token (`tokens.refreshToken`, present because the shared
client asks for `offline_access`) is dropped in `callback`.

## Decisions

1. **Store: mcp-01-owned SQLite (bun:sqlite) on its own volume.** Tables
   `mcp_session(jti, family_id, expires_at)`,
   `mcp_refresh(token_digest, family_id, client_id, scope, subject, consumed_at, expires_at)`,
   `mcp_family(family_id, upstream_refresh_ct, upstream_access_ct, upstream_expires_at, idle_expires_at, absolute_expires_at, revoked_at)`.
   Tokens are stored as SHA-256 digests only; provider tokens as AES-256-GCM
   ciphertext under `MCP_STORE_KEY`. *Alternatives:* key-only persistence (tokens
   survive a restart, refresh families do not, so rejected); storing in be-01
   (couples two services' deploys and gives mcp-01 write access to the product
   DB, so rejected).
2. **Signing key from secrets.** `MCP_SIGNING_KEY` (PKCS#8 PEM) with `kid`
   derived from its thumbprint; JWKS publishes current plus previous during
   rotation. Missing or malformed key fails startup (R5).
3. **Rotation.** Each refresh consumes the presented token and issues a
   successor in one SQLite transaction. Presenting a consumed token revokes the
   family (all sessions and refresh tokens). *Race allowance:* a second
   presentation of the same token within 10 s of its consumption, from the same
   `client_id`, returns the already-issued successor instead of revoking, so
   one client retry never logs a user out. Falsifier: a security review ruling
   the window unacceptable, in which case it drops to 0.
4. **Upstream refresh.** On MCP refresh, when the upstream access token expires
   within 120 s, call `BrowserOidcClient.refresh`; persist a rotated provider
   refresh token when one is returned. Provider refusal ends the family and
   answers `invalid_grant`, which is the `mcp-auth-failure-signout` path.
5. **Lifetimes.** Access token 5 min (unchanged); refresh idle 14 days, absolute
   30 days, never beyond the provider's own refresh-token expiry when the
   provider reports one. Assumption; falsified by Dany asking for shorter.

## Risks

A leaked `MCP_STORE_KEY` plus the volume exposes provider refresh tokens: same
blast radius as be-01's stored refresh tokens, and kept in the same secret
store. Clock skew between blue and green: both read one SQLite clock source
(`now` injected), tested with skewed fakes.
