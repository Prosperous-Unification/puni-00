## 0. Facts first, then Dany

- [x] 0.1 Client capabilities, read 2026-10-25, before design approval, and corrected by the
      later reviews. Sources:
  - Claude Code `headers` and `headersHelper` (the helper also runs in `-p`/SDK sessions,
    subject to folder trust);
  - the Agent SDK, the Messages API connector and claude.ai Request headers;
  - the MCP SDK 1.31.0 providers (`auth-extensions.js`, `auth.js`).

  Result: every Anthropic client except claude.ai can fetch a token, and claude.ai is
  consent-only in v1.

- [ ] 0.2 Dany confirms or amends M1–M16, with these explicit decisions:
  - (a) M1 (ii): no raw key (recommended), or raw keys for individual claude.ai Pro/Max only,
    after slice 7. claude.ai Team and Enterprise stay consent-only.
  - (b) M2: the JWT-bearer grant, the audience rooted at mcp-01's issuer (amends A25), and no
    `jti` consume.
  - (c) M4: the 24 h cap.
  - (d) M7: pools.
  - (e) M9: the cut.
  - (f) M15: opt-in run scoping.
  - (g) **Open question, M16: the account-keyed parent check.** This change leaves
    `parent_claim_foreign` and `wbs-team-claims` D7 exactly as they are. Today any agent bound
    to an account may claim under another agent's subtree claim of the same account. Options
    (Fable):
    1. keep D7 for agents bound to the same account (today);
    2. give a lease, renewed by the worker's heartbeat, to a claim a lead writes for an agent
       that holds a live credential;
    3. allow a delegated claim on the same item as its parent.

    A narrow laundering note: a member can relabel an agent as a human through `patchPerson`
    `kind`. That affects only the leaseless claims of agents that have no credential, because
    `patchPerson` refuses a kind change for a person with a live credential (A24).
- [ ] 0.3 Preconditions:
  - #731 is merged;
  - undo per person is merged; it is in progress on branch `fix/wbs-undo-per-person` (PR
    number to follow), and slice 6 waits for it;
  - `wbs-machine-credentials`, `wbs-claim-leases`, `wbs-team-claims`, `wbs-resources` and
    `wbs-organization-limits` are archived before this change. Its `machine-credentials`,
    `claim-leases` and `plan-command-registry` requirements are MODIFIED deltas built on their
    merged text; the claim requirement is modified by the last three.
  - `wbs-permissions` replaces A23's member cap with a contributor cap for machine tokens.
    Wherever this change's requirement bodies say a machine principal is capped at `member`
    (M6 parity, the pool scenarios, the read-only scope), read `wbs-permissions`' contributor
    cap once that change lands. Whichever lands second rewrites the other's wording.

## 1. be-01: the machine grant

- [ ] 1.1 Red: `machine-grant.test.ts` in `@wbs/core`. A `PresentedMachineProof` variant
      (`grant`) of `admitMachineCredential` judges revocation, binding, membership and pool
      `expiresAt` in one place. The test covers:
  - `exp` = `min(requested, now + MOST_MACHINE_GRANT_SECONDS, assertion exp)`;
  - scopes from the credential only;
  - the opted-in run carried through;
  - a property that a revoked, unbound or expired-pool credential is never admitted.
