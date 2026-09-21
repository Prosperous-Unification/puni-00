## Access-token lifetime

`mcp-auth-failure-signout` task 0.1 proved that the live client registered
`["authorization_code","refresh_token"]`, but its close check did not prove that it
actually uses the refresh grant. `MCP_ACCESS_TOKEN_TTL` therefore defaults to 3600
seconds, the conservative branch in this change's design. A deployment may set a
shorter value after the live refresh trace is observed.

## Verification

- Focused h2puni checks passed before the terminal run: the 52-test OAuth/store
  selection, mcp-01 typecheck, repository formatting and source lint were green.
- Full h2puni gate passed at exact code head
  `18028f4d184066090aaa77cbab85b4bc080a7c43` on 2026-09-21. Dependency
  integrity found 87 root declarations with zero mismatches and separately
  bootstrapped all three nested manifests. The main tier completed 117 tasks
  across 35 projects, including the retried fleet test; `twilight-burokrat`
  then passed its test/typecheck/build tier and source lint. The Docker-backed
  solver smoke passed 3/3 process-boundary tests. The guarded tree remained
  clean at the pinned commit after the gate.
- CI: exact-head mandatory gate pending. The independent trusted-wiki workflow
  fails before checkout because all three immutable activation variables are
  absent; this is the established repository configuration issue, not a diff
  failure.
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
