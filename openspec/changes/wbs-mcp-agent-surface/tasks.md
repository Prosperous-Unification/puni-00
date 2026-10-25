## 0. Facts first, then Dany

- [x] 0.1 Client capabilities, read 2026-10-25 before design approval and corrected after the
      second review. Sources: Claude Code `headers` and `headersHelper` (which also runs in
      `-p`/SDK sessions, subject to folder trust), the Agent SDK, the Messages API connector
      and claude.ai Request headers; the coordinator also read the MCP SDK 1.31.0 providers.
      Result: every Anthropic client except claude.ai can fetch a token, so the token grants
      cover them and the raw key (M1 (ii)) serves only claude.ai.
- [ ] 0.2 Dany confirms or amends M1 to M16, with these explicit decisions:
  - (a) **M1 (ii)**: no raw key at all (recommended), or a raw key for individual claude.ai
    Pro/Max only, shipped after slice 7. Team and Enterprise connectors are consent-only
    either way, because their Request header is a credential every member shares.
  - (b) M2's JWT-bearer grant for OIDC, and the audience rule that amends A25.
  - (c) M4's 24 h cap.
  - (d) M7's pools.
  - (e) M9's cut.

  Slices 1–4 wait for M1–M5 and M13–M15. Slice 6 waits for M7. Slice 7 waits for M9.

- [ ] 0.3 Preconditions:
  - #731 (retire operator links) is merged;
  - the separate undo-per-person bug-fix PR (M16) is merged before slice 6;
  - `wbs-machine-credentials` is archived before this change, because the trusted-issuer
    requirement here is a MODIFIED delta of its spec.

## 1. be-01: the machine grant

- [ ] 1.1 Red: `machine-grant.test.ts` in `@wbs/core`. A `PresentedMachineProof` variant
      (`grant`) of `admitMachineCredential` judges revocation, binding, membership and pool
      `expiresAt` in one place. The test covers:
  - `exp` = `min(requested, now + MOST_MACHINE_GRANT_SECONDS, assertion exp)`;
  - scopes from the credential only, and the run carried through;
  - a property that a revoked, unbound or expired-pool credential is never admitted.