- [ ] 1.2 Green: the grant keys (`kid`, current and previous). Boot refuses a missing key once
      the activation marker is set, and the activation preflight lists a missing key. The
      route `POST /internal/mcp/machine-grants` (M14's secret):
  - answers `409 not_activated` before activation;
  - verifies API keys, and assertions by `(iss, aud, sub)` and `typ`;
  - consumes no `jti`;
  - compares mcp-01's sent issuer with `WBS_MCP_AUTHORIZATION_SERVER` and reports a mismatch
    as a fault;
  - returns the credential's scopes;
  - writes `machine_token_issued` at most once per (credential, run, UTC day), and after 100
    such rows in a day one `machine_token_issued_overflow` row; the count and the insert run
    in one `writeImmediately` (`BEGIN IMMEDIATE`) transaction. **This task ships the
    migration** that widens the audit CHECK for both actions and adds their targeted partial
    unique indexes (`(credential, day, run)` and `(credential, day)`), with a guarded
    `down.sql` that refuses while any row of either action exists. It follows
    `20261022140100_widen_organization_audit_compute_providers`, so slice 1 depends on
    neither slice 6 nor the undo branch;
  - answers a missing or wrong `MCP_BE_INTERNAL_SECRET` with `401 internal_unauthorized`
    (today's internal routes answer `401 unauthorized`; `/internal/mcp/*` moves to the new
    code).

  Test: `machine-grant.controller.db.test.ts`. Negatives, each watched failing with a `Proof:`
  adjacent:
  - drop the activation check, and the pre-activation case issues;
  - have the grant verifier also accept the delegation key, then sign the forgery with the
    **current grant `kid`** and the delegation key's material; the "grant signed with the
    delegation key" scenario admits;
  - add a `jti` consume, and "A reused Kubernetes token" reddens;
  - drop the audit unique index, or the `coalesce` in it, or use `date(created_at)` instead of
    `created_at / 86400000`, and three issuances in one run and day, **and three no-run
    issuances**, each write three rows. The test runs at a **real-epoch timestamp**
    (2026-10-26), because a small fake clock hides the day bug;
  - write with `INSERT OR IGNORE`, and an injected CHECK violation is silently skipped
    instead of thrown;
  - write with an untargeted `ON CONFLICT DO NOTHING`. The fixture **collides on the row id
    with a different dedupe key**, and the collision is swallowed instead of thrown. (An
    untargeted form still throws on a CHECK, so the CHECK case cannot observe it);
  - count outside the write transaction, and two issuances racing at row 99 write **101
    per-run rows** (`fc.asyncModelRun`);
  - drop the overflow stop, and 150 runs write 150 rows;
  - drop the overflow unique index, and every issuance past 100 writes another overflow row;
  - drop the `down.sql` guard, and a rollback with `machine_token_issued` rows deletes them;
  - answer a missing secret with `unknown_grant_key`, and mcp-01's fault test sees a
    re-fetch instead of a reported fault.

- [ ] 1.3 The grant verifier and exact audience dispatch in `identity.ts`, with constant-time
      secret admission. Tests: "A grant without the secret", "Revocation at the next call",
      "No write per call" and "A long delegation stays refused". Negatives:
  - remove the secret check;
  - remove the reread;
  - route unknown audiences to via-mcp-01;
  - consume per use.
- [ ] 1.4 Parity through a test-only composition seam in `src/testing`, which
      `production-entrypoint.test.ts` keeps unreachable from `main.ts`. `CredentialAuthentication`
      gains `runId?`, and the `'personId' in credential` sites (M6) are updated. Negative: omit
      `personId` from the grant principal, and the lease assertion reddens.
- [ ] 1.5 The A25 audience rule (machine-credentials MODIFIED delta), in two steps:
  - **Now:** `WBS_MCP_AUTHORIZATION_SERVER`, boot-checked by the canonicalisation function,
    which moves to `@wbs/contracts`. Both existing copies, `oauth.ts` 269–271 and `http.ts`
    25–29, are replaced by calls to it. New registrations and narrowings must
    equal it or sit under it with `/`. The preflight CLI is a dry run.
  - **With slice 7:** refuse non-conforming stored rows at use.

  Tests: the look-alike and preflight scenarios; existing `wbs:org:` rows keep verifying on
  `/api` before slice 7. Negatives:
  - a bare `startsWith`, and `…/oauth.evil.example` is admitted;
  - enforce at use before slice 7, and the "keeps verifying" test reddens.

- [ ] 1.6 Run scoping (M15, opt-in), independent of the undo work:
  - the `ClaimStore.renewLeases(personId, runId | null, now)` port, the conformance suite,
    and the SQLite and memory adapters;
  - batch renewal at `plan-commands.feature.ts` 547, reading the principal's run;
  - claims and `releaseWorkItem` refuse `run_mismatch`;
  - `run_mismatch` added to `@wbs/contracts` `refusal.ts`, fe-01 `plan-refusal.ts`, and the
    `claimWorkItem` and `releaseWorkItem` descriptions;
  - no migration (`claim.run_id` exists).

  Tests: the run scenarios, including "Re-fetching without wbs_run orphans nothing".
  Negatives:
  - default the run to the token `jti`, and the re-fetch scenario reddens with
    `already_claimed`;
  - renew by person only, and "two processes" reddens;
  - make `renewLeases(personId, null)` mean `run_id IS NULL`, and "A no-run heartbeat renews
    every run" (claim-leases delta) reddens; the port's JSDoc states the "every lease"
    meaning;
  - refuse a lead's release of a worker's delegated claim with `run_mismatch`, and "A lead
    releases a worker's delegated claim" reddens;
  - stamp the run on every claim the principal writes, not only on claims for its pinned
    person, and "A lead writes a worker's delegated claim with the worker's run" reddens
    (the shape `swarm-rehearsal.boot.db.test.ts` 249–255 uses);
  - release every run's claims, and "A leaf held under two runs" reddens;
  - accept a command's `runId` over the grant's, and "forged run id" reddens.

## 2. mcp-01: the token endpoint

- [ ] 2.1 Red: the form parser.
  - `client_credentials`: Basic or body, never both, never with a `client_assertion`; a lone
    `client_assertion` is `invalid_client`; `client_id` optional and matched.
  - JWT-bearer: `assertion` required, `typ` checked, a Basic secret refused, and `client_id`
    never looked up.
  - Exactly one canonical `resource` (`invalid_target`).
  - Default scope; `wbs_run` of 1 to 256 characters.
  - Carriers that redact.
- [ ] 2.2 Green:
  - both grants, and token signing (`token_use machine`, the grant's scopes, `exp` 60 s
    before the grant, 0–10% jitter);
  - `MCP_MACHINE_TOKEN_TTL`;
  - the metadata;
  - `invalid_client` with `WWW-Authenticate: Basic`, and assertion failures as
    `invalid_grant`, with no fall-through to `verifyUpstream`;
  - dynamic client registration refusing both grants (new behaviour);
  - rate-limit refusals as `429 invalid_request` with `Retry-After`.

  Tests: `ClientCredentialsProvider` and `WorkloadJwtBearerProvider` against the booted
  fixture, including the run-outlives-its-workload-token, reused-Kubernetes-token,
  `client_id` and ID-JAG scenarios. Negatives:
  - answer `invalid_grant` for a revoked key;
  - let registration accept a machine grant, tested with an otherwise valid body (`none` and
    a valid loopback redirect);
  - fall through to upstream;
  - look `client_id` up in the registered-client store, and the `client_id` scenario reddens;
    driven by a **raw request**, because the provider sends no `client_id`;
  - accept any `typ`, and the ID-JAG and `at+jwt` scenario reddens;
  - accept a Basic secret on the JWT-bearer grant, and its `invalid_request` test reddens;
  - make the provider cache its first assertion.

- [ ] 2.3 Secrets: inject a throw in be-01's route during a Basic request. The test asserts
      that the report, route evidence and audit row hold no key, no `base64(id:key)` and no
      assertion. Negative: put the form in the report.
- [ ] 2.4 `WorkloadJwtBearerProvider` and `twilight-dash mcp token` in Twilight Dash
      (`src/mcp/`).
  - The provider stamps client info with the authorization server's issuer, has a no-op
    `addClientAuthentication`, and has a `prepareTokenRequest` that reads a fresh assertion
    and adds `wbs_run`.
  - The provider caches its access token in memory and drops it on 401.
  - `twilight-dash mcp token` keeps no cache.

  Tests:
  - no dynamic-registration request is made;
  - the helper issues on every run: a re-run 0.6 s after a 401 issues a new token, and a
    rotated key (`unknown_grant_key`) recovers on the re-run;
  - the provider re-fetches after a 401. Negative: keep serving the cached token, and the
    retried call fails;
  - a `429` with `Retry-After: 30`, 2 s into a helper run, waits 7 s and retries once;
  - 100 staggered issuances on one credential within a minute all succeed under M10's 300/min
    limit.

## 3. mcp-01: `/mcp` admission

- [ ] 3.1 M13: remove the upstream fallback after activation. Tests: "An Auth0 token on /mcp"
      and "Markers disagree". Negative: restore the fallback.
- [ ] 3.2 Machine tokens: no store reads, and the grant sent with the secret. Revocation per
      design.md M3: a `machine_credential_refused` tool error for each call served after the
      revocation commits, the per-replica refused set (for `unknown_identity` only), then
      HTTP 401 on later requests. Tests: the second-replica
      scenario, both revocation scenarios, re-fetch at expiry, and `/refresh` and `/revoke`.
      Negatives:
  - forward the access token;
  - read the epoch;
  - inject a per-`jti` admission cache into be-01's grant verifier (so it skips the
    credential reread for a grant it has admitted), and a call served after the revocation
    commit succeeds;
  - skip the refused set, and the next request answers 200;
  - put a secret mismatch into the refused set, and a token stays refused after the secret is
    fixed;
  - map `unknown_grant_key` to a tool error, and the rotation test (with
    `_PREVIOUS` dropped early) sees no HTTP 401, so the helper is not re-run.
