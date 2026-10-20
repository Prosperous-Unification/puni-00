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
- **Dev acceptance across a redeploy: confirmed 2026-10-20** from the dev route
  log on h2puni (`docker logs wbs-dev-src | grep mcp_oauth_route`) and the live
  store at `/data/mcp-session.sqlite`. The live client is Dany's own connector
  (`subject auth0|6a8c4e36ea132ea38ab2004c`, scope `wbs:read wbs:write
wbs:editor`); `MCP_ACCESS_TOKEN_TTL` is 3600 in the dev env.
  - **13 `POST /mcp/oauth/token` calls in 24h, every one `grant_type=refresh_token`,
    every one `status 200`. Zero `/mcp/oauth/authorize` calls in the same window**
    — the only `/mcp/oauth/*` path that appears at all is `/token`. This is the
    branch task 0.1 left open: the client does use the refresh grant.
  - Seven of those refreshes fall in one unbroken family chain
    (`-E1mA28Z7E2Q1-5JxCB96NmFb-3aGg1_quWJf6HFQOY`, created 2026-10-19 21:14Z) at
    22:15Z, 23:17Z, 00:17Z, 01:27Z, 02:27Z, 04:23Z and 07:09Z — roughly hourly,
    so **more than one access-token lifetime**, about nine hours of continuous
    use with no interactive authorization. Family `revoked_at` stayed null
    throughout, and single-use rotation held: the session `jti` moved from
    `V5yDmqQ4…` (observed live 21:15Z) to `_ZphX3tW…` inside the same family.
  - **The redeploy crossing is proved twice.** The source-run mcp-01 process
    restarted at 2026-10-19 21:46Z (`ps -eo lstart` inside `wbs-dev-src`), after
    the family was created at 21:14Z, and every refresh above is later than that
    restart — under the old in-process `Map` the family would have been gone.
    The deployed source head then moved to `3867953df` at 2026-10-20 01:27Z and a
    refresh succeeded 32 seconds later, followed by three more.
  - Not claimed here: no provider-side (`upstream`) refresh failure was exercised
    in this window, and the 401-retry path is covered only by `server.test.ts`.
    `upstream_refreshed_at` tracked each MCP refresh (last 07:09Z), so mcp-01 was
    keeping the provider token alive itself as designed.

## Access-token lifetime, revisited

The conservative 3600-second default above was chosen because task 0.1 could not
prove the client used the refresh grant. The trace now proves it does, so the
shorter five-minute branch is available to a deployment that wants it. Changing it
is a deployment decision and no code change; this packet does not make it.

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
