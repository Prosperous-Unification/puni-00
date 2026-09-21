## Access-token lifetime

`mcp-auth-failure-signout` task 0.1 proved that the live client registered
`["authorization_code","refresh_token"]`, but its close check did not prove that it
actually uses the refresh grant. `MCP_ACCESS_TOKEN_TTL` therefore defaults to 3600
seconds, the conservative branch in this change's design. A deployment may set a
shorter value after the live refresh trace is observed.

## Verification

- Focused h2puni gate: pending final exact-head run.
- Full h2puni gate: pending.
- CI: pending.
- Dev acceptance across a redeploy: pending.

## Proof negatives

- `session-store.test.ts`: raw access, provider-refresh, and MCP-refresh tokens
  are absent from both the main SQLite file and its WAL; changing storage to raw
  values makes those byte checks fail.
- `session-store.test.ts`: changing the lease CAS to an unconditional update
  lets both database connections call the provider instead of exactly one.
- `session-store.test.ts`: skipping consumed-token family revocation leaves old
  and successor sessions live after replay.
- `session-store.test.ts`: skipping the ciphertext version and GCM tag checks
  returns modified provider credentials instead of revoking the family.
- `oauth.test.ts`: removing stable current/previous signing-key selection makes
  a second handler or a rotation handler reject the first handler's access token.
- `oauth.test.ts`: accepting a consumed refresh token leaves its successor
  access token valid; removing the versioned upstream lease makes two concurrent
  callers invoke the provider twice.
- `server.test.ts`: removing the one be-01 401 retry leaves the first refusal
  as tool-error content; retrying with the stale credential records the stale
  Authorization header twice.
- `http.test.ts`: omitting `refresh_token` from authorization-server
  metadata leaves the exact metadata assertion red.
- `mcp-preflight.test.ts`: omitting a persistence variable refuses the dev
  deployment before sync.