- [ ] 3.3 Only if Dany chooses M1 (ii), and only after slice 7: raw keys. Negative: inject
      "mcp-01 answers from the cache without calling be-01 on the tool call", and watch the
      revoked-key scenario redden.
- [ ] 3.4 Paths (M14): refuse empty, `.` and `..` values, and assert that the sent pathname
      equals the expanded template. Negative: **replace the path encoder with the identity
      function**, and an `id` of `x/../../claims` reaches be-01's fake as `/api/claims` unless
      the pathname assertion refuses it. Watch it pass through with the assertion removed.
- [ ] 3.5 Gateway mode (M11): the real negative is the `token_use: machine` JWT. The test token
      carries `wbs_groups: ['dev:wbs:read']`, so that scopes don't mask it, and calls a read
      tool. Remove the branch, and the answer becomes 200 with a request recorded by be-01's
      fake. A `wbs_mk_` key is already 401 through `decodeJwt`, and no check is claimed for
      it.
- [ ] 3.6 Hosted connector check on dev: claude.ai consent with `none` is unchanged. Record it.
- [ ] 3.7 Secret cutover (M14), with each secret tested on `/internal/mcp/delegation`. The old
      secret is removed in release N+1 (a follow-up).

## 4. Limits and the source address

- [ ] 4.1 A pure token bucket and in-flight counter with fake-clock properties.
- [ ] 4.2 `sourceOf` uses `MCP_TRUSTED_PROXY_HOPS`, and M10's six limits apply. Tests: the
      four limit scenarios. Negatives:
  - leftmost XFF;
  - one bucket for successes and failures;
  - counting HTTP requests.