- [ ] 1.2 Green: the grant keys (`kid`, current and previous). Boot refuses a missing key once
      the activation marker is set, and the activation preflight lists a missing key. The
      route `POST /internal/mcp/machine-grants` (M14's secret):
  - answers `409 not_activated` before activation;
  - verifies API keys, and assertions by `(iss, aud, sub)`;
  - consumes an assertion's `jti` when present;
  - writes one `machine_token_issued` row.

  Test: `machine-grant.controller.db.test.ts`. Negatives, each watched failing with a `Proof:`
  adjacent:
  - drop the activation check, and the pre-activation case issues;
  - have the grant verifier also accept the delegation key, and the "grant signed with the
    delegation key" scenario admits;
  - skip the `jti` consume, and the replay scenario admits.

- [ ] 1.3 The grant verifier and exact audience dispatch in `identity.ts`, with constant-time
      secret admission. Tests: "A grant without the secret", "Revocation at the next call",
      "No write per call" and "A long delegation stays refused". Negatives:
  - remove the secret check;
  - remove the reread;
  - route unknown audiences to via-mcp-01;
  - consume per use.
- [ ] 1.4 Parity through a test-only composition seam in `src/testing`, which
      `production-entrypoint.test.ts` keeps unreachable from `main.ts`. Negative: omit
      `personId` from the grant principal, and the lease assertion reddens.
- [ ] 1.5 The A25 audience rule (machine-credentials MODIFIED delta):
  - add `WBS_MCP_RESOURCE_URL`, boot-checked to be canonical HTTPS;
  - registration accepts only an audience equal to it or under it with a `/`, and the same
    for credential narrowing;
  - a non-conforming row is refused at use;
  - `trusted-issuer-audience-check-cli.ts` runs as a dry run by default, and the deploy
    preflight wires it in.

  Tests: the look-alike and preflight scenarios. Negative: use a bare `startsWith`, and
  `…/mcp.evil.example` is admitted.

## 2. mcp-01: the token endpoint

- [ ] 2.1 Red: the form parser.
  - `client_credentials`: Basic or body, never both, and never with a `client_assertion`;
    `client_id` optional and matched.
  - JWT-bearer: `assertion` required, no client authentication needed.
  - Exactly one canonical `resource` (`invalid_target`) against `oauth.ts` 270.
  - Default scope; optional `wbs_run`, 1 to 128 characters.
  - Carriers that redact in `toString`/`toJSON`.
- [ ] 2.2 Green: both grants, token signing (`token_use machine`, `exp` 60 s before the grant,
      0–10% jitter on the requested TTL), `MCP_MACHINE_TOKEN_TTL` (12 h default, 60 s to 24 h
      at boot), and the metadata (both grants, `none`, the two secret methods, no
      `private_key_jwt`).
  - `invalid_client` carries `WWW-Authenticate: Basic`; assertion failures are
    `invalid_grant`.
  - A failed machine verification never reaches `verifyUpstream`.
  - Dynamic client registration refuses both grants (new behaviour).
  - Rate-limit refusals are `429 invalid_request` with `Retry-After`.

  Tests: `ClientCredentialsProvider` and `WorkloadJwtBearerProvider` against the booted
  fixture, including the run-outlives-its-workload-token scenario. Negatives:
  - answer `invalid_grant` for a revoked API key, and the indistinguishability test reddens;
  - let dynamic registration accept a machine grant;
  - fall through to upstream, and the zero-calls spy reddens;
  - make the provider cache its first assertion, and the re-fetch scenario reddens.

- [ ] 2.3 Secrets: inject a throw in be-01's route during a Basic request. The test asserts
      that the report, route evidence and audit row hold no key, no `base64(id:key)` and no
      assertion, by exact substring and by the `plaintext-secrets` pattern. Negative: put the
      form in the report.

## 3. mcp-01: `/mcp` admission

- [ ] 3.1 M13: after activation, remove the upstream fallback and make `bearerFor(null, …)`
      throw. Tests: "An Auth0 token on /mcp" and "Markers disagree" in the shared activation
      fixture. Negative: restore the fallback, and the first test reddens.
- [ ] 3.2 Machine tokens: dispatch on `token_use` with no `familyForSession` and no
      `credentialEpoch`. The grant is sent with `MCP_BE_INTERNAL_SECRET`, and a grant refusal
      becomes HTTP `401 invalid_token`. Tests: the second-replica scenario with store spies,
      re-fetch at expiry, and `/refresh` and `/revoke`. Negatives:
  - forward the access token instead of the grant;
  - read the epoch for machine tokens.
- [ ] 3.3 Only if Dany chooses M1 (ii), and only after slice 7: raw keys at `/mcp` with
      60-second grants and a per-replica cache. Their failures count in M10's buckets, and
      they write no `machine_token_issued` rows. Negative: **inject "mcp-01 answers from the
      cache without calling be-01 on the tool call"**, and watch the revoked-key scenario
      redden.
- [ ] 3.4 Paths (M14): refuse empty, `.` and `..` values, and assert that the sent pathname
      equals the expanded template. Tests: the dot-dot and empty scenarios. Negatives: drop
      the value check, and be-01's fake receives `/api/claims`; drop the pathname assertion
      while injecting an encoded traversal, and the fake receives the wrong route.
- [ ] 3.5 Gateway mode (M11): detect `wbs_mk_` by prefix before any JWT parse, and never
      forward. Negative: delete the prefix branch, and the gateway decode path forwards the key
      to be-01's fake. The forwarded-request assertion observes the key, so the test does not
      depend on the code under test.
- [ ] 3.6 Hosted connector check on dev: a claude.ai custom connector completes OAuth consent
      with `none` unchanged. Record it in verify.md.
- [ ] 3.7 Secret cutover (M14): release N's be-01 accepts both secrets on `/internal/mcp/*`,
      and the swap runbook orders be-01 before mcp-01. Test: each secret is admitted on
      `/internal/mcp/delegation`, and grant admission refuses `x-internal-auth`. Release N+1
      removes the old secret there (a follow-up task).

## 4. Limits and the source address

- [ ] 4.1 A pure token bucket and in-flight counter with fake-clock properties.
- [ ] 4.2 `sourceOf` uses `MCP_TRUSTED_PROXY_HOPS`. M10's six limits, with in-flight at 128 per
      replica. Tests: the spoofed-header, lockout, batch-per-call and pool-of-100 scenarios.
      Negatives:
  - leftmost XFF;
  - one bucket for successes and failures;
  - counting HTTP requests.
- [ ] 4.3 Load evidence on h2puni under the heavy lock: 100 tokens at 2 calls/s for 5 minutes,
      beside consent sessions. Record p50/p99, be-01 writes per second, coordinator wait, and
      peak in-flight per organization against 128.

## 5. Human-only tools by policy

- [ ] 5.1 The `humanOnly` policy, `EXCLUDED_PATHS` shrunk, the capacity report as a tool.
      Negatives: untag a route; leave a tagged shape with no operation.
- [ ] 5.2 One tool list for a consented human, a consented agent and a machine token.

## 6. Runs, pools and account-keyed state

- [ ] 6.0 Grep every check keyed by `userId` or account, and add any that M16's table is
      missing.
- [ ] 6.1 Run-scoped leases (M15): the grant's run becomes the claim's `runId`, with
      `run_mismatch`. `renewLeases(personId, runId)` serves grant principals. API-key and
      consent principals are unchanged. Tests: the three run scenarios. Negatives:
  - renew by person only, and "two processes" reddens;
  - accept a command's `runId` over the grant's, and "forged run id" reddens.
- [ ] 6.2 Migrations: `add_agent_pool` and `machine_credential.agent_pool_id`, plus the audit
      actions `agent_pool_created`, `agent_pool_revoked`, `agent_pool_rekeyed` and
      `machine_token_issued`, by compatible rebuild, with guarded `down.sql` files. Negative:
      drop each guard, and rollback deletes data.
- [ ] 6.3 Pool routes: create (through `addPerson`'s cap check), re-key, and revoke with
      `removePersons`. They are admin only, `humanOnly`, one transaction each. Tests: every
      agent-pools scenario. Negatives:
  - put the cap check outside the transaction (`fc.asyncModelRun`);
  - let a member create;
  - skip one credential in revoke;
  - re-key creating persons;
  - `removePersons` leaving the count unchanged.
- [ ] 6.4 The fe-01 pool panel:
  - the keys appear once, as one download, with the Dash import command;
  - re-key and revoke list what they end before confirming;
  - every state renders;
  - reviewed by eye.
- [ ] 6.5 `twilight-dash pool import <file>` with a distinct `wbs_run` per agent process.
      Test: a key that fails to issue aborts the import and stores nothing.

## 7. REST stops being an agent surface (gated: claire fleets on MCP, observed on dev)

- [ ] 7.0 Migrate the raw-key `/api` suites to the seam or to MCP:
      `swarm-end-to-end.db.test.ts`, `machine-credential.controller.db.test.ts`, the
      compute-provider tests, and `dev/activated-organization-server.ts` with its
      `local-dev.md` section.
- [ ] 7.1 and 7.2 ship in one PR: M9's refusal (keys, trusted-issuer and groups-less tokens,
      before any read, with no environment switch), and Dash's `report-capacity.ts` as an MCP
      client. Negatives: move the refusal after the read; the old Dash HTTP path test
      observes `machine_bearer_not_accepted`.
- [ ] 7.3 Docs (M12), with Burokrat `check-indexes` exiting 0.

## 8. Roll-out

- [ ] 8.1 Dev: the claire fleet goes straight from operator links to MCP. A pool of 3 runs
      under Claude Code `headersHelper`, each with its own `wbs_run`: they claim, heartbeat
      and release. Re-key mid-run, then revoke, and observe the leases end. Record it in
      verify.md. This gates slice 7.
- [ ] 8.2 Prod runbook:
  - HTTP fleets and Auth0 bearers on `/mcp` stop at the swap;
  - seed `WBS_MACHINE_GRANT_SIGNING_KEY_*`, `MCP_BE_INTERNAL_SECRET` and
    `WBS_MCP_RESOURCE_URL` before merging;
  - run the audience preflight;
  - order the secret cutover.
