## 0. Facts first, then Dany

- [x] 0.1 Client capabilities, read 2026-10-25 before design approval. Sources: Claude Code
      `headers`/`headersHelper`, the Agent SDK, the Messages API connector and claude.ai
      Request headers (the coordinator), and the MCP SDK 1.31.0 providers (the reviewer and
      `node_modules`). They are recorded in design.md "Context". Result: no Anthropic client
      runs `client_credentials` natively, and fixed headers are first-class, so M1 (ii)
      exists.
- [ ] 0.2 Dany confirms or amends M1 to M16. M1 (ii)'s audience reading, M3, M4's 24 h cap,
      M7 and M9 are the ones most likely to be overruled. Slices 1–4 wait for M1–M5 and
      M13–M14. Slice 6 waits for M7 and M16. Slice 7 waits for M9.
- [ ] 0.3 Precondition: #731 (retire operator credential links) is merged. M9's groups-less
      refusal depends on it.

## 1. be-01: the machine grant

- [ ] 1.1 Red: `machine-grant.test.ts` in `@wbs/core`.
  - A new `PresentedMachineProof` variant (`grant`) of `admitMachineCredential` judges
    revocation, binding, membership and pool `expiresAt` in one place.
  - The grant claims' `exp` is `min(requested, now + MOST_MACHINE_GRANT_SECONDS, assertion