- [ ] 4.3 Load evidence on h2puni under the heavy lock, recorded in verify.md.

## 5. Human-only tools by policy

- [ ] 5.1 The `humanOnly` policy, `EXCLUDED_PATHS` shrunk, the capacity report as a tool.
      Negatives: untag a route; leave a tagged shape with no operation.
- [ ] 5.2 One tool list for a consented human, a consented agent and a machine token.

## 6. Pools and account-keyed state (waits for `fix/wbs-undo-per-person`)

- [ ] 6.0 Grep every check keyed by `userId` or account, and add any that M16's table is
      missing.
- [ ] 6.1 Migrations:
  - `add_agent_pool` and `machine_credential.agent_pool_id`;
  - the audit actions `agent_pool_created`, `agent_pool_revoked` and `agent_pool_rekeyed`, by
    compatible rebuild (`machine_token_issued` shipped in task 1.2). The rebuild **recreates
    both partial unique indexes** of task 1.2. Negative: omit one, and task 1.2's dedupe test
    reddens after the 6.1 migration;
  - guarded `down.sql` files.

  Negative: drop each guard.

- [ ] 6.2 Pool routes: create (through `addPerson`'s cap check), re-key, and revoke with
      `removePersons`. Tests: every agent-pools scenario. Negatives:
  - the cap check outside the transaction (`fc.asyncModelRun`);
  - a member allowed to create;
  - one credential skipped in revoke;
  - re-key creating persons;
  - `removePersons` leaving the count unchanged.
- [ ] 6.3 The fe-01 pool panel (keys once as a download, counts before confirming, rendered
      states, reviewed by eye).
- [ ] 6.4 `twilight-dash pool import <file>`, giving each agent process its own `wbs_run`.
      Test: a key that fails to issue aborts the import.

## 7. REST stops being an agent surface (gated: claire fleets on MCP, observed on dev)

- [ ] 7.0 Migrate the raw-key `/api` suites: `swarm-end-to-end.db.test.ts`,
      `machine-credential.controller.db.test.ts`, the compute-provider tests, and
      `dev/activated-organization-server.ts` with its `local-dev.md` section.
- [ ] 7.1 and 7.2 ship in one PR, with three parts:
  - M9's refusal;
  - Dash's `report-capacity.ts` as an MCP client;
  - task 1.5's at-use audience enforcement.

  Negatives: move the refusal after the read; the old Dash HTTP path test observes
  `machine_bearer_not_accepted`.

- [ ] 7.3 Docs (M12), with Burokrat `check-indexes` exiting 0.

## 8. Roll-out

- [ ] 8.1 Dev: the claire fleet goes straight to MCP. A pool of 3 runs under `headersHelper`
      with `twilight-dash mcp token`, each with its own `wbs_run`: they claim, heartbeat and
      release. Re-key mid-run, then revoke, and observe the leases end. Record it. This gates
      slice 7.
- [ ] 8.2 Prod runbook:
  - seed `WBS_MACHINE_GRANT_SIGNING_KEY_*`, `MCP_BE_INTERNAL_SECRET` and
    `WBS_MCP_AUTHORIZATION_SERVER`;
  - run the audience preflight in the candidate container (Compose) or the schema Job
    (Kubernetes), with `WBS_ACCEPT_BREAKING_AUDIENCES` set from the deploy CLI's
    `--accept-breaking`;
  - order the secret cutover.
