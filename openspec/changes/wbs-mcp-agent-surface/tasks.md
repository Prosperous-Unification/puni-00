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

- [x] 1.1 Red: `machine-grant.test.ts` in `@wbs/core`. A `PresentedMachineProof` variant
      (`grant`) of `admitMachineCredential` judges revocation, binding, membership and pool
      `expiresAt` in one place. The test covers:
  - `exp` = `min(requested, now + MOST_MACHINE_GRANT_SECONDS, assertion exp)`;
  - scopes from the credential only;
  - the opted-in run carried through;
  - a property that a revoked, unbound or expired-pool credential is never admitted.
- [x] 1.2 Green: the grant keys (`kid`, current and previous). Boot refuses a missing key once
      the activation marker is set, and the activation preflight lists a missing key. The
      route `POST /internal/mcp/machine-grants` (M14's secret):
  - answers `409 not_activated` before activation;
  - verifies API keys, and assertions by `(iss, aud, sub)` and `typ`;
  - consumes no `jti`;
  - compares mcp-01's sent issuer with `WBS_MCP_AUTHORIZATION_SERVER` and reports a mismatch
    as a fault;
  - returns the credential's scopes;
  - writes `machine_token_issued` at most once per (credential, run, UTC day), and after 100
    such rows in a day one `machine_token_issued_overflow` row. It **reads first outside the
    write lane**, writes nothing when either row exists, and otherwise repeats the lookups and
    the count inside the lane in `writeImmediately` (`BEGIN IMMEDIATE`), at one instant used
    for the lookups, the count and `created_at` (M3). **This task ships the migration** that widens the audit
    CHECK for both actions and adds their targeted partial unique indexes
    (`(credential, day, run)` and `(credential, day)`), with a guarded `down.sql` that refuses
    by name while any row of either action exists. It follows the latest audit widening at
    land time and carries its vocabulary (L13), so slice 1 depends on neither slice 6 nor the
    undo branch;
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
  - change the run index **and** the `ON CONFLICT` target together. Dropping the `coalesce`
    makes the three no-run issuances write three rows. Using `date(created_at)` instead of
    `created_at / 86400000` makes three issuances in one run and day, and three no-run
    issuances, each write three rows. Changing the index alone
    makes the targeted insert throw "does not match any … UNIQUE constraint", so the pair
    must move together for the negative to observe duplicates. The test runs at a
    **real-epoch timestamp** (2026-10-26), because a small fake clock hides the day bug;
  - write with `INSERT OR IGNORE`, and an injected CHECK violation is silently skipped
    instead of thrown;
  - write with an untargeted `ON CONFLICT DO NOTHING`. The fixture **collides on the row id
    with a different dedupe key**, and the collision is swallowed instead of thrown. (An
    untargeted form still throws on a CHECK, so the CHECK case cannot observe it);
  - skip the recount inside the turn, and two issuances racing at row 99 write **101 per-run
    rows** (`fc.asyncModelRun`);
  - remove the read-first path, and "Issuance while a batch holds the write turn" (using the
    existing `holdWriteTurn` harness) times out;
  - drop the overflow stop, and 150 runs write 150 rows;
  - change the overflow index and its `ON CONFLICT` target together to a unique key that never
    collides, such as `(credential, created_at)`, and every issuance past 100 writes another
    overflow row. A non-unique index would throw at prepare instead;
  - drop the `down.sql` guard, and the rollback test no longer sees the guard's **named
    refusal** (as the latest audit widening's own test asserts). The narrow table's CHECK
    would reject the copied rows anyway, so "rows deleted" cannot be observed;
  - answer a missing secret with `unknown_grant_key`, and mcp-01's fault test sees a
    re-fetch instead of a reported fault. (Slice 1 observes the be-01 half; mcp-01's fault
    test arrives with task 3.2. See verify.md, slice 1.)

- [x] 1.3 The grant verifier and exact audience dispatch in `identity.ts`, with constant-time
      secret admission. Tests: "A grant without the secret", "Revocation at the next call",
      "No write per call" and "A long delegation stays refused". Negatives:
  - remove the secret check;
  - remove the reread;
  - route unknown audiences to via-mcp-01;
  - consume per use.
- [x] 1.4 Parity through a test-only composition seam in `src/testing`, which
      `production-entrypoint.test.ts` keeps unreachable from `main.ts`. `CredentialAuthentication`
      gains `runId?`, and the `'personId' in credential` sites (M6) are updated. Negative: omit
      `personId` from the grant principal, and the lease assertion reddens.
- [ ] 1.5 The A25 audience rule (machine-credentials MODIFIED delta), in two steps:
  - [x] **Now** (slice 5; verify.md, slice 5 notes 8 to 10): `WBS_MCP_AUTHORIZATION_SERVER`,
        boot-checked by the canonicalisation function, which moves to `@wbs/contracts`. Both
        existing copies, `oauth.ts` 269–271 and `http.ts` 25–29, are replaced by calls to it.
        New registrations and narrowings must equal it or sit under it with `/`. The preflight
        CLI is a dry run.
  - **With slice 7:** refuse non-conforming stored rows at use.

  Tests: the look-alike and preflight scenarios; existing `wbs:org:` rows keep verifying on
  `/api` before slice 7. Negatives:
  - a bare `startsWith`, and `…/oauth.evil.example` is admitted;
  - enforce at use before slice 7, and the "keeps verifying" test reddens.

- [x] 1.6 Run scoping (M15, opt-in), independent of the undo work:
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

- [x] 2.1 Red: the form parser.
  - `client_credentials`: Basic or body, never both, never with a `client_assertion`; a lone
    `client_assertion` is `invalid_client`; `client_id` optional and matched.
  - JWT-bearer: `assertion` required, `typ` checked, a Basic secret refused, and `client_id`
    never looked up.
  - Exactly one canonical `resource` (`invalid_target`).
  - Default scope; `wbs_run` of 1 to 256 characters.
  - Carriers that redact.
- [x] 2.2 Green (slice 2; `tools/list` through `/mcp` waits for 3.2, and the provider-cache
      negative moves to 2.4: verify.md, slice 2 notes):
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

- [x] 2.3 Secrets: inject a throw in be-01's route during a Basic request. The test asserts
      that the report, route evidence and audit row hold no key, no `base64(id:key)` and no
      assertion. Negative: put the form in the report.
- [x] 2.4 `WorkloadJwtBearerProvider` and `twilight-dash mcp token` in Twilight Dash
      (`src/mcp/`; slice 6, verify.md slice 6 notes).
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
  - negative for the helper: memoise its token, and the re-run after a 401 returns the
    rejected token;
  - a `429` whose capped wait is zero or less: no retry, exit non-zero;
  - a `429` with `Retry-After: 30`, 2 s into a helper run, waits 7 s and retries once;
  - 100 staggered issuances on one credential within a minute all succeed under M10's 300/min
    limit.

## 3. mcp-01: `/mcp` admission

- [x] 3.1 M13: remove the upstream fallback after activation. Tests: "An Auth0 token on /mcp"
      and "Markers disagree". Negative: restore the fallback.
- [x] 3.2 Machine tokens: no store reads, and the grant sent with the secret. Revocation per
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
- [x] 3.4 Paths (M14): refuse empty, `.` and `..` values, and assert that the sent pathname
      equals the expanded template. Negative: **replace the path encoder with the identity
      function**, and an `id` of `x/../../claims` reaches be-01's fake as `/api/claims` unless
      the pathname assertion refuses it. Watch it pass through with the assertion removed.
- [x] 3.5 Gateway mode (M11): the real negative is the `token_use: machine` JWT. The test token
      carries `wbs_groups: ['dev:wbs:read']`, so that scopes don't mask it, and calls a read
      tool. Remove the branch, and the answer becomes 200 with a request recorded by be-01's
      fake. A `wbs_mk_` key is already 401 through `decodeJwt`, and no check is claimed for
      it.
- [ ] 3.6 Hosted connector check on dev: claude.ai consent with `none` is unchanged. Record it.
- [x] 3.7 Secret cutover (M14), with each secret tested on `/internal/mcp/delegation`. The old
      secret is removed in release N+1 (a follow-up).
- [ ] 3.8 Remove the consent path's `use === undefined` branch (`consentClaimsOf` in
      `apps/wbs/mcp-01/src/oauth.ts`; design M5), so a token without `token_use` is refused.
      Due once `MCP_ACCESS_TOKEN_TTL` (default 1 h) has passed since the slice-2 release
      (PR #761, merged into the plan branch 2026-10-27) reached each deployment: on dev, one
      hour after this plan branch is merged and deployed; on prod, one hour after the prod
      swap that carries it. Owner: whoever lands the prod swap. Negative: keep the branch, and
      a re-signed consent token without `token_use` stays admitted.

## 4. Limits and the source address

- [x] 4.1 A pure token bucket and in-flight counter with fake-clock properties.
- [x] 4.2 `sourceOf` uses `MCP_TRUSTED_PROXY_HOPS`, and M10's six limits apply. Tests: the
      four limit scenarios. Negatives:
  - leftmost XFF;
  - one bucket for successes and failures;
  - counting HTTP requests.
- [x] 4.3 Load evidence on h2puni under the heavy lock, recorded in verify.md. (Slice 11,
      `apps/wbs/mcp-01/src/load/m10-load.ts`: every fence holds; the design load does not,
      because one be-01 carries about 85 calls a second; see 4.5.)
- [x] 4.4 Bound mcp-01's grant-client fetch to be-01 at the token endpoint with a timeout (it
      holds a pending slot while it waits; review of PR #765). Negative: a never-answering be-01
      frees the slot. (Slice 7: `BE_CALL_TIMEOUT_MS`, raced; verify.md, slice 7.)
- [x] 4.5 Raise one be-01's capacity toward M10's design load (200 tool calls a second), or
      restate M10's sizing to the measured one (slice 11: about 85 a second on h2puni, bound by
      be-01 CPU per call). Candidates from the profile: prepare hot statements once, index the
      endpoint table, cache the activation marker and the expected secret's digest. Evidence:
      re-run `m10-load.ts --agents=100` under the heavy lock. (Slice 12: 86.2 → 120.6 calls a second
      on h2puni; M10's sizing restated to about 60 agents per be-01. The activation marker is not
      cached.)

## 5. Human-only tools by policy

- [x] 5.1 The `humanOnly` policy, `EXCLUDED_PATHS` shrunk, the capacity report as a tool.
      Negatives: untag a route; leave a tagged shape with no operation. (Slice 7; agent pools'
      routes are tagged when task 6.2 adds them.)
- [x] 5.2 One tool list for a consented human, a consented agent and a machine token. (Slice 7.)

## 6. Pools and account-keyed state (waits for `fix/wbs-undo-per-person`)

- [x] 6.0 Grep every check keyed by `userId` or account, and add any that M16's table is
      missing. (Five rows added to M16, 2026-10-28; verify.md slice 8.)
- [x] 6.1 Migrations:
  - `add_agent_pool` and `machine_credential.agent_pool_id`;
  - the audit actions `agent_pool_created`, `agent_pool_revoked` and `agent_pool_rekeyed`, by
    compatible rebuild (`machine_token_issued` shipped in task 1.2). Both the rebuild and its
    `down.sql` rebuild **recreate task 1.2's two partial unique indexes**. Negatives: omit one
    in the forward migration, and task 1.2's insert fails to prepare after 6.1; omit one in
    the `down.sql`, and the same insert fails after rolling 6.1 back;
  - guarded `down.sql` files.

  Negative: drop each guard. (Landed as `20261028100000_add_agent_pool` and
  `20261028100100_widen_organization_audit_agent_pools`; verify.md slice 8.)

- [x] 6.2 Pool routes: create (through `addPerson`'s cap check), re-key, and revoke with
      `removePersons`. Tests: every agent-pools scenario. Negatives:
  - the cap check outside the transaction (`fc.asyncModelRun`);
  - a member allowed to create;
  - one credential skipped in revoke;
  - re-key creating persons;
  - `removePersons` leaving the count unchanged.

  Tag the pool routes `humanOnly` (M8) and add them to the pinned human-only list.

  (verify.md slice 8: `removePersons` is a query flag; pool persons are written by the pool's
  own transaction with `addPerson`'s reading and decision, not through a directory batch.)

- [x] 6.3 The fe-01 pool panel (keys once as a download, counts before confirming, rendered
      states, reviewed by eye). (verify.md slice 9.)
- [x] 6.4 `twilight-dash pool import <file> --store <dir>`, giving each agent process its own
      `wbs_run`; the admin runs `chmod 600 <file>` first. Test: a key that fails to issue aborts
      the import. (verify.md slice 10.)

## 7. REST stops being an agent surface (gated: claire fleets on MCP, observed on dev)

- [x] 7.0 Migrate the raw-key `/api` suites: `swarm-end-to-end.db.test.ts`,
      `machine-credential.controller.db.test.ts`, the compute-provider tests, and
      `dev/activated-organization-server.ts` with its `local-dev.md` section.
      (verify.md slice 16: what moved, and what is marked "removed by 7.1 (M9)". Slice 17 covers
      the other eleven be-01 suites the same way, with the trusted-issuer token cases on mcp-01's
      `jwt-bearer` grant. Its repo-wide sweep found Dash's `resources/runtime.ts` still sending
      the key itself to `/api/resource-authorities/*`. That is outside 7.2's named file, and
      7.1 must not land without it.)
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
      (Not done: the dev run waits on a pool in the dev web app. Its rehearsal on a throwaway stack,
      `apps/wbs/mcp-01/src/load/pool-swarm-rehearsal.ts`, passed; verify.md slice 13.)
- [x] 8.2 Prod runbook:
  - seed `WBS_MACHINE_GRANT_SIGNING_KEY_*`, `MCP_BE_INTERNAL_SECRET` and
    `WBS_MCP_AUTHORIZATION_SERVER`;
  - run the audience preflight in the candidate container (Compose) or the schema Job
    (Kubernetes), with `WBS_ACCEPT_BREAKING_AUDIENCES` set from the deploy CLI's
    `--accept-breaking`;
  - order the secret cutover.
    (`docs/runbook-prod-deploy.md`, "MCP agent surface"; verify.md slice 14. The preflight
    was a manual `docker run` until 8.3 wired it into both deploys; verify.md slice 15.)
- [x] 8.3 Deploy wiring the runbook found missing (verify.md slice 14, gaps):
  - the Compose swap and the Kubernetes schema Job run `trusted-issuer-audience-check-cli.ts`
    with the candidate image before migrating, and both deploy CLIs take
    `--accept-breaking=<ids>` into `WBS_ACCEPT_BREAKING_AUDIENCES`. Negative: skip the step,
    and a fixture with an unaccepted `wbs:org:` registration swaps;
  - `deploy/k8s/wbs/base/mcp.yaml` gives mcp-01 `MCP_BE_INTERNAL_SECRET` from
    `wbs-mcp-secrets`, and the prod and staging `wbs-backend-config` carry
    `WBS_MCP_AUTHORIZATION_SERVER`. Negative: drop the ref, and `mcp-manifest.test.ts` reddens;
  - the be swap preflight requires the three settings when the store is activated, so a
    missing key refuses before migration instead of at be-01 boot.
    (verify.md slice 15: the be swap's `mcp-preflight` step and the capture Job; neither has
    run on a host.)