exp)`.
  - Scopes come from the credential only.
  - A property: a revoked, unbound or expired-pool credential is never admitted, whatever the
    grant's `exp`.
- [ ] 1.2 Green: the `WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT/_PREVIOUS` keys, with `kid`, parsed
      at boot (refused when missing after activation). The route
      `POST /internal/mcp/machine-grants` (M14's secret) answers `409 not_activated` before
      activation. It identifies an assertion by `(iss, aud, sub)`, with `client_id` optional
      and matched when sent; optionally consumes the assertion's `jti` once; and writes one
      `machine_token_issued` audit row. Test: `machine-grant.controller.db.test.ts`. Negatives,
      each watched failing with a `Proof:` adjacent:
  - drop the `client_id` match, and the mismatched-id case admits;
  - drop the activation check, and the pre-activation case issues;
  - sign with the delegation key, and the "grant signed with the delegation key" scenario
    admits.
- [ ] 1.3 The grant verifier and exact audience dispatch in `identity.ts`. `directAudienceOf`
      answers `direct`, `via-mcp-01`, `machine-grant` or refuses. Admission needs the secret,
      compared constant-time. Tests: the spec scenarios "A grant without the secret",
      "Revocation at the next call", "No write per call" and "A long delegation stays refused".
      Negatives:
  - remove the secret check (the no-secret case admits);
  - remove the reread (the post-revoke case admits);
  - route unknown audiences to via-mcp-01, as today (the dispatch test reddens);
  - consume the jti per use (the no-write assertion reddens).
- [ ] 1.4 Parity through a test-only composition seam in `src/testing`. The test
      `production-entrypoint.test.ts` pins that `main.ts` cannot reach it. Grant and raw key
      give equal principals, L1 leasing, renewal and the same `claim_limit` refusal. Negative:
      omit `personId` from the grant principal and the lease assertion reddens.

## 2. mcp-01: the token endpoint

- [ ] 2.1 Red: the form parser in `machine-token.test.ts`:
  - Basic xor body;
  - `client_id` optional and matched;
  - exactly one canonical `resource` (`invalid_target`), compared against the value
    `oauth.ts` 270 derives;
  - a default scope;
  - `client_assertion_type` exact;
  - carriers that redact in `toString`/`toJSON`.
- [ ] 2.2 Green: `client_credentials` dispatch, token signing (`token_use machine`, `exp` 60 s
      before the grant, with 0–10% jitter applied to the requested TTL),
      `MCP_MACHINE_TOKEN_TTL` (default 12 h, 60 s–24 h at boot), and the metadata (the grant,
      `none` kept, the three methods, the signing algorithms). A 401 `invalid_client` carries
      `WWW-Authenticate: Basic`, and a failed machine verification never reaches
      `verifyUpstream`. DCR refuses `client_credentials`, which is new behaviour. Tests: the
      SDK's `ClientCredentialsProvider` and `StaticPrivateKeyJwtProvider` against the booted
      fixture, the indistinguishability case and the DCR refusal. Negatives:
  - answer `invalid_grant` for a revoked credential (the indistinguishability test reddens);
  - let DCR accept the grant;
  - fall through to upstream (the zero-calls spy reddens).
- [ ] 2.3 Secrets: inject a throw in be-01's route. The test asserts that the report, route
      evidence and audit row hold no raw key, no `base64(id:key)` and no assertion, by exact
      substring and by the `plaintext-secrets` pattern. Negative: put the form in the report
      and the test reddens.

## 3. mcp-01: `/mcp` admission

- [ ] 3.1 M13: after activation, remove the upstream fallback from `verify` and
      `callerSessionFor`, and have `bearerFor(null, …)` throw. Test: an Auth0 be-01-audience
      token on `/mcp` gets 401 and be-01's fake sees nothing. Negative: restore the fallback
      and the test reddens. Pre-activation forwarding keeps its existing tests.
- [ ] 3.2 Machine tokens: `verifyLocal` dispatches on `token_use`, with no `familyForSession`
      and no `credentialEpoch`. `bearerFor` returns the grant, sent with
      `MCP_BE_INTERNAL_SECRET`. A grant refusal becomes HTTP `401 invalid_token`. Tests: the
      second-replica scenario with store spies, the "Re-fetch at expiry" scenario through the
      SDK provider, and `/refresh` (`invalid_grant`) and `/revoke`
      (`unsupported_token_type`). Negatives:
  - forward the access token instead of the grant (be-01 answers 401 and the batch reddens);
  - read the epoch for machine tokens (the spy reddens).
- [ ] 3.3 Raw keys (M1 ii): a `wbs_mk_` bearer asks be-01 for a grant, with a per-replica cache
      of at most 60 s keyed by SHA-256. Tests: the "fixed-header client works" scenario, and
      the revoked-key-with-warm-cache scenario. Negatives:
  - send the key to `/api` (the "never the key" assertion reddens);
  - extend the cache beyond the grant reread (the revoke scenario still passes, proving the
    reread, not the cache, enforces revocation).
- [ ] 3.4 Path traversal (M14): refuse `.` and `..` path values. Test: the dot-dot scenario.
      Negative: drop the check, and be-01's fake receives `/api/claims`.
- [ ] 3.5 Gateway mode (M11): test both the raw key and the machine JWT. Negative: decode
      first, and the forwarded-nothing assertion reddens.
- [ ] 3.6 Hosted connector check on dev: a claude.ai custom connector completes OAuth consent
      with `none` unchanged, and another uses Request headers with a raw key. Record both in
      verify.md.

## 4. Limits and the source address

- [ ] 4.1 A pure token bucket and in-flight counter with fake-clock properties. A bucket never
      admits more than burst + rate × elapsed. The in-flight count returns to zero after every
      settled call.
- [ ] 4.2 `sourceOf` uses `MCP_TRUSTED_PROXY_HOPS` from the right. Wire M10's six limits:
      failures per `(client_id, address)` and per address, successes per credential and per
      address, `tools/call` per credential, and in-flight per organization. Every refusal is
      HTTP `429` with `Retry-After`. Tests: the spoofed-header, lockout, batch-per-call and
      pool-of-100 scenarios. Negatives:
  - leftmost XFF (the spoof test reddens);
  - count successes and failures in one bucket (the lockout test reddens);
  - count HTTP requests (the batch test reddens).
- [ ] 4.3 Load evidence on h2puni under the heavy lock: 100 machine tokens at 2 calls/s for 5
      minutes, beside the same load on consent sessions. Record p50/p99, be-01 writes per
      second and write-coordinator wait.

## 5. Human-only tools by policy

- [ ] 5.1 Add the `humanOnly` policy and tag the routes, shrink `EXCLUDED_PATHS`, and make the
      capacity report a tool. Negatives: untag one route and its absence assertion reddens;
      leave a tagged shape with no operation and startup throws.
- [ ] 5.2 One tool list for a consented human, a consented agent, a machine token and a raw
      key.

## 6. Agent pools and account-keyed state

- [ ] 6.0 Grep every check keyed by `userId` or account in `@wbs/core` and `store-sqlite`, and
      add each one missing from M16's list to design.md with its decision before 6.1.
- [ ] 6.1 Migrations:
  - `add_agent_pool` and `machine_credential.agent_pool_id`;
  - `command_journal.person_id`, nullable, so the outgoing colour writes null;
  - the audit actions `agent_pool_created`, `agent_pool_revoked`, `agent_pool_rekeyed` and
    `machine_token_issued`, by compatible rebuild;
  - guarded `down.sql` files.
    Negatives: drop each guard and rollback deletes data.
- [ ] 6.2 The pool routes: create (through `addPerson`'s cap check), re-key, revoke. They are
      admin only, `humanOnly`, one transaction each. Pool `expiresAt` is judged in
      `admitMachineCredential`. Tests: every agent-pools scenario. Negatives:
  - a cap check outside the transaction (`fc.asyncModelRun` finds the crossing pair);
  - let a member create;
  - skip one credential in revoke (the lease release reddens);
  - re-key creating persons (the unchanged-count assertion reddens).
- [ ] 6.3 Undo per person (M16). Test: the two-pool-agents scenario. Negative: pop by
      `(project, user)` and A undoes B's edit.
- [ ] 6.4 M15's invariant test, "two processes on one credential", plus docs.
- [ ] 6.5 fe-01 pool panel on `@ui/core-01`/`@ui/saas-01`:
  - keys appear once as one download, with the Dash import command beside it;
  - re-key and revoke each list the counts they will end before confirming;
  - loading, empty, failure and cap refusal are rendered states;
  - reviewed by eye.
- [ ] 6.6 `twilight-dash pool import <file>` puts the keys into the secret store and verifies
      each by issuing one token. Test: a key that fails to issue aborts the import and stores
      nothing.

## 7. REST stops being an agent surface (gated: claire fleets on MCP, observed on dev)

- [ ] 7.0 Migrate the suites that use raw keys on `/api` to the test-only seam or to MCP:
      `swarm-end-to-end.db.test.ts`, `machine-credential.controller.db.test.ts`, the
      compute-provider controller tests, and `dev/activated-organization-server.ts` with its
      `local-dev.md` section.
- [ ] 7.1 and 7.2 ship in one PR:
  - M9's refusal before any read, for keys, trusted-issuer tokens and groups-less tokens, with
    no environment switch;
  - Dash's `report-capacity.ts` as an MCP client.
    Negatives: move the refusal after the credential read (the "no row read" assertion
    reddens); the old Dash HTTP path test now observes `machine_bearer_not_accepted`.
- [ ] 7.3 Docs (M12): reverse PR #738's sections, publish the WBS federated assertion profile,
      add the headless section with the dated client facts, and update mcp-01's README.
      Burokrat `check-indexes` exits 0.

## 8. Roll-out

- [ ] 8.1 Dev, with the claire fleet straight from operator links to MCP and no HTTP-with-keys
      step: a pool of 3, with Claude Code using one `headersHelper` and two static raw keys.
      Each agent claims, heartbeats and releases. Re-key mid-run, then revoke, and observe the
      leases end. Record this in verify.md. This observation gates slice 7.
- [ ] 8.2 Prod runbook: HTTP fleets and Auth0 bearers on `/mcp` stop at the swap (M9, M13). The
      new keys `WBS_MACHINE_GRANT_SIGNING_KEY_*` and `MCP_BE_INTERNAL_SECRET` are seeded
      before merge.
