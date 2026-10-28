## Verification record

Drafted 2026-10-25 as an OpenSpec proposal only. Nothing is implemented, and M1 to M16 are
assumed until Dany reads them.

Sources read on 2026-10-25 at `origin/main` 277fdf03c:

- mcp-01 `caller-auth.ts`, `http.ts`, `oauth.ts` (token dispatch, `callerSessionFor`,
  `bearerFor`, TTLs, signing keys), `organization-authority.ts`, `openapi-tools.ts`
  (`EXCLUDED_PATHS`), `server.ts` (scope check, `bearerFor` per call), `config.ts`
  (gateway guard), `credential-epoch.ts`, `README.md`;
- be-01 `middleware/authenticated.ts`, `http/identity.ts` (direct audiences),
  `runtime/mcp-delegation.ts`, `runtime/delegation.ts` (single-use consume), `boot.ts`
  (`SqliteDelegationUse`);
- `@wbs/core` `authentication.feature.ts` and `service/machine-key.ts`; `@wbs/contracts`
  `mcp-delegation-shapes.ts`;
- Twilight Dash `compute/configuration.ts` and `report-capacity.ts`;
- `docs/auth-integration.md`, `docs/local-dev.md` and `docs/import-with-ai.md`;
- the changes `wbs-machine-credentials` (A1 to A25), `wbs-claim-leases`,
  `wbs-organization-limits`, `compute-providers` and `wbs-permissions` (P17);
- PR #738.

External sources, read 2026-10-25:

- MCP authorization, revision 2025-11-25:
  https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- MCP OAuth Client Credentials extension, stable 2026-07-28:
  https://github.com/modelcontextprotocol/ext-auth, file
  `specification/stable/oauth-client-credentials/2026-07-28/oauth-client-credentials.mdx`

Client facts (Claude Code, Agent SDK, Messages API connector, claude.ai connectors) were read 2026-10-25 by the coordinator from the URLs cited in design.md. MCP SDK 1.31.0 facts come from `node_modules` and the reviewer. RFC 6749 §4.4.3, RFC 7523 §2.1 and §3, and the ID-JAG `typ` remain from memory.

## Review of 24dcae0a5 (Fable, high), how each item is addressed

| Item                                                                        | Where                                                                                                                   |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| S1-1 the upstream fallback passes through an Auth0 token                    | design Context table; M13; spec "accepts no upstream token after activation"; task 3.1                                  |
| S1-1 groups-less configured-issuer tokens                                   | M9 (refused, #731 a precondition); machine-credentials spec; task 0.3                                                   |
| S1-1 constraint wording                                                     | design Context ("any authorization server the metadata lists"); proposal Constraints                                    |
| S1-1 / S2-12 re-argue (b), cost table                                       | M1, now (i) + (ii), with a cost table                                                                                   |
| S1-2 the TTL cliff                                                          | M4 (12 h default, 24 h cap, jitter, behaviour at expiry); task 0.1 done first                                           |
| S2-1 a separate grant key, typ, verifier and cap                            | M3; spec "verified apart from delegations"; task 1.3                                                                    |
| S2-2 dedicated secret, constant-time compare, dot segments, honest property | M14; spec "Tool path values cannot traverse"; tasks 1.3, 3.4                                                            |
| S2-3 stateless versus the epoch                                             | M5 (no grants before activation, no epoch read); spec "A second replica" with spies                                     |
| S2-4 optional `client_id`, signing algorithms, federated profile            | M2; spec "workload token without client_id"; task 2.2                                                                   |
| S2-5 exp from the assertion, `jti`, WBS-unique audience                     | M3 (cap and optional `jti`); M2 (canonical resource, plus a registration audience under `MCP_PUBLIC_URL`, amending A25) |
| S2-6 rate limits                                                            | M10 (hop count, split counters, sizing, 429); four spec scenarios; task 4.2                                             |
| S2-7 leases are per person                                                  | M15; spec "One running agent per credential"; task 6.4                                                                  |
| S2-8 OIDC pools                                                             | M7: v1 is API keys only; seat selection is reopened for OIDC                                                            |
| S2-9 blast radius, key handoff, re-key                                      | M7; agent-pools spec "re-keyed"; tasks 6.5, 6.6                                                                         |
| S2-10 roll-out                                                              | tasks 7.0–7.2 and 8.1 (gate); fleets go straight to MCP                                                                 |
| S2-11 no env switch, Basic form in the absence test, A5 vocabulary          | M9 seam; secrets spec; M3 `unknown_identity`                                                                            |
| S3 items                                                                    | tasks 2.1, 2.2, 3.2, 3.6, 1.1, 4.2, 6.0, 6.2; M3 scopes and audit; glossary trimmed                                     |

## Second review of 58e0cea79 (Fable, high), how each item is addressed

| Item                                                           | Where                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-1 a claude.ai Team/Enterprise header is a shared credential | M1: (ii) is out of v1, Pro/Max only if Dany chooses it, Team/Enterprise consent-only; M12; Risks; task 0.2 (a)                                                                                                                                                                                                                                      |
| S2-2 the A25 audience amendment                                | machine-credentials MODIFIED delta; M2: (superseded by the third review: `WBS_MCP_AUTHORIZATION_SERVER`), equality or prefix plus `/`, existing rows, narrowing, URL change, dry-run preflight; task 1.5; task 0.3 (archive order)                                                                                                                  |
| S2-3 RFC 7523 conformance                                      | M2: OIDC moves to the §2.1 JWT-bearer grant (conformant); the client-assertion profile becomes the documented-deviation alternative; the Context RFC lines are corrected                                                                                                                                                                            |
| S2-4 a static assertion dies                                   | M2 `WorkloadJwtBearerProvider`; spec "A run outlives its workload token"; task 2.2 negative                                                                                                                                                                                                                                                         |
| S2-5 M15 cannot be enforced                                    | M15: the run is signed into the grant, renewal and claims are scoped to `(person, run)`, plus `run_mismatch`; spec requirement; task 6.1                                                                                                                                                                                                            |
| S2-6 raw-key failures, audit volume, lifetime                  | M5 (if (ii)): 60 s grants, failures counted, no per-miss audit; M3 audit per token grant only                                                                                                                                                                                                                                                       |
| S2-7 client facts                                              | Context: Agent SDK `headersHelper` and stored sign-in; M1 table reframed; proposal fixed                                                                                                                                                                                                                                                            |
| S2-8 negatives that cannot fail                                | task 3.3 (cache answers without be-01); task 1.2 (verifier accepts the delegation key)                                                                                                                                                                                                                                                              |
| S3-1 to S3-12                                                  | M1 (deviation, after M9); M10 (128 × R, 429 `invalid_request`); M11 (never forwarded, prefix detection; task 3.5 non-circular); stale text fixed (CONTEXT, line numbers, M1–M16); M14 (empty value, pathname, proxies, cutover; tasks 3.4, 3.7); M2 (two methods); M13 (markers; task 3.1); M3 (keys absent, `jti`); M7 (cleanup; agent-pools spec) |
| M16 undo                                                       | removed from the slices; now a dependency (task 0.3); the analysis is kept in the M16 table                                                                                                                                                                                                                                                         |

## Third review of 948d6e668 (Fable, high), how each item is addressed

| Item                                                | Where                                                                                                                                                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-1 a single-use `jti` breaks Kubernetes           | M3: no consume (RFC 7523 MAY); spec "A reused Kubernetes token"; task 1.2's negative becomes "add a consume"; M2: helpers cache access tokens until 5 min before `exp`                                                 |
| S2-1 defaulting the run to the `jti` orphans claims | M15: opt-in, no run without `wbs_run`, never the `jti`; port, adapter and batch changes listed; `wbs_run` up to 256; subagents share a run; no migration; spec "Re-fetching without wbs_run orphans nothing"; task 1.6 |
| S2-2 undo and release are not run-scoped            | M16 rows: undo stays per person (stated); release is run-scoped when opted in; spec requirement                                                                                                                        |
| S2-3 `client_id` on the JWT-bearer grant            | M2: never looked up, equal when sent, Basic secret refused; provider shape and home (Twilight Dash); spec requirement; tasks 2.1, 2.4                                                                                  |
| S2-4 task 3.5's prefix negative cannot fail         | M11: no prefix branch claimed; the machine-JWT branch is the negative                                                                                                                                                  |
| S3-1 revocation as HTTP 401                         | M3: tool error first, the rest of a batch not sent, a per-replica refused set, then 401; two scenarios; task 3.2                                                                                                       |
| S3-2 parity is no longer byte for byte              | M6: `runId?` and the four `'personId' in` sites; task 1.4                                                                                                                                                              |
| S3-3 run work moved, refusal sites                  | task 1.6 (slice 1); `run_mismatch` in contracts, fe-01 and descriptions                                                                                                                                                |
| S3-4 the undo dependency                            | branch `fix/wbs-undo-per-person`, in progress (task 0.3, M16)                                                                                                                                                          |
| S3-5 token scope                                    | M3, plus the spec's read-only scenario                                                                                                                                                                                 |
| S3-6 assertion `aud` names the authorization server | M2 and the MODIFIED delta: `WBS_MCP_AUTHORIZATION_SERVER` = `<MCP_PUBLIC_URL>/oauth`, the shared canonical function, mcp-01 sends its issuer and a mismatch is a fault                                                 |
| S3-7 tests that could fail for the wrong reason     | the DCR body; the forgery uses the current `kid`; task 3.4 injects the identity encoder                                                                                                                                |
| S3-8 undefined refusals                             | M2: pre-activation `invalid_grant`, a lone assertion `invalid_client`, the `typ` dispatch and ID-JAG (from memory)                                                                                                     |
| S3-9 audit volume                                   | M3: once per (credential, run, UTC day)                                                                                                                                                                                |
| S3-10 all of claude.ai is consent-only              | proposal, M12, Risks (pasted token)                                                                                                                                                                                    |
| S3-11 audience ordering and the preflight's tree    | M2 ordering (new rows only until slice 7); Compose candidate container, Kubernetes schema Job, `WBS_ACCEPT_BREAKING_AUDIENCES`                                                                                         |
| S3-12 `parent_claim_foreign`                        | M16 decision; spec requirement; task 1.7                                                                                                                                                                               |
| S3-13 stale text                                    | Context row; verify RFC line; proposal Modified Capabilities; the provider's home                                                                                                                                      |

## Fourth review of 2d98eb898 (Fable, high), how each item is addressed

| Item                                                                        | Where                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 `parent_claim_foreign` on data that is not stored, and the D7 reversal | M16 row restated on the holder `personId` and kind; D7 reversal named there and in task 0.2 (g); `plan-command-registry` MODIFIED delta with the D6 scenario and the direct-claim refusal; the lead/worker shape is explained; task 1.7                                            |
| S2-2 claim behaviour changed through ADDED requirements                     | MODIFIED deltas `claim-leases` (both renewal requirements) and `plan-command-registry` (the claim requirement with `run_mismatch` placed after `credential_not_for_person`); task 0.3 archives; proposal Modified Capabilities                                                     |
| S2-3 "calls after the refusal are not sent"                                 | M3: no serialisation (latency cost stated); each call after the commit answers `machine_credential_refused`; scenario and task 3.2 negative rewritten                                                                                                                              |
| S2-4 the gateway negative cannot fail                                       | M11 and task 3.5: token with `wbs_groups: ['dev:wbs:read']`, observes 401 against 200                                                                                                                                                                                              |
| S3-1 the refused set, `_PREVIOUS`, unknown `kid`                            | M3; task 3.2 negatives                                                                                                                                                                                                                                                             |
| S3-2 M5's verification list                                                 | M5                                                                                                                                                                                                                                                                                 |
| S3-3 the `client_id` scenario and citation                                  | spec (raw request); M2 cites `oauth.ts` 1046–1073                                                                                                                                                                                                                                  |
| S3-4 the token cache                                                        | M2: key, file location and mode, and the under-6-minute assertion case; task 2.4                                                                                                                                                                                                   |
| S3-5 the success limit                                                      | M10: 60/min, burst 20, sized for a rollout of 20 pods, 429 beyond                                                                                                                                                                                                                  |
| S3-6 `renewLeases(personId, null)`                                          | M15; claim-leases delta scenario; task 1.6 negative                                                                                                                                                                                                                                |
| S3-7 releases by a lead                                                     | M15; spec scenario; task 1.6 negative                                                                                                                                                                                                                                              |
| S3-8 `typ` negatives, `at+jwt`, ID-JAG wording                              | M2; spec scenario covering both; task 2.2 negatives                                                                                                                                                                                                                                |
| S3-9 stale text                                                             | proposal line 21; M6 credential sites (`compensating.ts` dropped; command bindings added)                                                                                                                                                                                          |
| S3-10 both canonicalisation copies                                          | task 1.5                                                                                                                                                                                                                                                                           |
| S3-11 the audit unique key                                                  | M3: partial expression index with `coalesce` (superseded by the fifth review: the day expression and the targeted `ON CONFLICT … WHERE`); task 1.2 negatives include the no-run case. Fable's probe at scratchpad/probe.ts was not rerun here; its result is cited from the review |

## Fifth review of 56ca4ad1a (Fable, high), how each item is addressed

| Item                                                                       | Where                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-A the `plan-command-registry` delta's stale base                        | delta rebuilt on the merged text: `assign` and `resources` (wbs-resources), occupancy refusals, `claim_limit` last (wbs-organization-limits), and the code's order with `run_mismatch` after `credential_not_for_person`; their scenarios are carried; task 0.3 archives both changes                                                           |
| S2-B the parent rule reverses a machine-credentials scenario and nested D6 | rule now: the pinned person holds no claim on the parent's chain, and the holder is not a `person`-kind person bound to the caller's account; "Nested delegation" scenario; the machine-credentials delta MODIFIES "A delegated claim keeps working"; M16 and 0.2 (g) state what changes for claire fleets; the `wbs-permissions` copy is noted |
| S2-C `run_mismatch` on claims needs the release exemption                  | M15: the stamp and the mismatch apply only when the claimant is the pinned person; scenario "An opted-in lead writes a worker's delegated claim" in two deltas; task 1.6 negative                                                                                                                                                               |
| S2-D the audit day never dedupes                                           | M3: `created_at / 86400000`, targeted `ON CONFLICT (…) WHERE action = …`; a real-epoch test in task 1.2. Fable's probes (p5/probe5.ts, pk.ts) were not rerun here                                                                                                                                                                               |
| S2-E the helper cache defeats the `kid` recovery                           | M2: a re-run within 30 s drops the entry, `--refresh`, the SDK provider drops on 401; task 2.4 test and negative                                                                                                                                                                                                                                |
| S3-1 distinct codes                                                        | M3: `unknown_identity`, `internal_unauthorized` (reported fault, HTTP 502), `unknown_grant_key` (HTTP 401)                                                                                                                                                                                                                                      |
| S3-2, S3-3 stale task text, the injection site                             | task 3.2: "each call served after the commit"; a per-`jti` admission cache injected into be-01's verifier                                                                                                                                                                                                                                       |
| S3-4 a release delta                                                       | `plan-command-registry` MODIFIES the release requirement: only the caller's run is released, `run_mismatch` when only other runs hold                                                                                                                                                                                                           |
| S3-5 defining the human holder                                             | M16: `kind = 'person'` and `account_id` = the caller's account; other humans are refused; the `parentHolder` input in task 1.7                                                                                                                                                                                                                  |
| S3-6 the claim-leases scenario                                             | it uses a grant without `wbs_run`                                                                                                                                                                                                                                                                                                               |
| S3-7 cache safety                                                          | M2: directory mode, owner and `lstat`/symlink checks; task 2.4                                                                                                                                                                                                                                                                                  |
| S3-8 `Retry-After`                                                         | M2; task 2.4                                                                                                                                                                                                                                                                                                                                    |
| S3-9 the client-controlled bound                                           | M3: 256 distinct runs per credential per day (`429 too_many_runs`); 86,400 without the cap                                                                                                                                                                                                                                                      |
| S3-10 one `ON CONFLICT` form                                               | targeted with `WHERE` everywhere (M3, task 1.2)                                                                                                                                                                                                                                                                                                 |
| S3-11 the "amended after" list                                             | design.md line 3                                                                                                                                                                                                                                                                                                                                |
| S3-12 the gateway group prefix                                             | M11: computed from the function `oidc-identity.ts` 36 uses                                                                                                                                                                                                                                                                                      |

## Sixth review of 6f8f8233f (Fable, high): simplified, how each item is addressed

| Item                                                                                                                | Where                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1, S2-2 the parent-claim restriction                                                                             | **removed.** D7 and `parent_claim_foreign` are unchanged; the `plan-command-registry` delta keeps today's parent text, and the machine-credentials MODIFIED machine-token requirement is dropped; M16 row and task 0.2 (g) record it as an open question with Fable's three options and the laundering note; task 1.7 and `parentHolder` are gone |
| S2-3 the run cap                                                                                                    | **removed** (`too_many_runs`); M3 overflow: 100 per-run rows, then one overflow row per credential per day; spec requirement "Issuance audit volume is bounded…" with two scenarios                                                                                                                                                               |
| S2-4 audit migration placement                                                                                      | task 1.2 ships the CHECK widening and indexes; removed from 6.1                                                                                                                                                                                                                                                                                   |
| S2-5 the helper retry (superseded by the seventh review: the helper cache is removed)                               | same parent PID within 30 s (M2, spec, task 2.4)                                                                                                                                                                                                                                                                                                  |
| S3-1 the internal-secret rule                                                                                       | one rule, `401 internal_unauthorized`, in M3, the `mcp-agent-surface` spec requirement and the machine-credentials scenario; task 1.2 notes today's `401 unauthorized`                                                                                                                                                                            |
| S3-2 `Retry-After` on the helper path (superseded by the seventh review: the cap is the remaining budget minus 1 s) | capped at 8 s (M2, spec, task 2.4)                                                                                                                                                                                                                                                                                                                |
| S3-3 the contributor cap                                                                                            | task 0.3 reconciliation for requirement bodies                                                                                                                                                                                                                                                                                                    |
| S3-4 `steps_on_subtree` on release                                                                                  | restored in the release delta                                                                                                                                                                                                                                                                                                                     |
| S3-5 the laundering note                                                                                            | task 0.2 (g), with the S2-1 open question                                                                                                                                                                                                                                                                                                         |
| S3-6 the cache race (superseded by the seventh review: the helper cache is removed)                                 | `O_NOFOLLOW` plus `fstat` of the descriptor, and a stderr warning (M2, spec, task 2.4 negative)                                                                                                                                                                                                                                                   |
| S3-7 the `ON CONFLICT` negatives                                                                                    | task 1.2: `INSERT OR IGNORE` for the CHECK case; an id collision with a different dedupe key for the untargeted form                                                                                                                                                                                                                              |
| S3-8 one transaction                                                                                                | M3; spec; task 1.2 negative (`fc.asyncModelRun`)                                                                                                                                                                                                                                                                                                  |
| S3-9 release edge cases                                                                                             | release delta: `not_claimed_by` before `run_mismatch` with named steps; pre-opt-in no-run claims are released with the caller's run; scenario                                                                                                                                                                                                     |
| S3-10 `parentHolder`                                                                                                | removed                                                                                                                                                                                                                                                                                                                                           |
| S3-11 proposal length                                                                                               | trimmed                                                                                                                                                                                                                                                                                                                                           |
| S3-12 cache and `Retry-After` scenarios (superseded by the seventh review: replaced by the fresh-token requirement) | `mcp-agent-surface` spec requirement "The token helper's cache…" with four scenarios                                                                                                                                                                                                                                                              |

## Seventh review of 623b21f1f (Fable, high), how each item is addressed

| Item                                                | Where                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 the parent-PID rule never matches (dash forks) | **The helper cache is removed.** `twilight-dash mcp token` issues a fresh token on every run; only the SDK provider caches, and it drops on 401 (M2). The trade-off is one issuance per Claude Code connection, so M10's per-credential success limit is raised to 300/min, burst 100, and the reason is given. The grandparent key is recorded as the rejected alternative. Spec requirement "The token helper issues a fresh token on every run", with 401 re-run, key-rotation and staggered-batch scenarios; task 2.4 |
| S3-1 overflow negatives                             | task 1.2: a race at 99 writes 101 per-run rows; dropping the overflow index writes more overflow rows; `writeImmediately` (`BEGIN IMMEDIATE`) named in M3 and the spec                                                                                                                                                                                                                                                                                                                                                    |
| S3-2 the migration's `down.sql`                     | task 1.2: guarded `down.sql` following `20261022140100_widen_organization_audit_compute_providers`, plus a negative; task 6.1's rebuild recreates both indexes, plus a negative                                                                                                                                                                                                                                                                                                                                           |
| S3-3 base scenarios that call `/api`                | machine-credentials delta MODIFIES "One verification path admits every source" and "A machine token acts as its pinned person's account with capped scopes": through `/mcp`, or the test-only seam                                                                                                                                                                                                                                                                                                                        |
| nits                                                | index order (credential, day, run); the cache-race wording is gone with the cache; `Retry-After` capped at the remaining helper budget minus 1 s; release text reworded, with a scenario for named steps split across runs; S3-5 added to the sixth-review table                                                                                                                                                                                                                                                          |

## Eighth review of 7ddba68c8 (Fable, high), how each item is addressed

| Item                                   | Where                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 issuance on the single write lane | M3: read first outside the lane, write nothing when the day's row exists, recount inside the lane; spec scenario "Issuance while a batch holds the write turn"; task 1.2 negatives (remove read-first and the test times out with `holdWriteTurn`; skip the recount inside the turn); M2 cost sentence corrected (no write in the steady state; primary-key read for API keys, JWKS for OIDC) |
| S3-1 the verification-path body        | machine-credentials MODIFIED body: reached only through `/internal/mcp/machine-grants` and the seam; the three scenarios carry the seam or grant-route outcome                                                                                                                                                                                                                                |
| S3-2 three negatives misstated         | task 1.2: index and target change together; the overflow index likewise; the `down.sql` negative asserts the named refusal (Fable's probe not rerun here)                                                                                                                                                                                                                                     |
| S3-3 6.1's `down.sql`                  | task 6.1: the forward and the `down.sql` rebuild both recreate the indexes, each with a negative                                                                                                                                                                                                                                                                                              |
| S3-4 release with named steps          | release delta: `run_mismatch` judged over the named steps; scenario "Naming only another run's step"                                                                                                                                                                                                                                                                                          |
| S3-5 per-IP burst                      | M10: 300/min, burst 100                                                                                                                                                                                                                                                                                                                                                                       |
| nits                                   | M3's stale "token caching" sentence; task 2.4 memoise negative; `Retry-After` ≤ 0 means no retry; `BEGIN IMMEDIATE` scoped to blue/green; task 1.2 follows the latest widening (L13); sixth-review rows S2-5, S3-2, S3-12 marked superseded                                                                                                                                                   |

## Ninth review of e3b5d1e32 (Fable, high): ready for Dany; S3 tidy-up

| Item                                        | Where                                                                                                                                                                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-a the consent delegation stays on `/api` | machine-credentials body: only the API-key and trusted-issuer branches and the groups-less refusal are limited to the grant route and the seam                                                                                                  |
| S3-b `touchLastUsed` still enters the lane  | M2 (the only write is `touchLastUsed`), M3 (the residual: at most one lane entry per credential per minute, as #668 accepted); the scenario adds "its last use is fresh"                                                                        |
| S3-c two task 1.2 negatives                 | the overflow index uses a never-colliding unique key such as `(credential, created_at)`; dropping `coalesce` affects only the no-run issuances                                                                                                  |
| nits                                        | `writeImmediately` named in the spec and task 1.2; one instant inside the lane; M3 says the outside step reads exactly two rows and no count; full `gate.ts` path; long line wrapped; M2's cost line names the account read and the two lookups |

## Commands run for this proposal

Recorded in the PR description with their output: `openspec validate wbs-mcp-agent-surface
--strict`, `openspec validate --all --json`, Burokrat `check-indexes working . HEAD`, and
Prettier on the changed files. Not run: the h2puni gate and the full Nx suites. Nothing is
implemented, and CI carries them.

## Slice 1: the machine grant at be-01 (tasks 1.1 to 1.3)

Built on branch `feat/wbs-mcp-machine-grant-1` (the plan branch with `origin/main` dacf0f10f
merged in), 2026-10-26, on the assumed M1 to M16. Every test below ran under
`env -u CLAUDECODE` on the laptop; nothing ran on h2puni.

What landed:

- **1.1** `admitMachineCredential` gains the `grant` proof (`@wbs/domain`
  `machine-credential.ts`): an `api_key` or `oidc` credential, never `mcp_consent`, naming the
  grant's person and organization, whose bound account is still a member there.
  `MachineCredentialRecord` gains `boundAccountRole` (read with the credential) and `expiresAt`
  (judged for every source). `machineGrantTermsOf` and `MOST_MACHINE_GRANT_SECONDS`
  (`@wbs/core` `service/machine-grant.ts`) own `exp`, scopes and the run.
- **1.2** Migration `20261026130000_widen_organization_audit_machine_tokens` with a guarded
  `down.sql`; `MachineTokenAuditRepository` (`@wbs/store-sqlite`); the grant keys, signer and
  verifier (`runtime/machine-grant.ts`); issuance (`runtime/machine-grant-authority.ts`) at
  `POST /internal/mcp/machine-grants` (`issueMcpMachineGrant` in `@wbs/contracts`);
  `MCP_BE_INTERNAL_SECRET`, `WBS_MACHINE_GRANT_SIGNING_KEY_CURRENT`/`_PREVIOUS` and
  `WBS_MCP_AUTHORIZATION_SERVER` in `config.ts`; boot's refusal of an activated store without
  them; the activation CLI's preflight (exit 8); `401 internal_unauthorized` on
  `/internal/mcp/*`. The issuer canonicalisation moved to `@wbs/contracts`
  (`mcp-authorization-server.ts`), and mcp-01's `oauth.ts` uses it.
- **1.3** `identity.ts`: the `mcp-internal` and `mcp-dedicated` requirements, every secret
  compared by `timingSafeEqual` over SHA-256 digests, the grant bearer branch (secret first,
  grant keys alone, credential reread through `AuthService.admitMachineGrant`, nothing
  consumed), and delegation dispatch by exact audience (`invalid_token` otherwise).

### Slice 1 notes (assumptions taken, and gaps in the design)

1. **The secret's header** was not named by the design. Slice 1 uses
   `x-mcp-internal-auth` (`MCP_INTERNAL_SECRET_HEADER` in `@wbs/contracts`), now recorded in
   M14.
2. **The grant keys' form** was not specified; now recorded in M3. HS256 over a secret of at
   least 32 characters holding at least 10 distinct ones (be-01 alone signs and verifies),
   with the `kid` the first 16 base64url characters of HMAC-SHA256(key,
   `wbs-machine-grant-kid`). Current and previous must differ, and config refuses any two
   equal values among `INTERNAL_AUTH_SECRET`, `MCP_BE_INTERNAL_SECRET` and both keys.
3. **Pool expiry** (M7) has no column before task 6.1. The record carries `expiresAt`, judged
   for every source, and the SQLite read answers the constant `NO_CREDENTIAL_EXPIRY` (null)
   until 6.1 adds the column.
4. **Membership in one place**: the record gains `boundAccountRole`, and the `grant` variant
   refuses a non-member `unknown_identity`; issuance refuses one the same way through
   `machineGrantTermsOf`. An API key on `/api` (until M9) keeps today's
   `403 not_a_member` from organization access, unchanged.
5. **Runs that look like secrets**: M15 calls `wbs_run` opaque, 1 to 256 characters, but the
   audit refuses a detail value shaped like a secret (`isSecretShaped`: a `wbs_mk_` or
   `wbs_scim_` prefix, 64 hex characters, or a pipe-separated pair). The most restrictive
   reading: the grant route answers such a run `400 invalid_body`, so a key never reaches an
   audit row and issuance is never a 500 for it. The spec now states it (requirement "A run
   shaped like a secret is refused", mcp-01 mapping it to `400 invalid_request`).
6. **Boot and activation require all three settings**, not only the grant key the design
   names: an activated store can serve no grant without the secret or the authorization
   server either. **Every activated deployment, dev included, refuses to boot this be-01
   until the three are seeded**; task 8.2's seeding must precede any deploy of this code (the
   2026-10-22 rule: seed required keys on dev before merging).
7. **The `typ` refusal at be-01** is `401 unsupported_assertion_type` naming the `typ`, and an
   undecodable assertion is `401 invalid_token`; mcp-01 maps both to `400 invalid_grant`
   (slice 2).
8. **Delegations of an unknown audience** now answer `401 invalid_token` (before:
   `unauthenticated`), as M3 says; array audiences too. The `gateway-delegation` route is
   unchanged.
9. **`/internal/mcp/*` refusals** of the secret moved from `401 unauthorized` to
   `401 internal_unauthorized`. mcp-01 reads every 401 that is not a user's refusal as a
   deployment fault already (`organization-authority.ts` `isUserRefusal`), so its behaviour is
   unchanged; its stubs still answer `unauthorized`.
10. **Not in slice 1**: the per-call grant principal carries no `runId` (task 1.4), and the
    A25 audience rule (task 1.5) is not applied at issuance.
11. **Constant-time compares have no behavioural negative**: timing is not observable in
    these tests. The equality is covered by the missing, wrong and gateway-secret negatives.
12. **The `unknown_grant_key` negative of 1.2** is observed at be-01 only (the test sees that
    code instead of `internal_unauthorized`); mcp-01's fault test, which would see a re-fetch,
    arrives with task 3.2.
13. **Secrets in reports (open, task 2.3)**: a 500 on the grant route reports the error alone, never the body
    (`createUnexpectedFailureReporter`), and no query binds the key or the assertion (read in
    the code, not tested). The task 2.3 test (an injected throw during a Basic request) is not
    written yet.

### Commands and results

All on 2026-10-26 at d0d21035d (the docs commit after it changes no code), with
`env -u CLAUDECODE` and `--skip-nx-cache`:

| Command                                                                                                                  | Result                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t typecheck lint -p wbs-domain wbs-core wbs-store-sqlite wbs-contracts wbs-auth wbs-be-01 wbs-mcp-01` | exit 0 at 94469226c; `wbs-be-01` typecheck and lint rerun at d0d21035d, exit 0                                                                                                                                                                                        |
| `bunx nx run wbs-be-01:test`                                                                                             | 3740 pass, 0 fail, 3 skipped, 3743 tests in 255 files (1183.6 s), exit 0. The first run, at 94469226c, failed 2 (`capacity-fanout-process.db.test.ts` and `runtime-command.controller.db.test.ts` reboot an activated store without the settings); fixed in d0d21035d |
| `bunx nx run-many -t test -p wbs-core wbs-store-sqlite --parallel=1`                                                     | 1381 pass, 0 fail; 1999 pass, 0 fail, 1 skipped; exit 0                                                                                                                                                                                                               |
| `bunx nx run-many -t test -p wbs-domain wbs-contracts wbs-auth`                                                          | 125, 1341 (3 skipped) and 607 pass, 0 fail; exit 0                                                                                                                                                                                                                    |
| `bunx nx run wbs-mcp-01:test`                                                                                            | 550 pass, 0 fail, exit 0 (at 52c6d866b, before two test-only commits)                                                                                                                                                                                                 |
| `bun test tools/tool-remote-scripts/src/swap-maintenance.db.test.ts`                                                     | 2 pass, 0 fail                                                                                                                                                                                                                                                        |
| the 50 files pinning the migration list or rollback order (store-sqlite and be-01)                                       | 829 pass, 4 fail on first run (three pins and the audit index baseline); fixed, the four files rerun 72 pass, 0 fail                                                                                                                                                  |
| `bunx openspec validate --all --json`                                                                                    | exit 0; 297 items, 297 passed                                                                                                                                                                                                                                         |
| Burokrat `check-indexes working . HEAD`                                                                                  | exit 0                                                                                                                                                                                                                                                                |
| `bunx prettier --check` on every file this slice changed but the two SQL files (Prettier has no SQL parser)              | "All matched files use Prettier code style!", exit 0                                                                                                                                                                                                                  |

Not run: the h2puni gate, fe-01 and its browser e2e (`organization-context.real.spec.ts`
boots be-01 and activates afterwards, so the boot refusal does not reach it; not observed),
gw-01's suite, and the tool-devsync workspace tests. CI carries them.

### Review of PR #756 (Fable, high), how each item is addressed

Fixed on the same branch, 2026-10-26. Each new or changed check was watched failing with the
fault injected, then restored; the `Proof:` comment sits beside it.

| Item                                | Fix                                                                                                                                                                                                                 | Fault injected                            | Test that failed                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 equal secrets                     | `loadMcpServiceSettings` refuses any two equal among `INTERNAL_AUTH_SECRET`, `MCP_BE_INTERNAL_SECRET`, both grant keys                                                                                              | refusal disabled                          | `config.test.ts` `refuses any two equal secrets…` (did not throw)                                                                                                                                                |
| 2 grant outlives the rotated secret | the matched secret's expiry (`proofExpiresAt`) is a fourth term of the `exp` min                                                                                                                                    | term dropped; domain expiry answered null | `never outlives the rotated secret that minted it` (exp 1793077607 > 1793035007); domain `answers the matched secret's expiry…`                                                                                  |
| 3 `iat` in the future               | kept, now with 60 s tolerance                                                                                                                                                                                       | check removed                             | `machine-grant.test.ts` `refuses a grant issued more than 60 s in the future…` (verified)                                                                                                                        |
| 3 scalar `aud`                      | kept                                                                                                                                                                                                                | check removed                             | `refuses a grant whose audience is an array…` (verified)                                                                                                                                                         |
| 3 previous ≠ current                | kept                                                                                                                                                                                                                | guard disabled                            | `refuses a previous key equal to the current one` (imported)                                                                                                                                                     |
| 3 Proofs added                      | `typ` refusal, issuer mismatch, secret-shaped run, grant beside a cookie, `mcp-dedicated` excluding `x-internal-auth`, the `mcp-*` admission                                                                        | each check removed                        | `refuses an ID-JAG…` (200); `reports a different authorization server…` (200); `refuses a run…` (no 400); `refuses a grant beside a session cookie` (200); `answers a missing, wrong or gateway secret…` (twice) |
| 4 replica skew                      | `clockTolerance: 60`, `iat * 1000 > now + 60 000`; M3 gains the per-call `invalid_token`                                                                                                                            | as item 3                                 | `…admits one 30 s ahead`                                                                                                                                                                                         |
| 5 docs and plumbing                 | be-01 and mcp-01 `.env.example`; `deploy/k8s/wbs/overlays/local/kustomization.yaml` (lab-only placeholders); `tools/tool-remote-scripts/src/lib/docker.ts` be secrets and value rules; runbook step 2c and exit 8   | —                                         | `docker.test.ts` 128 pass                                                                                                                                                                                        |
| 6 `typ`                             | case-insensitive; echo capped at 64 printable characters                                                                                                                                                            | exact compare; no cap                     | `admits a lowercase jwt typ…` (401; full 102-character echo)                                                                                                                                                     |
| 6b key entropy                      | at least 10 distinct characters                                                                                                                                                                                     | check removed                             | `refuses a secret of too few distinct characters` (imported)                                                                                                                                                     |
| 7 fractional `exp`                  | floored                                                                                                                                                                                                             | floor removed                             | core `floors a fractional request…` (1793005800.7)                                                                                                                                                               |
| 8 touch on refusal                  | a grant request refuses a non-member before recording the use                                                                                                                                                       | refusal removed                           | `refuses an unknown, revoked, wrong or non-member key alike, recording no use` (last use recorded)                                                                                                               |
| 9 mcp-01 canonicalisation           | `http.ts` uses the contracts functions; `loadConfig` refuses an `MCP_PUBLIC_URL` whose derived issuer is not canonical                                                                                              | check removed                             | mcp-01 `config.test.ts` `refuses a public URL whose derived issuer is not canonical` (`…/mcp//` loaded)                                                                                                          |
| 10 JSDoc                            | `checkedRole` and `checkedTime` each under their own                                                                                                                                                                | —                                         | —                                                                                                                                                                                                                |
| 11 names                            | core `MachineGrantBounds`, be-01 `MachineGrantIssueRequest`; `GrantableMachineSource` in `@wbs/domain` reused                                                                                                       | —                                         | —                                                                                                                                                                                                                |
| 12 redaction                        | the grant keys join the logger's secrets; `NO_MACHINE_GRANTS` JSDoc corrected                                                                                                                                       | keys left out                             | `app.test.ts` `redacts the mcp-01 secret and the grant keys`                                                                                                                                                     |
| 13 forgery                          | the composed harness now verifies delegations with a real pair (a direct context it signs is admitted, 200); the forgery is signed with that pair's private key                                                     | — (the prior RS256-retry negative stands) | `refuses a grant signed with the delegation key…`                                                                                                                                                                |
| 14 mcp-01 stubs                     | `organization-authority.test.ts` stubs and comment use `internal_unauthorized`                                                                                                                                      | —                                         | —                                                                                                                                                                                                                |
| spec, design                        | spec requirement "A run shaped like a secret is refused"; M2 issuance codes; M3 HS256 and HMAC `kid`, 60 s skew, per-call `invalid_token`, the secret-expiry term, all three settings at activation; M14 the header | —                                         | `openspec validate wbs-mcp-agent-surface --strict` valid                                                                                                                                                         |

Results after the review fixes, at 7cb671ad9, `env -u CLAUDECODE`, `--skip-nx-cache`:
lint and typecheck for wbs-domain, core, store-sqlite, contracts, auth, be-01, mcp-01 and
tool-remote-scripts exit 0; `wbs-be-01:test` 3749 pass, 0 fail (3752 tests, 256 files);
`wbs-core` 1382 and `wbs-store-sqlite` 1999 pass, 0 fail; `wbs-domain`, `wbs-contracts`,
`wbs-auth`, `wbs-mcp-01` and `tool-remote-scripts` all pass, 0 fail (exit 0); `tool-deploy`
828 pass (the overlay changed); `openspec validate --all --json` exit 0; Burokrat
`check-indexes` exit 0; Prettier clean. Not run: the h2puni gate, fe-01 and its e2e, gw-01,
tool-devsync; nothing was done on the dev host.

### Re-review leftovers (2026-10-26)

| Item | Fix                                                                                                                                                                                                                                                        | Fault injected                                                | Test that failed                                                                                                                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | workload-assertion variant of the non-member test                                                                                                                                                                                                          | `members_only` refusal removed from `admitTrustedIssuerToken` | `refuses a non-member's assertion unknown_identity, recording no use` (last use recorded)                                                         |
| R2   | `WBS_MCP_AUTHORIZATION_SERVER` in be's `APP_ENV_ALLOWED_KEYS`; runbook's prod sentence corrected (secrets via `/srv/wbs/.env` and `SECRET_KEYS`, the server via `/srv/wbs/be-01.env`)                                                                      | entry deleted                                                 | `docker.test.ts` `passes be-01.env carrying the machine grant authorization server` (threw)                                                       |
| N1   | control character inside the first 64                                                                                                                                                                                                                      | replacement removed                                           | `admits a lowercase jwt typ, and echoes…` (raw BEL echoed)                                                                                        |
| N2   | the "Run scoping" requirement names the secret-shaped refusal                                                                                                                                                                                              | —                                                             | `openspec validate --strict`                                                                                                                      |
| N3   | `assertServiceSecretStrength` applies the floor to `MCP_BE_INTERNAL_SECRET` at boot; the activation CLI runs boot's checks (`machineGrantSettingsFaultsOf`: the secret's strength, the keys' import) and refuses `machine_grant_settings_invalid` (exit 8) | boot check removed; faults left out of `unready`              | `refuses a weak MCP_BE_INTERNAL_SECRET before opening storage` (booted); `refuses activation with a weak grant key or secret, naming it` (exit 0) |

Results at 4bf2f39b7: `wbs-be-01:test` 3752 pass, 0 fail (3755 tests); `wbs-core:test`
1382 pass, 0 fail; lint and typecheck for wbs-core, wbs-be-01 and tool-remote-scripts exit 0;
wbs-contracts, wbs-mcp-01 and tool-remote-scripts tests 0 fail; `openspec validate --all
--json` and Burokrat `check-indexes` exit 0.

**Open, pre-existing, not fixed here:** `WBS_DELEGATION_SIGNING_KEY` and
`WBS_DELEGATION_VERIFY_KEY` have the same gap in `tools/tool-remote-scripts/src/lib/docker.ts`:
neither is in be's `SECRET_KEYS` nor `APP_ENV_ALLOWED_KEYS`, so the prod swap cannot pass
them to be-01.

## Slice 2: the token endpoint at mcp-01 (tasks 2.1 to 2.3)

Built on branch `feat/wbs-mcp-token-endpoint-2` from the plan branch at e58d3cd4b (slice 1
merged), 2026-10-26 and 2026-10-27, on the assumed M1 to M16 as slice 1 amended them. Every
test below ran under `env -u CLAUDECODE` on the laptop; nothing ran on h2puni.

What landed:

- **2.1** `src/token-request.ts`: `parseMachineTokenRequest`, red first (commit 3ea765cf7 holds
  the test alone). Keys and assertions travel in `Concealed`, whose private field no printer
  reaches.
- **2.2** `src/machine-grant-client.ts` calls `POST /internal/mcp/machine-grants` with
  `x-mcp-internal-auth` and maps every answer; `McpOAuthServer.machineToken` (`src/oauth.ts`)
  signs the machine token; `MCP_BE_INTERNAL_SECRET` (config, redacted in `main.ts`) and
  `MCP_MACHINE_TOKEN_TTL`; the metadata (`src/http.ts`); registration refusing both grants; the
  `TokenEndpointLimit` seam and its 429.
- **2.3** the booted test's failure case, with be-01's report read from its log stream.

Tests: `token-request.test.ts` (parser), `machine-token.test.ts` (endpoint against a fake be-01:
mapping, lifetime, metadata, registration, 429, configuration),
`machine-token.boot.test.ts` (the SDK's `ClientCredentialsProvider` and a test-local JWT-bearer
client against be-01's composed grant route in its own process,
`apps/wbs/be-01/src/testing/mcp-machine-grant-backend.ts`, with a local trusted issuer), and one
`main.test.ts` case.

### Slice 2 notes (assumptions taken, and gaps in the design)

1. **The lifetime asked for.** M3 and M4 give the token `exp` 60 s before the grant and a TTL of
   60 s to 24 h; taken literally a 60 s TTL leaves a token no lifetime. mcp-01 asks be-01 for
   now + the jittered TTL + 60 s, so the token itself lives the jittered TTL, and a 24 h token
   fits be-01's 24 h + 60 s cap. A grant that leaves no lifetime after the margin (an assertion
   or a rotated secret ending within about a minute) is refused with the source's own error.
2. **When the grants are offered.** Only in standalone mode with `MCP_BE_INTERNAL_SECRET` set
   (`offersMachineGrants`); otherwise both answer `unsupported_grant_type` and the metadata omits
   them, which is also M11's grant half. The secret stays optional in mcp-01's config and is not
   yet seeded into dev's `.env` or the Kubernetes secret (task 8.2). `MCP_MACHINE_TOKEN_TTL` is
   read at boot either way.
3. **Client authentication details the design leaves open.** A `client_id` sent both by Basic and
   in the body is `invalid_request`. On the JWT-bearer grant a `client_assertion` is
   `invalid_client`, as on `client_credentials`, and Basic with an empty password only carries the
   `client_id`. Basic parts are not form-decoded: an id and a key hold only unreserved
   characters, and the SDK does not encode them.
4. **A mismatched `client_id`.** On `client_credentials` it is judged against the key's own id
   before be-01 is asked (`invalid_client`). On the JWT-bearer grant only the grant names the
   credential, so be-01 is asked (its audit row is written) and the mismatch is `invalid_grant`.
5. **Scope.** An empty `scope` is `invalid_scope`, as is a request whose scopes the grant does not
   hold (asked of be-01 first, since only the grant tells).
6. **Repetition.** Any parameter sent twice, or as a file, is `invalid_request`; a second
   `resource` is `invalid_target` (the spec's scenario).
7. **`typ` at mcp-01 too.** The parser refuses an unsupported `typ` before be-01 is asked; be-01's
   `unsupported_assertion_type` is the second line, mapped the same way and tested with a fake
   be-01.
8. **be-01 failing.** A 5xx or an unreachable be-01 is `503 temporarily_unavailable` with
   `Retry-After: 5`; be-01 reports its own failure. `internal_unauthorized`, an answer impossible
   for the source asked (`invalid_token` or a `typ` refusal for a key, `invalid_body` without a
   run, a grant for another credential than the key), and a malformed body throw
   `MachineGrantDefect`, and no client is told its credential is bad. _Amended by the review of
   PR #761 (S3):_ the defect is reported through mcp-01's redacting logger and answered `502
server_error`, no longer Bun's 500.
9. **Limits.** `TokenEndpointLimit` is the seam M10's limiters fill in task 4.2; production
   composes `NO_TOKEN_ENDPOINT_LIMITS` until then, and `sourceOf` still trusts the leftmost
   `X-Forwarded-For` (4.2). The 429 form is tested with a refusing limit.
10. **The token.** `sub` is the credential id; the claims carry `wbs_machine_grant`,
    `wbs_person`, `wbs_organization` and, when opted in, `wbs_run`, and the scopes also as the
    groups claim `/mcp` admission reads. It is signed with mcp-01's one access-token key, so
    section 3 tells machine tokens apart by `token_use`. Responses carry `Cache-Control:
no-store` (RFC 6749 §5.1). Route evidence records the two grant types by name and nothing
    else of the request.
11. **`/mcp`, `/refresh` and `/revoke` are section 3's.** Today a machine token at `/mcp` is 401:
    `verifyLocal` finds no session and the upstream verifier refuses it; nothing is forwarded.
    `/revoke` answers 200 and changes nothing. This slice takes **no** piece of section 3:
    admitting the token at `/mcp` without the grant-and-secret bearer and the refused set would
    be most of task 3.2. So three scenarios are tested only up to the token endpoint: "An SDK
    client gets a token and lists tools" (the `tools/list` half), "A run outlives its workload
    token" (the next tool call) and "A read-only credential cannot write" (the `insufficient_scope`
    refusal). Their server-side token halves are tested here.
12. **The provider-cache negative** of 2.2 ("make the provider cache its first assertion")
    belongs to `WorkloadJwtBearerProvider`, task 2.4. Here a test-local client reads a fresh
    assertion per request, and what the server enforces is tested: the first assertion, once the
    token it capped has expired, mints nothing.
13. **Registration** refuses a client whose `grant_types` names either machine grant; other
    unknown grant types keep today's behaviour.
14. **The 2.3 fault** is the booted backend's audit-row id generator throwing inside the grant
    route, for a Basic request and a JWT-bearer one. The report is be-01's log line, read from the
    backend's stdout. The audit rows and mcp-01's route evidence are checked too, by exact
    substring and the `plaintext-secrets` key pattern.
15. **A25's audience rule** (task 1.5) is still not applied; the fixture's trusted issuer uses
    audience `wbs`.

### Commands and results, slice 2

All on 2026-10-27 at f3fe2918f, with `env -u CLAUDECODE` and `--skip-nx-cache`:

| Command                                                                                     | Result                                                                   |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `bunx nx run-many -t typecheck lint -p wbs-mcp-01 wbs-be-01 --parallel=1`                   | exit 0                                                                   |
| `bunx nx run wbs-mcp-01:test`                                                               | 612 pass, 0 fail (24 files)                                              |
| `bunx nx run wbs-contracts:test`                                                            | 607 pass, 0 fail                                                         |
| `bunx nx run wbs-be-01:test`                                                                | 3752 pass, 3 skipped, 0 fail (3755 tests in 256 files, 1259.2 s), exit 0 |
| `bunx nx run tool-devsync:test`                                                             | 940 pass, 0 fail (49 files, 735.3 s), exit 0                             |
| `bunx openspec validate --all --json`                                                       | exit 0; 297 items, 297 passed                                            |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0 (the existing store-memory and plan-commands review debt)         |
| `bunx prettier --check` on every changed file but `.env.example`                            | "All matched files use Prettier code style!"                             |

Not run: the h2puni gate, fe-01 and its e2e, gw-01, and anything on the dev host. No
migration and no `libs/**/service/` file changed, so no pin test or `kinds.json` entry was due.

### Failure-proof table, slice 2

Each check was watched failing with the fault injected, then restored; the `Proof:` comment
sits beside the check. "Boot" is `machine-token.boot.test.ts`, "endpoint"
`machine-token.test.ts`, "parser" `token-request.test.ts`.

| Check                                                     | Fault injected                                                         | Test that observed it failing                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| repeated parameter                                        | only a second `resource` refused                                       | parser `refuses any repeated parameter or a file value invalid_request`                                          |
| second `resource` is `invalid_target`                     | answered `invalid_request`                                             | parser `refuses a missing, foreign, non-canonical or repeated resource invalid_target`                           |
| file value                                                | read as text                                                           | parser `refuses any repeated parameter or a file value invalid_request`                                          |
| malformed `Authorization`                                 | treated as absent                                                      | parser `refuses no secret, … or a malformed Basic header invalid_client` (body secret admitted)                  |
| two client authentication methods                         | check removed                                                          | parser `refuses two client authentication methods invalid_request`                                               |
| lone `client_assertion` is `invalid_client`               | answered `invalid_request`                                             | parser, both `client_assertion` tests                                                                            |
| `client_id` in Basic and body                             | check removed                                                          | parser, both "sent twice" tests                                                                                  |
| `client_credentials` needs a secret                       | check removed                                                          | parser `refuses no secret, …` (invalid_request)                                                                  |
| no secret on the JWT-bearer grant                         | branch removed                                                         | parser `refuses a Basic secret, a body secret and a client_id sent twice invalid_request`                        |
| canonical `resource`                                      | comparison removed                                                     | parser `refuses a missing, foreign, …`                                                                           |
| scope                                                     | default answered for any scope                                         | parser `refuses wbs:editor, an unknown or empty scope invalid_scope`, `narrows to a requested subset…`           |
| `wbs_run` length                                          | upper bound removed                                                    | parser `refuses an empty or over-long run invalid_request`                                                       |
| key grammar                                               | any secret admitted                                                    | parser `refuses no secret, … a non-key secret …`                                                                 |
| `client_id` equals the key's id                           | comparison removed                                                     | parser `refuses a client_id other than the key’s id invalid_client`                                              |
| assertion required                                        | missing assertion judged by its header                                 | parser `refuses a missing assertion invalid_request` (invalid_grant)                                             |
| `typ`                                                     | every `typ` admitted                                                   | parser `refuses an ID-JAG, an access token or any other typ…`                                                    |
| `typ` echo cap                                            | cap removed                                                            | parser `echoes at most 64 printable characters of a typ`                                                         |
| carrier's private field                                   | public field                                                           | parser `never prints the key or the assertion` (`inspect`, `Bun.inspect`)                                        |
| grant dispatch                                            | dispatch removed                                                       | boot: 15 tests                                                                                                   |
| no settings, `unsupported_grant_type`                     | answered `invalid_grant`                                               | endpoint `answers unsupported_grant_type without the machine grant settings`                                     |
| limit                                                     | check removed                                                          | endpoint `answers 429 invalid_request with Retry-After…`                                                         |
| one `invalid_client` for every key failure                | `invalid_grant` for a revoked key (2.2's negative)                     | boot `an unknown id, a revoked key and a wrong secret…`, `nothing is issued…`                                    |
| JWT-bearer `client_id` equals the grant's credential      | comparison removed                                                     | boot `a client_id the registered-client store has never seen…`                                                   |
| `client_id` never looked up (2.2's negative, raw request) | lookup in the registered-client store                                  | boot: that test and four more (401)                                                                              |
| scope narrowing                                           | requested scopes kept                                                  | boot `a key bound to a viewer gets wbs:read only`                                                                |
| empty narrowed scope                                      | check removed                                                          | endpoint `narrows to the grant’s scopes, and refuses a request beyond them…`                                     |
| `exp` 60 s before the grant                               | the grant's `exp`                                                      | boot: SDK, GitHub Actions and run-outlives tests                                                                 |
| no lifetime left                                          | check removed                                                          | endpoint `refuses a grant that leaves no lifetime after the 60 s margin`                                         |
| jitter                                                    | none                                                                   | endpoint `lowers the lifetime by at most 10 %…`, `sends the key with the dedicated secret…`                      |
| asks 60 s more                                            | dropped                                                                | the same two                                                                                                     |
| `no-store`                                                | headers removed                                                        | endpoint `expires 60 s before the grant…`                                                                        |
| registration refuses machine grants (2.2's negative)      | check removed; body `none` with a loopback redirect                    | endpoint `refuses a client that asks for a machine grant` (201)                                                  |
| grant for the key's own credential                        | comparison removed                                                     | endpoint `throws a defect, never a refusal…`                                                                     |
| Basic challenge                                           | header removed                                                         | endpoint `maps unknown_identity and not_activated to invalid_client…`                                            |
| evidence names the grant                                  | `other` recorded                                                       | endpoint `records the grant type, and nothing else…`                                                             |
| no fall-through to upstream (2.2's negative)              | upstream verifier called on a refusal                                  | boot `an assertion for an unknown subject…`, `nothing is issued…`, `an unknown id, a revoked key…`               |
| `MCP_MACHINE_TOKEN_TTL` bounds                            | bounds removed                                                         | endpoint `reads MCP_MACHINE_TOKEN_TTL as 60 s to 24 h…`                                                          |
| dedicated secret header                                   | sent as `x-internal-auth`                                              | endpoint `sends the key with the dedicated secret…`                                                              |
| unreachable be-01                                         | rethrown                                                               | endpoint `answers 503 temporarily_unavailable…`                                                                  |
| be-01 5xx                                                 | thrown as a defect                                                     | the same                                                                                                         |
| `invalid_token` only for an assertion                     | admitted for a key                                                     | endpoint `throws a defect, never a refusal…`                                                                     |
| `typ` refusal only for an assertion                       | admitted for a key                                                     | the same                                                                                                         |
| `invalid_body` only with a run                            | condition removed                                                      | the same (invalid_request)                                                                                       |
| issued shape                                              | check skipped                                                          | the same (`scopes: ['admin']` answered invalid_scope)                                                            |
| `not_activated` is a refusal                              | dropped                                                                | boot `nothing is issued: invalid_client for a key, invalid_grant for an assertion`                               |
| `MCP_BE_INTERNAL_SECRET` length                           | `'string'`                                                             | endpoint `refuses a short MCP_BE_INTERNAL_SECRET…`                                                               |
| gateway offers no machine grant                           | mode test removed                                                      | endpoint `omits them without the secret and in gateway mode`                                                     |
| metadata lists them conditionally                         | always listed                                                          | the same                                                                                                         |
| the secret is redacted                                    | left out of `secrets`                                                  | `main.test.ts` `redacts the machine grant secret with the other boundary secrets`                                |
| 2.3: no form in be-01's report                            | be-01's route rethrows with the body in the message ("form in report") | boot `a failure inside be-01’s grant route leaks no key, Basic form or assertion` (the key found in be-01's log) |

### Review of PR #761 (Fable, high), how each item is addressed

Fixed on the same branch, 2026-10-27. Each new or changed check was watched failing with the
fault injected, then restored; the `Proof:` comment sits beside it.

| Item   | Fix                                                                                                                                                                                                                                                                                                                      | Fault injected                                                                                                                                     | Test that failed                                                                                                                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1     | `mcpOAuthFromEnv` tested both ways; `machineToken` also refuses outside standalone mode (`MCP_AUTH_MODE` now reaches `McpOAuthServer`)                                                                                                                                                                                   | condition `machineSecret === undefined` alone; the mode test removed                                                                               | `composes machine grants from the environment in standalone mode only` (composed in gateway mode); `answers unsupported_grant_type in gateway mode, even with the settings`                                                                            |
| S2     | be-01 answers `no_lifetime` `401 unknown_identity`, which mcp-01 maps to the credential's refusal                                                                                                                                                                                                                        | `invalid_body` restored                                                                                                                            | be-01 `refuses a key in the last part-second of its rotation window unknown_identity`                                                                                                                                                                  |
| S3     | `MachineGrantDefect` caught in `machineToken`, reported through `reportFault` (composed in `main.ts` with the redacting policy), answered `502 {"error":"server_error"}` with no-store                                                                                                                                   | rethrown; the policy built with `[]`                                                                                                               | `answers a be-01 fault 502 server_error and reports it, never a refusal` (and two more); `main.test.ts` `reports a machine grant fault redacted`                                                                                                       |
| S4     | a grant whose `expiresAt` exceeds the request, or whose `runId` differs from the run sent, is a defect                                                                                                                                                                                                                   | each comparison removed                                                                                                                            | `answers a be-01 fault 502…`                                                                                                                                                                                                                           |
| N1     | tests for an empty Basic user, a JWT-bearer Basic without a colon, an empty assertion, a non-text `typ`, a 403 `typ` refusal and one naming no `typ`; an empty `MCP_MACHINE_TOKEN_TTL` stays the default, because `loadConfig` reads every empty mcp-01 variable as unset (`config.ts`), now stated beside it and tested | `basic === null` alone; colon check removed; `=== ''` dropped; `String(typ)`; the 401 condition dropped; the `typ !== undefined` condition dropped | `reads a Basic header with an empty user…`; `refuses a Basic header without a colon invalid_client`; `refuses a missing or empty assertion invalid_request`; `refuses a typ that is not text, naming it as JSON`; `answers a be-01 fault 502…` (twice) |
| N2     | consent tokens carry `token_use: consent`; a token naming mcp-01's issuer that fails local verification is never handed to `verifyUpstream` (`refuseOwnToken`); design M5 records what section 3 requires                                                                                                                | the claim removed; the rethrow removed                                                                                                             | `exchanges one authorization code for an audience-bound local token…` (oauth.test.ts); `never hands a machine token to the upstream verifier` (one upstream call)                                                                                      |
| N3     | be-01 refuses, `invalid_token`, an assertion whose `iss` is `WBS_MCP_AUTHORIZATION_SERVER`                                                                                                                                                                                                                               | refusal removed                                                                                                                                    | be-01 `refuses an assertion naming mcp-01’s own issuer invalid_token` (grant issued)                                                                                                                                                                   |
| N4     | recorded below                                                                                                                                                                                                                                                                                                           | —                                                                                                                                                  | —                                                                                                                                                                                                                                                      |
| N5     | recorded below (not changed)                                                                                                                                                                                                                                                                                             | —                                                                                                                                                  | —                                                                                                                                                                                                                                                      |
| N6     | design M3: narrowing is enforced by mcp-01's token scope only; section 3 must refuse before be-01                                                                                                                                                                                                                        | —                                                                                                                                                  | —                                                                                                                                                                                                                                                      |
| N7     | only a `TypeError` carrying a system error `code` is be-01 unreachable (503); any other fetch failure is a defect (502), its cause left out because its message may quote the secret header                                                                                                                              | every `TypeError` read as unreachable                                                                                                              | `answers 502 for a secret fetch cannot carry in a header…`, `answers a be-01 fault 502…`                                                                                                                                                               |
| N8     | the Proof comment's stray parenthesis fixed                                                                                                                                                                                                                                                                              | —                                                                                                                                                  | —                                                                                                                                                                                                                                                      |
| design | M3 (TTL + 60 s, `no_lifetime`, the 502, defects for a longer grant or another run, narrowing), M4 (TTL + 60 s), M5 (`token_use`, the reserved issuer)                                                                                                                                                                    | —                                                                                                                                                  | `openspec validate --strict`                                                                                                                                                                                                                           |

Results at 3ed536cc3, 2026-10-27, `env -u CLAUDECODE`, `--skip-nx-cache`: typecheck and lint
for wbs-mcp-01 and wbs-be-01 exit 0; `wbs-mcp-01:test` 620 pass, 0 fail; `wbs-contracts:test`
607 pass, 0 fail; `wbs-be-01:test` 3754 pass, 3 skipped, 0 fail (3757 tests, 256 files);
`tool-devsync:test` 940 pass, 0 fail; `openspec validate --all --json` 297/297; Burokrat
`check-indexes` exit 0; Prettier clean. Two earlier tool-devsync runs failed 43 and then 14
tests, all in `performance-level.test.ts`, with `listen EADDRINUSE :::9100`: another
session's performance run held that port. Run alone with the port free, the file passed 67/0,
and the full suite then passed. Not run: the h2puni gate, fe-01 and its e2e, gw-01.

Two existing `oauth.test.ts` expectations changed with N2: a revoked consent token at `verify`
is now refused by its local failure (`MCP OAuth session is missing, expired, or revoked`), no
longer by the upstream verifier's `not an upstream token`.

Recorded, not changed:

- **N4.** be-01 writes the `machine_token_issued` row (and touches `last_used_at`) before
  mcp-01 judges the grant, so a request mcp-01 then refuses still leaves one: a JWT-bearer
  `client_id` other than the grant's credential, a narrowed scope the grant does not hold, a
  grant with no lifetime left after the margin, or a grant mcp-01 reads as a defect. The row
  names the credential and run only, and stays within the per-day bound.
- **N5.** An unfetchable trusted issuer key set is `invalid_token` inside
  `admitTrustedIssuerToken` (the verdict `key_set_unavailable` becomes the same refusal as an
  invalid token, as the `/api` spec requires), so mcp-01 answers `invalid_grant`, not `503`.
  Telling them apart needs a new `AuthenticationRefusal` variant through `@wbs/core`, its
  `/api` callers and the grant contract: more than this review's scope. The failure is
  reported by be-01's key set reporter either way.
- **N3's registration half.** The reservation is enforced at grant issuance only; the trusted
  issuer route does not yet refuse registering `WBS_MCP_AUTHORIZATION_SERVER`, because the
  core route is not composed with it. Such a registration admits no grant.

## Slice 3: `/mcp` admission at mcp-01 (tasks 3.1, 3.2, 3.4, 3.5 and 3.7)

Built on branch `feat/wbs-mcp-admission-3` from the plan branch at 25b60f291 (slices 1 and 2
merged), 2026-10-27, on the assumed M1 to M16 as slices 1 and 2 amended them. Task 3.3 waits
for Dany's M1 choice and task 3.6 is a dev check after deploy; neither is here. Every test
below ran under `env -u CLAUDECODE` on the laptop; nothing ran on h2puni.

What landed:

- **3.1** `McpOAuthServer.admitUpstream` (`src/oauth.ts`): at the activated epoch no upstream
  token is admitted, and `bearerFor` throws for a sessionless caller instead of forwarding.
  Before it, be-01 activated beside mcp-01's epoch 0 is `ActivationMarkersDisagree`, a
  reported `McpDeploymentFault` (`src/deployment-fault.ts`) answered `502 server_error`.
- **3.2** `McpOAuthServer.admitCaller` dispatches on the verified `token_use`;
  `src/machine-admission.ts` holds `machineIdentityOf`, the per-replica
  `RefusedMachineTokens` and the per-request `MachineCaller`; `server.ts` `callAsMachine`
  presents the grant with `MCP_BE_INTERNAL_SECRET` and maps be-01's refusals; `http.ts` turns
  a machine caller's outcome into the request's HTTP answer. `/revoke` answers a machine token
  `400 unsupported_token_type`.
- **3.4** `buildRequest` (`src/wbs-client.ts`) refuses an empty, `.` or `..` path value
  (`dot_segment`) and a URL that does not parse back to the expanded template
  (`route_changed`), both `ToolInputRefused` before any be-01 request.
- **3.5** `authenticateCaller` (`src/caller-auth.ts`) refuses a `token_use: machine` JWT in
  gateway mode.
- **3.7** `mcpServiceHeaderOf` (`src/organization-authority.ts`): the dedicated secret alone
  whenever it is set, else `INTERNAL_AUTH_SECRET`; `mcpOAuthFromEnv` composes organization
  authority from either. be-01 already admitted either on `/internal/mcp/*` (slice 1); its
  test now covers `/internal/mcp/delegation` too.

Tests: `machine-admission.test.ts` (fake be-01: the grant on the wire, a second replica with
store spies, scope narrowing, revocation per call, per batch and per replica, the secret and
key faults, expiry, `token_use`, `/revoke` and refresh, gateway mode, the refused set),
`machine-admission.model.test.ts` (`fc.asyncModelRun`, below), `machine-admission.boot.test.ts`
(the headless flow against be-01's composed routes in their own process), and additions to
`wbs-client.test.ts`, `oauth.test.ts`, `credential-epoch.test.ts`,
`organization-authority.test.ts`, `organization-delegation.boot.test.ts`, `machine-token.test.ts`,
`main.test.ts` and be-01's `machine-grant.controller.db.test.ts`.

### Slice 3 notes (assumptions taken, and gaps in the design)

1. **The HTTP answer of a tool call's refusal.** M3 wants HTTP 401 or 502 for some be-01
   answers, but a tool handler runs inside the SDK's transport, which answers 200. The
   `MachineCaller` in `AuthInfo.extra` records the outcome and `mcpHttpResponse` replaces the
   JSON-RPC body after the transport answered. The 502 wins over the 401, and a batch gets one
   answer (design M3 now says so). The secret is a private field, so no printer reaches it.
2. **Which 401s are which on a machine call.** `unknown_identity` is the credential's refusal;
   `unknown_grant_key` and `invalid_token` are the grant's (401, re-fetch); every other 401
   code, `internal_unauthorized` and an unexpected `unauthenticated` among them, is a
   deployment fault (502). A Basic-gate 401 stays the existing `EdgeGate` tool error.
3. **Where the markers are compared (M13).** Only on `/mcp`, before forwarding an upstream
   token at epoch 0, through `POST /internal/mcp/organizations`, which costs one be-01 call per
   such request (design M13 now says so). be-01 refusing the token there is `401`. The consent
   callback is not checked: `organization-delegation.boot.test.ts` deliberately runs mcp-01 at
   epoch 0 beside an activated be-01, and a pre-activation session's unbound family still
   forwards its upstream token until the epoch advance revokes it, refused by be-01
   `no_active_organization`. Left as it is, because the runbook advances the epoch first.
4. **A fault reporter is required with organization authority**, since the markers fault must
   be reported: `McpOAuthServer` refuses to start without one, and `main.ts` composes one
   reporter for every `McpDeploymentFault` (`MachineGrantDefect` is now one). Its log line is
   `MCP deployment fault`.
5. **Machine admission needs the machine grant settings.** A machine token is admitted only in
   standalone mode with `machineGrants` composed, because its be-01 calls need the secret they
   carry (`MachineGrantSettings.secret`, new). Elsewhere it is 401.
6. **`token_use` on the consent path.** An absent `token_use` stays admitted. Removing that,
   once consent tokens issued before slice 2 have expired (one `MCP_ACCESS_TOKEN_TTL` after
   that release), is a follow-up; nothing here dates it.
7. **`/revoke` for a machine token** is refused even when expired, as long as its signature
   verifies; an unverifiable token keeps RFC 7009's 200. Refresh with a machine token as the
   refresh token is `invalid_grant` by the store's own lookup; tested, no new code.
8. **The secret cutover in mcp-01.** "mcp-01 sends only the new secret" is read as: the
   dedicated secret alone whenever `MCP_BE_INTERNAL_SECRET` is set, and
   `INTERNAL_AUTH_SECRET` only where it is not yet seeded (dev's mcp-01 is not, slice 2 note 2).
   Either secret now composes organization authority, in gateway mode too, so a deployment
   with only the dedicated secret keeps consent working after release N+1.
9. **Path refusals.** A value of three or more dots names a row and is sent; only `.` and `..`
   are dot segments. The route check compares `new URL(url).pathname` with
   `WBS_API_URL`'s own path plus the expanded template, so a path prefix is kept.
10. **The refused set's bound.** Each refusal drops the entries whose token has expired, so the
    set holds at most the refused tokens still alive; it is never a store (M5). How many
    tokens one credential can have alive is bounded only by M10's per-credential issuance
    limit, which arrives with task 4.2; until then the bound is the token endpoint's rate.
11. **The e2e test names the person.** Main's #758 (`claimWorkItem` defaults `personId` to the
    caller) is not in the plan branch at 25b60f291 (`git merge-base --is-ancestor` said no), so
    `machine-admission.boot.test.ts` claims with `personId: 'claire'`, and also shows a claim
    for another person of the account refused.
12. **The rotation fixture.** The booted backend gains `POST /__fixture/rotate-grant-key`,
    which replaces the grant key and keeps no previous one: a rotation that dropped
    `_PREVIOUS` early.
13. **The SDK and batches.** MCP SDK 1.31.0 accepts a JSON-RPC batch at `/mcp` and runs its
    calls concurrently (observed in the batch tests), as design M3 assumed.
14. **The model test's own trap.** Its first draft drew the expiry as often as a call, so most
    runs expired at once and one sabotage (a secret fault entered into the refused set) passed.
    Calls are now weighted eight to one, and the run counts every branch it reached.
15. **Not in slice 3:** M10's limits (`sourceOf` still trusts the leftmost `X-Forwarded-For`,
    task 4.2), the human-only tool policy (5.1), run scoping (1.6), and the hosted-connector
    check (3.6). A `wbs_mk_` key on `/mcp` stays 401 through the JWT decode (M11).

### Commands and results, slice 3

All on 2026-10-27 at 87f5cf80b (the docs commit after it changes no code), with
`env -u CLAUDECODE` and `--skip-nx-cache`:

| Command                                                                                     | Result                                                                   |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `bunx nx run-many -t typecheck lint -p wbs-mcp-01 wbs-be-01 --parallel=1`                   | exit 0                                                                   |
| `bunx nx run wbs-mcp-01:test`                                                               | 649 pass, 0 fail (27 files)                                              |
| `bunx nx run wbs-contracts:test`                                                            | 607 pass, 0 fail                                                         |
| `bunx nx run wbs-be-01:test`                                                                | 3755 pass, 3 skipped, 0 fail (3758 tests in 256 files, 1262.2 s), exit 0 |
| `bunx nx run tool-devsync:test`                                                             | 940 pass, 0 fail (49 files, 741.2 s), exit 0; no port 9100 clash         |
| `bunx openspec validate --all --json`                                                       | exit 0; 297 items, 297 passed                                            |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0 (the existing store-memory and plan-commands review debt)         |
| `bunx prettier --check` on every changed file but `.env.example`                            | "All matched files use Prettier code style!"                             |

Not run: the h2puni gate, fe-01 and its e2e, gw-01 (untouched), and anything on the dev host.
No migration and no `libs/**/service/` file changed, so no pin test or `kinds.json` entry was
due.

### Failure-proof table, slice 3

Each check was watched failing with the fault injected, then restored; the `Proof:` comment
sits beside it. "Unit" is `machine-admission.test.ts`, "model"
`machine-admission.model.test.ts`, "boot" `machine-admission.boot.test.ts`, "delegation boot"
`organization-delegation.boot.test.ts`.

| Task | Check                                                                | Fault injected                                                                       | Test that observed it failing                                                                                               |
| ---- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | no upstream token after activation (3.1's negative)                  | the fallback restored: epoch refusal, markers check and `bearerFor` throw removed    | delegation boot `an Auth0 token on /mcp is 401 once both markers are set…` (200) and the markers test (200)                 |
| 3.1  | epoch refusal alone                                                  | removed                                                                              | delegation boot `an Auth0 token on /mcp is 401…` (502)                                                                      |
| 3.1  | markers disagree is a fault                                          | check removed                                                                        | delegation boot `a raw upstream Bearer is a reported fault while the markers disagree` (200)                                |
| 3.1  | a deployment fault is 502                                            | mapped to 401                                                                        | the same (401)                                                                                                              |
| 3.1  | `bearerFor` never forwards a sessionless token                       | throw removed                                                                        | `credential-epoch.test.ts` `never forwards a sessionless token after activation`                                            |
| 3.2  | machine dispatch                                                     | removed                                                                              | boot: all five tests after activation (401)                                                                                 |
| 3.2  | the grant with the secret (forward the access token)                 | the access token as the bearer                                                       | unit `presents the grant with the secret, and never the access token`                                                       |
| 3.2  | machine call branch                                                  | removed                                                                              | unit: six tests (no secret sent; consent mapping)                                                                           |
| 3.2  | no store read (read the epoch)                                       | `credentialEpoch()` in `admitMachine`                                                | unit `is answered by a second replica sharing only the keys and the secret, reading no store`                               |
| 3.2  | be-01 rereads per call (3.2's cache negative)                        | be-01 `identity.ts` caching the admission per presented grant                        | boot `revocation at the next call…` (the call succeeded after revocation)                                                   |
| 3.2  | refused set consulted (skip the refused set)                         | check skipped                                                                        | unit revocation and batch tests (200); model                                                                                |
| 3.2  | refused set filled on `unknown_identity`                             | `credentialRefused()` dropped                                                        | unit revocation and batch tests (200); model                                                                                |
| 3.2  | a secret mismatch never enters the set                               | `credentialRefused()` beside the fault                                               | unit `answers a missing or wrong secret 502…, and keeps the token once the secret is fixed` (401); model                    |
| 3.2  | a key fault never enters the set                                     | `credentialRefused()` beside `grantRejected()`                                       | model                                                                                                                       |
| 3.2  | one set per replica                                                  | one set shared by both replicas                                                      | model                                                                                                                       |
| 3.2  | `unknown_grant_key` is HTTP 401 (3.2's rotation negative)            | `grantRejected()` dropped (a tool error)                                             | unit `answers a grant be-01 cannot verify 401 invalid_token…` (200); boot `answers a key rotation 401 invalid_token…` (200) |
| 3.2  | the outcome replaces the HTTP answer                                 | mapping removed                                                                      | unit secret and key tests (200)                                                                                             |
| 3.2  | `internal_unauthorized` reported, not re-fetched (1.2's mcp-01 half) | be-01 answering a missing or wrong secret `unknown_grant_key`                        | boot `a wrong service secret is a reported fault, 502, never a re-fetch` (401)                                              |
| 3.2  | machine admission only where composed                                | mode test removed                                                                    | unit `refuses a machine token where no machine admission is composed` (admitted in gateway mode)                            |
| 3.2  | a machine token needs its grant                                      | grant read as optional                                                               | unit `refuses a machine token without its grant…` (`Bearer undefined` sent, 200)                                            |
| 3.2  | consent path refuses another `token_use`                             | refusal removed                                                                      | `oauth.test.ts` `refuses a consent session token of any use but consent` (admitted)                                         |
| 3.2  | `/revoke` answers `unsupported_token_type`                           | refusal removed                                                                      | unit `answers unsupported_token_type for a machine token at /revoke…` (200)                                                 |
| 3.2  | the fault reporter is redacted                                       | policy built with `[]`                                                               | `main.test.ts` `reports a deployment fault redacted`                                                                        |
| 3.4  | dot segments refused                                                 | refusal removed                                                                      | `wbs-client.test.ts` `refuses an empty, "." or ".." path value before any be-01 request`                                    |
| 3.4  | sent pathname equals the template (3.4's negative)                   | encoder replaced by the identity function: refused; then the route check removed too | `refuses a value that would move the route` passed with the check, failed without it (`/api/claims` sent)                   |
| 3.5  | gateway refuses `token_use: machine` (3.5's negative)                | branch removed                                                                       | unit `refuses a machine token in gateway mode, forwarding nothing` (200, be-01's fake recorded the call)                    |
| 3.7  | mcp-01 sends the dedicated secret alone                              | `INTERNAL_AUTH_SECRET` preferred                                                     | `organization-authority.test.ts` `sends only the dedicated secret once it is configured`                                    |
| 3.7  | either secret composes organization authority                        | `INTERNAL_AUTH_SECRET` alone, as before                                              | `machine-token.test.ts` `composes machine grants from the environment in standalone mode only` (gateway asked no reporter)  |
| 3.7  | be-01 admits either secret on `/internal/mcp/delegation`             | `mcp-internal` admitting one secret only, each way                                   | be-01 `admit either secret on /internal/mcp/delegation` (and the `credentials/ended` test)                                  |

The model property (seed 20261027, 100 runs of up to 14 commands) failed under each of the
five refused-set sabotages above and passes restored; its run asserts every branch was
reached (a refused call, a refused request, a secret fault, a key fault, a batch split by the
revocation).

### Review of PR #764 (Fable, high), how each item is addressed

Fixed on the same branch, 2026-10-27. Each new or changed check was watched failing with the
fault injected, then restored (each restore checked byte for byte); the `Proof:` comment sits
beside it. "Unit" is `machine-admission.test.ts`.

| Item           | Fix                                                                                                                                                                                                                                                                                                        | Fault injected                                       | Test that failed                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1             | `admitUpstream` reports any failure of the markers check as an `McpDeploymentFault` (502); `OrganizationAuthorityDefect` now extends `McpDeploymentFault` (also N4)                                                                                                                                        | the catch rethrowing                                 | unit `answers 502 and reports a fault when be-01 cannot answer the markers check` (be-01's 503: no fault reported); the same test covers a refused fetch |
| S2a            | kept the `refused` refusal                                                                                                                                                                                                                                                                                 | line removed                                         | unit `refuses an upstream token be-01 refuses at the markers check, forwarding nothing` (200, forwarded)                                                 |
| S2b            | 502 wins over 401                                                                                                                                                                                                                                                                                          | `deploymentFault` keeping an earlier outcome (`??=`) | unit `answers a batch meeting a key fault and a secret fault 502` (401)                                                                                  |
| S2c            | malformed `wbs_run` refused                                                                                                                                                                                                                                                                                | check removed                                        | unit `refuses a machine token whose run claim is not text` (200 for `''` and `5`)                                                                        |
| S3             | task 3.8 (dated by the slice-2 release reaching each deployment, owner named) and design M5                                                                                                                                                                                                                | —                                                    | —                                                                                                                                                        |
| S4             | `bearerFor`'s throw applies in standalone mode only; gateway keeps forwarding; design M13                                                                                                                                                                                                                  | mode condition removed                               | `credential-epoch.test.ts` `keeps forwarding in gateway mode after activation` (rejected)                                                                |
| N1             | design M3 and the mcp-01 README: writes must be idempotent under retry; semantics unchanged                                                                                                                                                                                                                | —                                                    | —                                                                                                                                                        |
| N2             | note 10 names task 4.2 as the bound's dependency                                                                                                                                                                                                                                                           | —                                                    | —                                                                                                                                                        |
| N3             | `verify()` uses `machineClaimsOf`, building no `MachineCaller`                                                                                                                                                                                                                                             | — (refactor; the unit and boot suites pass)          | —                                                                                                                                                        |
| N5             | `redirect: 'manual'` in `callTool` and the grant client (`FetchLike` gains `redirect`)                                                                                                                                                                                                                     | redirects followed                                   | `wbs-client.test.ts` and `machine-token.test.ts` `never follows a redirect…` (the other origin received `x-mcp-internal-auth`)                           |
| N5 (re-review) | `redirect: 'manual'` in `organizationAuthority`'s `post` too; a 3xx is then unmodeled (`OrganizationAuthorityDefect`), a reported 502 at `/mcp` (the markers outage test gains a 307 case). The three be-01 fetches in mcp-01 (`callTool`, the grant client, `post`) now all refuse redirects, as M14 says | redirects followed in `post`                         | `organization-authority.test.ts` `never follows a redirect, so the secret stays with be-01` (the other origin received `x-mcp-internal-auth`)            |
| design         | M13: runbook step 2b and `mcp_epoch_not_advanced`, the outage case, gateway; M14: dedicated secret alone when set, legacy until seeded, gateway composes organization authority too, no redirects                                                                                                          | —                                                    | `openspec validate --strict`                                                                                                                             |

Results after the review fixes, 2026-10-27, `env -u CLAUDECODE`, `--skip-nx-cache`: typecheck
and lint for wbs-mcp-01 exit 0; `wbs-mcp-01:test` 657 pass, 0 fail; `wbs-contracts:test` 607
pass, 0 fail; `tool-devsync:test` 940 pass, 0 fail (723.2 s); `openspec validate --all --json`
297/297, and `--strict` for this change exit 0; Burokrat `check-indexes` exit 0; Prettier
clean. be-01 is untouched by these fixes, so its suite was not rerun (3755 pass at 87f5cf80b).
Not run: the h2puni gate, fe-01 and its e2e, gw-01.

During these proofs one injection script failed to restore its files; the four sites were
repaired by hand from the intended text, the unit file rerun green (19 pass), and every later
injection used a script that compares the restored file byte for byte.

## Failure-proof table

Slice 1 rows. Each check was watched failing with the fault injected, then restored; the
`Proof:` comment sits beside the check.

| Check                                           | Fault injected                                                 | Test that observed it failing                                                                                                                               | Result                                 |
| ----------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| grant variant: pool expiry                      | expiry check removed (`admitMachineCredential`)                | core `machine-grant.test.ts`: `refuses a pool credential at and after its expiry`, the never-admits property                                                | 2 fail                                 |
| grant variant: no consent credential            | consent half answering false                                   | `never admits a consent credential, whose sessions take delegations instead`                                                                                | 1 fail                                 |
| grant variant: person, organization, credential | each comparison removed in turn                                | `refuses a grant naming another person, organization or credential`                                                                                         | 1 fail each                            |
| grant variant: membership                       | role predicate removed                                         | `refuses a credential whose account is no longer a member…`, the property (after its generators were weighted; it first passed, caught by the example only) | 2 fail, three runs                     |
| down.sql guard                                  | filter replaced by `WHERE 0`                                   | `machine-token-audit-migration.db.test.ts`: `refuses rollback over one machine-token audit row…`                                                            | named refusal absent                   |
| run key coalesce                                | dropped from the index and `RUN_KEY` together                  | `machine-token-audit.db.test.ts`: `writes one row per run and UTC day…`                                                                                     | 2nd and 3rd no-run answered `recorded` |
| UTC day                                         | `date(created_at)` in the index and `RUN_DAY_KEY`              | same test, plus the 150-run test (150 rows)                                                                                                                 | all six `recorded`                     |
| overflow stop                                   | stop disabled                                                  | `writes 100 run rows and one overflow row for 150 runs…`; the model property                                                                                | 150 run rows                           |
| overflow key                                    | `(credential, created_at)` in the index and `OVERFLOW_DAY_KEY` | same; the model property                                                                                                                                    | 50 overflow rows                       |
| targeted insert vs `INSERT OR IGNORE`           | run insert as `INSERT OR IGNORE`                               | `throws on a CHECK violation…`, `throws on a row-id collision…`                                                                                             | both resolved                          |
| targeted vs untargeted conflict                 | `ON CONFLICT DO NOTHING`                                       | `throws on a row-id collision under a different key`                                                                                                        | resolved                               |
| recount inside the turn                         | count read outside and reused                                  | model property (`fc.asyncModelRun`, seed 20261026): `[IssueOne(r4), IssueRacing(r0, r1)]`                                                                   | 101st run row                          |
| read first                                      | early return removed                                           | `answers a seen run without taking the write turn`; mounted `answers a token request while a batch holds the write turn…`                                   | `pending`                              |
| activation                                      | check removed (`machineGrantAuthority`)                        | `machine-grant.controller.db.test.ts`: `issues nothing before activation`                                                                                   | 200 with a grant                       |
| secret code on `/internal/mcp/*`                | `internal_unauthorized` → `unknown_grant_key`                  | `answers a missing, wrong or gateway secret internal_unauthorized`                                                                                          | wrong code (be-01 half)                |
| grant needs the secret                          | check removed (`delegatedOrSession`)                           | `refuses a grant without the secret, or with a wrong one…`                                                                                                  | 200                                    |
| reread at every call                            | per-credential cache filled at first use                       | `is refused unknown_identity at the next call after its credential is revoked`                                                                              | 200 after revoke                       |
| nothing consumed per call                       | `jti` consume around the grant verifier                        | `writes nothing per call: 100 reads…`                                                                                                                       | 401 on a later read                    |
| exact audience dispatch                         | former dispatch (all but direct to via-mcp-01)                 | `delegation.controller.db.test.ts`: `refuses a gateway, grant or unknown audience invalid_token`                                                            | `unauthenticated`                      |
| grant keys alone                                | RS256 retry against a delegation key                           | `refuses a grant signed with the delegation key under the current grant kid`                                                                                | 200 for the forgery                    |
| no assertion `jti` consume                      | `(iss, jti)` consume before admission                          | `admits one Kubernetes token, one jti, from three processes`                                                                                                | 200, 401, 401                          |
| boot refusal                                    | refusal disabled                                               | `machine-grant.boot.db.test.ts`: `refuses an activated store without the machine grant settings…`                                                           | boot resolved                          |
| boot composition                                | `machineGrantComposition` omitted                              | `issues a grant once activated and admits it on the next call`                                                                                              | 401                                    |
| activation preflight                            | grant settings left out of `unready`                           | `organization-activation-cli.db.test.ts`: both machine-grant-settings cases                                                                                 | exit 0, not 8                          |
| previous key needs current                      | guard disabled                                                 | `config.test.ts`: `refuses a previous grant key without a current one`                                                                                      | loaded                                 |
| canonical authorization server                  | reproduction check dropped                                     | `mcp-authorization-server.test.ts`, `config.test.ts`                                                                                                        | uppercase host admitted                |

## Section 4: limits and the source address (tasks 4.1 and 4.2)

Built on branch `feat/wbs-mcp-limits-4` from the plan branch at d652a4cfa (slices 1 to 3
merged), 2026-10-27, on the assumed M10 as slices 1 to 3 amended it. Every test below ran
under `env -u CLAUDECODE` on the laptop; nothing ran on h2puni, and no host was touched. Task
4.3 (load evidence) is not part of this branch.

What landed:

- **4.1** `src/token-bucket.ts`: a pure bucket level (`levelAt`, `retryAfterOf`) and
  `TokenBuckets`, one bucket per key on an injected clock, with `take` (refuses when empty),
  `give` (a reservation not used; `spend` was replaced after the review of PR #765), `takeEach`
  (all or none) and a sweep of full buckets. `src/in-flight-counter.ts`: `InFlightCounter`, a per-key ceiling with an
  idempotent release. Fake-clock properties in `token-bucket.test.ts`; the counter is shared
  across async requests, so `in-flight-counter.model.test.ts` drives it through `/mcp` with
  `fc.asyncModelRun`.
- **4.2** `src/source-address.ts`: `sourceAddressOf`, the `X-Forwarded-For` entry
  `MCP_TRUSTED_PROXY_HOPS` from the right, or the socket address with 0. The variable is
  required by `loadConfig` (0 to 9) in both modes; `oauth.ts` reads the source once per request
  for registration, authorization and the token endpoint, and the leftmost-entry `sourceOf` is
  gone. `src/machine-limits.ts`: `MachineTrafficLimits` with M10's six limits
  (`M10_LIMITS`), composed by `mcpOAuthFromEnv`; `NO_MACHINE_LIMITS` replaces
  `NO_TOKEN_ENDPOINT_LIMITS` for tests that are not about M10. `MachineCaller.admitCall`
  (`machine-admission.ts`) counts each `tools/call` message (`server.ts`), and `http.ts` answers
  a request whose only answer is a limited call `429`.
- **Deployments.** `MCP_TRUSTED_PROXY_HOPS` is set where the repository shows the topology
  (note 12), and `assertMcpEnv` (`tools/tool-devsync/src/sync.ts`) and
  `bin/dev-mcp-preflight.sh` now require it in dev's `.env`.

### Section 4 notes (assumptions taken, and gaps in the design)

1. **A source the proxies did not write.** Fewer `X-Forwarded-For` entries than the hops, an
   entry at that position that is no IP address, or 0 hops with no socket address: the request
   counts under one shared source, `unattributed`, rather than being refused or attributed to a
   guess. It is limited more tightly, never trusted more. The registration census reads the
   same source, so the old `unknown` source is now `unattributed`. The configuration itself is
   never defaulted: a missing or invalid `MCP_TRUSTED_PROXY_HOPS` refuses boot, in gateway mode
   too, because the OAuth routes count by source there as well.
2. **What a failed authentication is.** Every machine-grant answer `invalid_client` or
   `invalid_grant`: be-01's credential refusals, a `client_id` that is not the grant's
   credential, a grant left with no lifetime, and the parser's own (`not-a-key` secrets,
   malformed Basic, a `client_assertion`, a refused `typ`). Other refusals (`invalid_request`,
   `invalid_scope`, `invalid_target`, 5xx) are not counted.
3. **The `client_id` of the pair.** For `client_credentials` it is the key's own credential id,
   so a stranger sending wrong secrets for a public id fills the pair bucket of that id and
   their own address. For the JWT-bearer grant it is the `client_id` when one is sent; without
   one, and for a request the parser refused, only the per-source buckets count.
4. **The order at the token endpoint** (rewritten after the review of PR #765, S1, and its
   re-review, B1). The request is parsed first (it reads nothing), so the `client_id` is known.
   Then, before be-01 is asked:
   - the failure buckets are **read**: per source, and per `(client_id, source)` when it names a
     credential;
   - one of the source's **pending slots** is taken (`pendingIssuancesPerSource`, 100, the
     per-source issuance burst; refused `429` with `Retry-After: 1`);
   - one **issuance per source** is taken.
     The outcome settles the reservation once, from a `finally` for every path that did not, and
     always ends the pending slot. A signed grant takes one issuance of the credential be-01
     verified; a failed authentication spends the failure buckets (floored at zero) and gives the
     issuance back; anything else gives the issuance back.
   - _Why read, not reserve, the failures._ Reserving them (fa37fa65a) capped a source's
     legitimate concurrency at the failure burst: 5 concurrent requests per credential and
     source, 30 per source, so a 100-pod rollout behind one egress address got 95 `429`s with a
     12 s wait the helper's 10 s budget cannot absorb. Reading them lets concurrent failures pass
     one check together; the pending cap bounds that: **at most 30 + 100 failed requests per
     source (5 + 100 per credential and source) reach be-01 once per drain; afterwards the
     design rate**. A failure is spent into debt down to `-pendingIssuancesPerSource` (re-review
     S5): flooring at zero lost all but one of the spends of requests that passed the read
     together, so each refilled token reopened the fence for another pending cap (6000 in ten
     minutes in the test, against 30 a minute). With the debt, every passed failure is counted,
     the bucket refills from below zero, and its `Retry-After` includes the repayment. The fence
     still reopens in bursts: once a token is back, up to the pending cap can pass the read
     together, and their debt then holds it shut for about the cap over the rate (200 s per
     source). Over any window T, at most 30 + 100 + 30/min × T failures per source reach be-01
     (400 in the test's ten minutes, bound 430). Within one reopening the burst is the pending
     cap, not one token: holding it to one would mean reserving, which B1 removed. The pending
     cap is not the issuance bucket: that refills while be-01 is slow. A negative level only
     enters `levelAt` (which refills from it and caps at the burst), `retryAfterOf` (a longer
     wait) and the sweep (which drops only full buckets); `give` is never used on a failure
     bucket.
   - _N1._ The per-credential issuance is taken only after be-01 verified the credential, so a
     claimed public id answers `429` only to the key's holder; a stranger sees `401`.
   - _Dropped grants._ Requests for one credential from many sources at once can reach be-01
     beyond its burst, and the grants the per-credential limit then refuses are dropped
     unsigned. Each has had be-01's work done: the day's `machine_token_issued` row written or
     found (M3) and `last_used_at` touched; no token exists for it, so the row records an
     issuance asked, not a token held. Each source contributes at most its 100 pending slots.
5. **Bucket shapes.** "5 / min" and "30 / min" are bursts of 5 and 30 refilled over a minute;
   "300 / min, burst 100" refills 5 a second; `tools/call` "10 / s, burst 20" refills 10 a
   second. A `Retry-After` is the whole seconds until one token, at least 1.
6. **The `/mcp` refusal form.** M10 says `/mcp` refusals are HTTP `429`; the spec's batch
   scenario says the calls beyond the burst answer 429-shaped tool errors while the rest run.
   Both hold: a limited call is the tool error `<tool> could not be called: rate_limited (429).
Retry after N s.` (or `too_many_in_flight`), and a request that ran no call and whose one
   JSON-RPC answer is a limited call is HTTP `429` with `Retry-After` and `{"error":
"rate_limited"}`. A batch keeps its 200 and its array. A message limited by the rate, or
   by the in-flight limit after it, still spends a rate token: the bucket bounds messages sent
   (review N2).
7. **In-flight waits** have no rate to compute from; the wait asked is 1 s.
8. **Who is limited on `/mcp`.** Machine callers only (the requirement bounds machine traffic);
   consent sessions are not counted.
9. **Raw keys on `/mcp`.** M10 counts "any raw key on `/mcp`" as a failure, but no raw-key
   admission exists (Dany's option (ii) was not taken; a `wbs_mk_` bearer stays `401` through
   the JWT decode, M11), so nothing there is counted.
10. **No knobs.** The six values are `M10_LIMITS`, constants; tests pass other rates to the
    constructor. Making them environment settings waits for a need.
11. **Memory and slice 3's note 10.** A full bucket is dropped by a sweep that runs at most once
    per full-refill interval, so the maps hold only keys touched within about two intervals; an
    in-flight key is dropped when its count returns to zero. The refused set is now bounded:
    one replica signs at most 100 + 5 × lifetime tokens per credential, so with the default 12 h
    TTL at most 216,100 refused tokens per credential are alive on a replica. That bound is
    real but loose; the per-source success limit binds the same number per address.
12. **Hop counts per environment**, counting only what the repository proves:
    - prod and staging (`deploy/k8s/wbs/overlays/{prod,staging}`): **1**, the Traefik Ingress.
      Whatever stands in front of Traefik (a load balancer, a CDN) is not in the repository and
      is not counted; if it exists, its address is what mcp-01 counts, which is tighter, not
      looser.
    - the dev-environment Pod (`overlays/dev/pod.yaml`): **1**, the lab's Ingress.
    - the local lab (`overlays/local`): **0**. No Ingress there reaches mcp-01, so the socket
      address is read.
    - dev on h2puni (`deploy/dev-src/compose.yml`): its mcp-01 reads the host's gitignored
      `apps/wbs/mcp-01/.env`, which this branch cannot change. The value is **1**:
      `deploy/compose/site-dev.caddy.candidate` writes `X-Forwarded-For {remote_host}` on both
      MCP handles, one Caddy hop. **Before merging, `MCP_TRUSTED_PROXY_HOPS=1` must be seeded in
      `/home/puni1/wbs-dev/src/apps/wbs/mcp-01/.env`**: devsync's `assertMcpEnv` and the
      preflight now refuse a deploy without it, and mcp-01 refuses to boot. The cutover list in
      `docs/auth-integration.md` names it. Whether the live `site-dev.caddy` is the candidate was
      not checked (no host was touched); any Caddy in front is one hop either way.
    - a laptop (`.env.example`, copied by `bun run dev:setup`): **0**.
    - Hop counting cannot judge a request that bypasses the proxies (a Pod port reached inside
      the cluster): its header is the client's own words. That is the design's limit, not
      changed here.
    - A shared source is one source (review N3). Clients behind one NAT or carrier-grade NAT,
      and every client if dev's Caddy ever sees a Docker or IPv6-to-IPv4 SNAT address rather
      than the client's, share one address's buckets: 30 failures a minute and 100 issuances at
      once among them. An IPv6 client is counted per full address, so a host with a /64 can
      spread across addresses; no prefix grouping is done.
13. **The in-flight model** (concurrency rule): states are, per organization, the calls be-01
    holds; events are a request of one to four concurrent calls and a held call ending with a
    success, a 500 or a thrown fetch, in any order; the invariants are in the test's comment.
    Its five sabotages and the unit test's sixth are in the table below.
14. **`client_id` length** (review S2). It becomes a bucket key, so the parser refuses one over
    256 characters `invalid_request` (`client_id must have at most 256 characters`), in Basic or
    the body, for both grants.
15. **A be-01 call that never answers** (review S3). Each tool call's be-01 fetch, body
    included, is bounded by `BE_CALL_TIMEOUT_MS` (35 s) combined with the MCP request's
    `extra.signal` (`AbortSignal.any`), and raced against that signal so a fetch that ignores
    its signal cannot hold the slot. 35 s is above be-01's own bound: Elysia's Bun server closes
    a connection idle for 30 s (`idleTimeout: 30`, read in `node_modules/elysia`; be-01 sets
    none), and be-01's solver and optimization work runs in the background, not inside a
    request. A timeout is `BeCallTimedOut`: neither the caller's credential (never a 401) nor a
    network error (a `TimeoutError` has no system error code, slice 2's N7), so it is reported
    through the unexpected tool failure reporter and answered as that call's tool error with a
    reference; the batch's other answers stand. A cancelled request is `ToolCallCancelled`, a
    plain tool error, not reported. In stateless mode it is effectively unreachable: the SDK
    does not abort a handler when the HTTP connection drops, and an MCP cancellation would
    arrive on another request and transport, so the timeout is the operative bound (review D2).
    A timed-out or cancelled call may already have been applied by be-01; the client cannot
    tell, so the rule for a 401 or 502 that replaced a batch's answers applies: writes must be
    idempotent under retry (review D1). The grant client's own fetch at the token endpoint has
    no timeout yet; it holds a pending slot and a reservation, and is task 4.4.

### Commands and results, section 4

All on 2026-10-27, code as at the head of this branch, with
`env -u CLAUDECODE` and `--skip-nx-cache`:

| Command                                                                                     | Result                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bunx nx run-many -t typecheck lint -p wbs-mcp-01 tool-devsync --parallel=1`                | exit 0                                                                                                                                                                               |
| `bunx nx run wbs-mcp-01:test`                                                               | 709 pass, 0 fail (32 files) after S5 and its pair negative (705 after B1, 700 after the review, 692 before); the model, limits and bucket files 39 pass, 0 fail in each of five runs |
| `bunx nx run tool-devsync:test`                                                             | 941 pass, 0 fail (49 files, 707.7 s), exit 0; no port 9100 clash (before the review fixes, which touch no tool-devsync file)                                                         |
| `bunx openspec validate --all --json`                                                       | exit 0; 297 items, 297 passed                                                                                                                                                        |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0                                                                                                                                                                               |
| `bunx prettier --check` on every changed file but `.env.example`                            | "All matched files use Prettier code style!"; `shellcheck bin/dev-mcp-preflight.sh` exit 0                                                                                           |

Not run: the h2puni gate, wbs-be-01's and wbs-contracts' tests (neither changed), fe-01 and its
e2e, gw-01, task 4.3's load evidence, and anything on a host. No migration and no
`libs/**/service/` file changed, so no pin test or `kinds.json` entry was due.

### Failure-proof table, section 4

Each check was watched failing with the fault injected, then restored; the `Proof:` comment
sits beside it. "Limits" is `machine-limits.test.ts`, "model" `in-flight-counter.model.test.ts`
(seed 20261027), "bucket" `token-bucket.test.ts`.

| Task | Check                                        | Fault injected                                                                                                                             | Test that observed it failing                                                                                                                                                                                       |
| ---- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.2  | source from the right (4.2's negative)       | leftmost entry, `entries[0]`                                                                                                               | limits `counts a rotating spoofed first entry…, and refuses after 30`; three `source-address.test.ts` cases                                                                                                         |
| 4.2  | separate buckets (4.2's negative)            | (first commit) failures spent in the issuance buckets; after S1: failure tokens kept on a success, or the issuance token kept on a failure | limits `a stranger's wrong secrets…` and four more; after S1 `one address issues 100 tokens for a pool of 100…` and `one credential issues 100 staggered…`, and `a failure gives the address's issuance token back` |
| 4.2  | per message (4.2's negative)                 | `admitCall` asks the limits for a request's first call only: counting HTTP requests                                                        | limits `a batch of 30 calls runs 20 and limits 10`, `answers a single limited call 429…`, the in-flight test                                                                                                        |
| 4.2  | a limited call is refused                    | the limited branch in `server.ts` ignored                                                                                                  | the same three                                                                                                                                                                                                      |
| 4.2  | single limited call is HTTP 429              | mapping removed (`http.ts`)                                                                                                                | limits `answers a single limited call 429 with Retry-After, and asks be-01 nothing` (200)                                                                                                                           |
| 4.2  | admission before be-01                       | check removed (rewatched after S1)                                                                                                         | `machine-token.test.ts` `answers 429 invalid_request with Retry-After…`; eight limits tests                                                                                                                         |
| 4.2  | per-credential issuance after be-01 verified | take removed (rewatched after S1)                                                                                                          | limits `refuses the 101st issuance of one credential at once, from any address`, `answers a stranger 401, never 429…`                                                                                               |
| 4.2  | be-01 refusals count                         | count removed (rewatched after S1)                                                                                                         | limits: four tests                                                                                                                                                                                                  |
| 4.2  | parser refusals count                        | count removed (rewatched after S1)                                                                                                         | limits `counts a secret the parser refuses, never asking be-01, as a failure too`                                                                                                                                   |
| 4.2  | production composes the limits               | `NO_MACHINE_LIMITS`-shaped object in `mcpOAuthFromEnv`                                                                                     | limits `composes M10's limits from the environment`                                                                                                                                                                 |
| 4.2  | the socket address reaches the OAuth routes  | `null` passed for the peer in `mcpFetchHandler`                                                                                            | `http.test.ts` `hands the OAuth routes the socket's address, which MCP_TRUSTED_PROXY_HOPS=0 reads`                                                                                                                  |
| 4.2  | `MCP_TRUSTED_PROXY_HOPS` required            | key optional                                                                                                                               | `config.test.ts` `refuses a missing or invalid MCP_TRUSTED_PROXY_HOPS, naming it`                                                                                                                                   |
| 4.2  | dev `.env` needs the key (devsync)           | key dropped from `MCP_REQUIRED_ENV`                                                                                                        | `sync.test.ts` `requires exactly one durable in-container MCP store path`                                                                                                                                           |
| 4.2  | dev `.env` needs the key (preflight)         | key dropped from the script's list                                                                                                         | `mcp-preflight.test.ts` `refuses an MCP environment without MCP_TRUSTED_PROXY_HOPS`                                                                                                                                 |
| 4.1  | in-flight ceiling                            | `count > limit`                                                                                                                            | model, `[Send(org-a, 1), Send(org-a, 3)]`: be-01 held four                                                                                                                                                          |
| 4.1  | release decrements                           | release deletes the key's whole count                                                                                                      | model, `[Send(org-a, 1), Send(org-a, 1)]`: the second release threw                                                                                                                                                 |
| 4.1  | per organization                             | one counter for every organization (`machine-limits.ts`)                                                                                   | model, `[Send(org-b, 1), Send(org-a, 3)]`                                                                                                                                                                           |
| 4.1  | slot held for the call                       | release before the call (`server.ts`)                                                                                                      | model, `[Send(org-a, 1), Send(org-a, 3)]`                                                                                                                                                                           |
| 4.1  | slot freed however the call ends             | release only after a call that did not fail                                                                                                | model, `[Send(org-b, 3), End(org-b, throw), Send(org-b, 1)]`                                                                                                                                                        |
| 4.1  | idempotent release                           | guard removed                                                                                                                              | `in-flight-counter.test.ts` `admits up to the limit per key, and a second release frees nothing`                                                                                                                    |
| 4.1  | burst cap                                    | cap removed                                                                                                                                | bucket `admits at most the burst at once, however long the bucket sat idle`                                                                                                                                         |
| 4.1  | Retry-After suffices                         | `Math.floor`                                                                                                                               | bucket `admits a fresh key its whole burst at once, then refuses with a wait that suffices`                                                                                                                         |
| 4.1  | clock stepping back                          | floor at 0 removed                                                                                                                         | bucket `gains nothing from a clock that steps back`                                                                                                                                                                 |
| 4.1  | sweep                                        | never sweeps                                                                                                                               | bucket `holds only the keys touched within two full-refill intervals`                                                                                                                                               |
| 4.1  | (withdrawn) all or none                      | `takeEach` removed with the failure reservation (re-review B1)                                                                             | —                                                                                                                                                                                                                   |
| 4.1  | a spend spends a part-filled bucket          | `spend` restored after the re-review (B1); stored only with a whole token                                                                  | bucket `counts a spend on a part-filled bucket, so the part is spent too`                                                                                                                                           |

Two first drafts proved nothing and were fixed before the proofs above: the bucket's
total-admissions bound passed with the burst cap removed (an idle bucket's excess only shows in
one instant), and the part-filled spend test waited too little to tell the two apart.

### Review of PR #765 (Fable, high), how each item is addressed

Each fix's negative was watched failing with its fault injected, then restored; the `Proof:`
comment sits beside it.

| Item        | Fix                                                                                                                                         | Fault injected                                                                                                        | Test that observed it failing                                                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 failures | pessimistic reservation before be-01 (`reserveIssuance`), note 4 and design M10 rewritten                                                   | the first commit's read-then-spend order (`oauth.ts`, `machine-limits.ts`, `token-bucket.ts` restored from db1709542) | limits `lets at most 30 of 100 concurrent wrong keys from one source reach be-01`: 100 reached                                                                                                          |
| S1 issuance | the per-source issuance is reserved too                                                                                                     | the same                                                                                                              | limits `lets at most the burst of 300 concurrent issuances for one credential from one source reach be-01`: 300 reached                                                                                 |
| S1 refunds  | success gives failures back; failure gives the issuance back; anything else gives all back (`finally`)                                      | each give removed in turn; the `finally` removed                                                                      | `one address issues 100 tokens…` and `one credential issues 100 staggered…`; `a failure gives the address's issuance token back`; `gives every token back when be-01 is unavailable`                    |
| S2          | parser refuses a `client_id` over 256 characters `invalid_request`                                                                          | check removed                                                                                                         | `token-request.test.ts` `refuses a client_id over 256 characters invalid_request`                                                                                                                       |
| S3          | 35 s `AbortSignal.timeout` with `extra.signal`, raced (note 15); `BeCallTimedOut` reported as a tool error, `ToolCallCancelled` a plain one | race removed; the timeout rethrown raw; the cancel left unmapped                                                      | limits `frees the in-flight slot of a call be-01 never answers, after the timeout` and `wbs-client.test.ts` `throws BeCallTimedOut… and ToolCallCancelled once cancelled` (hung, then failed the class) |
| S4          | design M10 drops "any raw key on `/mcp`"; the raw-key count lives under "If Dany chooses (ii)"                                              | — (text)                                                                                                              | —                                                                                                                                                                                                       |
| N1          | fixed: the per-credential issuance is counted only after be-01 verified the credential                                                      | the per-credential bucket reserved at admission                                                                       | limits `answers a stranger 401, never 429, for a credential whose issuances are spent`                                                                                                                  |
| N2          | note 6 and the `admitCall` comment: an in-flight-limited message still spends a rate token                                                  | — (text)                                                                                                              | —                                                                                                                                                                                                       |
| N3          | note 12: the SNAT, NAT and IPv6 shared-source caveat                                                                                        | — (text)                                                                                                              | —                                                                                                                                                                                                       |

One added check proved nothing and was removed rather than kept: a cap in `TokenBuckets.give`
passed with the cap removed, because `levelAt` already caps every read.

### Re-review of PR #765 at fa37fa65a (Fable, high), how each item is addressed

Each negative was watched failing with its fault injected, then restored; the `Proof:` comment
sits beside it. The lower-bound tests were also run against fa37fa65a's `oauth.ts`,
`machine-limits.ts` and `token-bucket.ts`, restored for the run.

| Item                   | Fix                                                                                                                                                   | Fault injected                             | Test that observed it failing                                                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1                     | failure buckets read, not reserved; spent on a failure (`spend` back, floored at 0); a per-source pending cap of 100; note 4 and design M10 rewritten | fa37fa65a's code (failure tokens reserved) | limits `admits 100 concurrent issuances of one credential from one source` (5 × 200, 95 × 429) and `…of distinct credentials from one source` (30 × 200, 70 × 429)                                                  |
| B1 lower bounds        | the wrong-key tests assert asked ≥ 30 and ≤ 30 + 100 (D3); the 300-issuance test asserts exactly 100 asked                                            | fa37fa65a's code                           | the 100- and 500-wrong-key tests and the 300-issuance test                                                                                                                                                          |
| B1 pending cap         | `InFlightCounter` per source, `Retry-After: 1`                                                                                                        | cap removed                                | limits `holds a source to the pending cap while be-01 is slow, even once its issuances refill` (200 asked; the 500-key test alone passed without it, since the issuance bucket bounds a burst that does not refill) |
| B1 failure read        | refused when a failure bucket is empty                                                                                                                | read removed                               | limits: six tests, the spoofed-header scenario among them                                                                                                                                                           |
| B1 failure spend       | a failure spends both failure buckets                                                                                                                 | spend removed                              | the same six                                                                                                                                                                                                        |
| B1 refunds (rewatched) | issuance given back on a failure; per-credential take after be-01; `finally` release                                                                  | each removed in turn                       | `a failure gives the address's issuance token back`; `refuses the 101st issuance…` and `answers a stranger 401…`; `gives every token back when be-01 is unavailable`                                                |
| B1 spend               | part-filled spend spends the part                                                                                                                     | stored only with a whole token             | bucket `counts a spend on a part-filled bucket, so the part is spent too`                                                                                                                                           |
| D1                     | note 15 and the README: a timed-out or cancelled call may have been applied; writes idempotent under retry                                            | — (text)                                   | —                                                                                                                                                                                                                   |
| D2                     | note 15: cancellation is effectively unreachable in stateless mode; the timeout is the bound                                                          | — (text)                                   | —                                                                                                                                                                                                                   |
| grant-client timeout   | recorded as task 4.4                                                                                                                                  | —                                          | —                                                                                                                                                                                                                   |

`takeEach` went with the failure reservation; its proof row above is withdrawn. The bucket's
admissions bound now counts what was given back.

### Re-review of PR #765 at 36bd6ee5b, S5

| Item     | Fix                                                                                                                                                                     | Fault injected                                                                                                                         | Test that observed it failing                                                                                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S5       | `spend` floors at `-debt`; the failure buckets carry `pendingIssuancesPerSource` of debt; note 4 and design M10 reworded ("once per drain; afterwards the design rate") | 36bd6ee5b's `token-bucket.ts` and `machine-limits.ts` (floor at 0); the floor alone set to 0; the per-source bucket built without debt | limits `holds a source to the design failure rate over ten minutes of concurrent wrong keys`: 6000 asked on 36bd6ee5b (400 now, bound 430); bucket `carries a spend below zero down to its debt…`              |
| S5 pair  | the `(client_id, source)` bucket carries the same debt                                                                                                                  | pair bucket built without debt                                                                                                         | limits `holds one credential id and source to the pair failure rate over ten minutes of concurrent wrong secrets`: 400 asked (100 now; bounds at least 50, the pair rate over 600 s, and at most 5 + 50 + 100) |
| S5 guard | a negative or non-finite debt is refused at construction                                                                                                                | check removed                                                                                                                          | bucket `refuses a negative or unbounded debt`                                                                                                                                                                  |

The reviewer's proposed negative, "20 s of refill after the first overshoot admits at least 1 and
at most 10", cannot hold with the failure fence read rather than reserved: right after the
overshoot the debt admits 0 for about 140 s, and when a token is back the pending cap passes the
read together (100 in one instant). The test asserts the long-window bound instead, with a lower
bound (at least the design rate over the window), and was watched failing on 36bd6ee5b's code.

## Slice 5: parity, the audience rule (now) and run scoping (tasks 1.4, 1.5 "Now", 1.6)

Built on branch `feat/wbs-mcp-run-scoping-5` from the plan branch at 743808fa3 (slices 1 to 4,
and main with #758, #762 and #763), 2026-10-27, on the assumed M1 to M16. Every test below ran
under `env -u CLAUDECODE` on the laptop; nothing ran on h2puni.

What landed:

- **1.4** `CredentialAuthentication`'s machine variant and `CredentialPin`'s person variant gain
  `runId?`; `machinePrincipalOf` takes the run, and `admitMachineGrant` passes the grant's
  (`PresentedMachineGrant.runId`). A raw key, a trusted-issuer token on `/api` and a consent
  carry none. The parity test (`machine-grant-run.controller.db.test.ts`) claims through a grant
  and through the raw key on `/api` in the composed harness.
- **1.5, Now** `isUnderMcpAuthorizationServer` in `@wbs/contracts` (equal, or under it after a
  `/`). A new registration's audience and an `oidc` credential's narrowing must meet it, else
  `400 audience_not_wbs`. Stored rows are not judged and keep verifying. The preflight is
  `trusted-issuer-audience-check-cli.ts` over `checkTrustedIssuerAudiences`
  (`@wbs/store-sqlite`). The canonicalisation move (`oauth.ts`, `http.ts`) and the boot check
  of `WBS_MCP_AUTHORIZATION_SERVER` had already landed in slice 1 (slice 1 review item 9).
- **1.6** `ClaimStore.renewLeases(personId, runId | null, now)`, the conformance case
  `claims.lease:run-scoped`, and both adapters. Also: the heartbeat route and the batch renewal
  read the pin's run; `ClaimCaller.pinnedRunId`; the domain's `claimRunOf` (stamp or
  `run_mismatch`) and the run-scoped `decideRelease`; `run_mismatch` in `refusal.ts`, the
  work-item 403 refusals, the command bindings, fe-01 `plan-refusal.ts`, and the
  `claimWorkItem` and `releaseWorkItem` descriptions. No migration.

### Slice 5 notes (assumptions taken, and gaps in the design)

1. **The test-only seam (1.4, M9).** Until slice 7, `/api` itself still admits raw keys, so
   the seam needs no code of its own yet. The parity test runs on `OrganizationHarness`, the
   production composition in `src/testing`. `production-entrypoint.test.ts` already keeps that
   tree unreachable from `main.ts` and every `src/*-cli.ts`, the new preflight CLI included.
   Slice 7 gives the seam its raw-key admission when `/api` starts refusing.
2. **1.4's negative is seen earlier than the lease.** Since #758, a claim without `personId`
   defaults to the acting person. With `personId` left out of the grant principal, the grant's
   claim is refused `person_required` (or `credential_not_for_person` when it names the person),
   so the lease assertion is never reached. The parity case still reddens, and so does every
   other case of the file.
3. **`run_mismatch` is a 403**, beside `credential_not_for_person`, because the design names
   no status. In `claimWorkItem` it is judged right after the identity refusals, as M15 says. A
   lead's claim for a worker keeps its `runId`, and a lead's release of a worker's claim is
   judged without a run.
4. **#758 and the stamp.** With `personId` absent, the claimant is the acting person. For a
   grant that is the pinned person, so its run is stamped (tested). The run is never compared
   for another claimant.
5. **No-run claims belong to every run of the person** (amended after the review of PR #768,
   S3-1; an assumption Dany may reverse). Two reasons: there is no compatibility burden before
   users, and release already treats them so. A run-scoped renewal renews the `(person, run)`
   leases and the person's no-run leases. A claim by the run on a step the person holds with
   no run answers `alreadyHeld`, without restamping it. Adding a step beside such a claim
   still counts a bound claim for the cap, because the run is another triple.
6. **The heartbeat's standing is scoped too.** `{ leases, leaseExpiresAt }` counts the run's
   leases and the person's no-run leases when the caller has a run; with no run, it counts
   every lease of the person.
7. **Undo stays per person (#753).** The be-01 test shows run `a` undoing its person's latest
   entry, which run `b` wrote, while the human's stack holds only its own entry (M16).
8. **The audience root reaches fe-01 (1.5).** `GET /api/organization/trusted-issuers` now
   answers `audienceRoot`, and fe-01 suggests `<audienceRoot>/org/<organization id>` in place
   of `wbs:org:<id>`, which the rule would refuse. The design named no carrier for it.
   `audienceRoot` is read only for an active organization, and boot refuses an activated store
   without the setting, so a null there throws (`activeAudienceRoot`).
9. **Where the rule is judged.** A registration is judged after the store's role and gate
   check (a member learns nothing) and before discovery (nothing is fetched). A narrowing is
   judged once the organization resolves and before the store write. So a member naming a
   foreign agent with a bad audience hears `audience_not_wbs` before `forbidden`; the root is
   public metadata.
10. **The preflight has no write mode.** Stored rows are never rewritten (M2), so "a dry run
    by default" is the only mode. Its rules:
    - it lists registrations whose audience is null or breaks the rule, and unrevoked `oidc`
      credentials whose effective audience (their own, else their registration's) breaks it;
    - judged against the candidate's own setting, it also shows what a changed issuer breaks;
    - a row is accepted only by its own id (the most restrictive reading), so naming a
      registration does not accept its credentials;
    - it exits 3 while any listed row is not accepted.

    Wiring it into the Compose candidate container, the Kubernetes schema Job and the deploy
    CLI's `--accept-breaking` is task 8.2.

11. **The model test's race excludes the sweep.** A claim queued before a sweep meets a lease
    that the sweep then takes, which is an ordering, not a race outcome.
    `claim-lease-race.db.test.ts` already races the sweep. The new model races a heartbeat
    of one run against a claim of another (or the same) run, in both orders.
12. **Not reviewed by eye.** The fe-01 change is the suggested audience and the hint text
    only. It was tested in jsdom and not viewed in a browser.

### Commands and results, slice 5

All on 2026-10-27 with `env -u CLAUDECODE` and `--skip-nx-cache`, at f26169c25 (code) and the
fixture commit after it:

| Command                                                                                                                                                    | Result                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t typecheck lint -p wbs-domain wbs-contracts wbs-core wbs-store-sqlite wbs-store-memory wbs-conformance wbs-be-01 wbs-fe-01 wbs-mcp-01` | exit 0                                                                                                                                                                                                                                                                                                                                                                            |
| `bunx nx run wbs-be-01:test`                                                                                                                               | 3781 pass, 0 fail, 3 skipped (3784 tests, 259 files, 1429 s)                                                                                                                                                                                                                                                                                                                      |
| `bunx nx run-many -t test -p wbs-store-sqlite wbs-core --parallel=1`                                                                                       | core 1383 pass, 0 fail. store-sqlite 1999 pass, 1 fail, 1 skipped: `StepNodeAttemptRepository > refuses a start that waited…` missed its 5 s cross-process deadline while be-01's suite ran beside it; the file alone, 14 pass, 0 fail                                                                                                                                            |
| `bunx nx run-many -t test -p wbs-domain wbs-contracts wbs-conformance wbs-store-memory --parallel=1`                                                       | 1357 pass (3 skipped), 609, 35 and 237 pass; 0 fail                                                                                                                                                                                                                                                                                                                               |
| `bunx nx run wbs-mcp-01:test`                                                                                                                              | 711 pass, 0 fail                                                                                                                                                                                                                                                                                                                                                                  |
| fe-01, both project-target runs through `bun node_modules/vitest/vitest.mjs`                                                                               | UTC: 4654 pass, 7 fail of 4661. One was this slice's (`organization-page.test.tsx` stubbed the list without `audienceRoot`), fixed: 30 pass. The six others (`app-fault`, `machine-credentials-panel` source selection, two `sso-connections-panel`, `project-page`, `project-settings-modal`) fail identically at the base 743808fa3 under this runner. Auckland: 5 pass, 0 fail |
| `bunx nx run tool-devsync:test`                                                                                                                            | 966 pass, 7 fail at the base: the seven `boot-commit convergence after reset` cases (from main) wrote an `mcp.env` without slice 4's `MCP_TRUSTED_PROXY_HOPS`. Fixed in the fixture; `sync.test.ts` 63 pass, 0 fail                                                                                                                                                               |
| `bunx openspec validate --all --json`                                                                                                                      | exit 0; 301 items, 301 passed                                                                                                                                                                                                                                                                                                                                                     |
| Burokrat `check-indexes working . HEAD`                                                                                                                    | exit 0                                                                                                                                                                                                                                                                                                                                                                            |
| `bunx prettier --check` on every changed file                                                                                                              | "All matched files use Prettier code style!"                                                                                                                                                                                                                                                                                                                                      |

Not run: the h2puni gate, fe-01's browser e2e and pixels, gw-01's suite, and nothing on the dev
host. The fe-01 change was not reviewed by eye (note 12).

### Failure-proof table, slice 5

Each check was watched failing with the fault injected, then restored; the `Proof:` comment
sits beside it. Counts are the file's pass and fail under the fault.

| Check                                      | Fault injected                                                                 | Test that observed it failing                                                                                                                         | Result                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1.4 the grant principal names its person   | `personId` left out of `machinePrincipalOf`'s authentication                   | `machine-grant-run.controller.db.test.ts`: `parity with a raw key…` (and every case of the file)                                                      | 0 pass, 11 fail; `person_required` (note 2)               |
| 1.5 slash after the root                   | a bare `audience.startsWith(server)`                                           | contracts `refuses a look-alike audience`; be-01 `refuses a look-alike or wbs:org audience…`, `refuses a narrowing outside the authorization server…` | 3/1; 46/2, `…/oauth.evil.example` admitted                |
| 1.5 registration rule                      | refusal removed (`trusted-issuer.routes.ts`)                                   | `trusted-issuer.controller.db.test.ts`: `refuses a look-alike or wbs:org audience…`                                                                   | 23/1                                                      |
| 1.5 narrowing rule                         | refusal removed (`machine-credential.routes.ts`)                               | `oidc-credential.controller.db.test.ts`: `refuses a narrowing outside the authorization server…`                                                      | 23/1                                                      |
| 1.5 not at use before slice 7              | rule enforced in `admitTrustedIssuerToken` (invalid_token)                     | `keeps verifying a stored wbs:org audience on /api before slice 7`                                                                                    | 23/1                                                      |
| 1.5 preflight refuses unaccepted rows      | every breaking row counted as accepted                                         | `trusted-issuer-audience-check-cli.db.test.ts`: three cases                                                                                           | 3/3, exit 0                                               |
| 1.5 preflight usage                        | argument check removed                                                         | `refuses arguments before opening the database`                                                                                                       | 5/1                                                       |
| 1.5 fe-01 suggestion                       | `wbs:org:<id>` suggested                                                       | `trusted-issuers-section.test.tsx`: `suggests an audience…`, `registers an issuer…`                                                                   | 19/2                                                      |
| 1.6 never the `jti`                        | the verifier defaulting a grant's run to its `jti`                             | `re-fetching without wbs_run orphans nothing`                                                                                                         | 8/3, `already_claimed` naming claire                      |
| 1.6 heartbeat by run                       | heartbeat renewing by person only (`claim-lease.routes.ts`)                    | `two processes on one credential…`                                                                                                                    | 10/1                                                      |
| 1.6 batch renewal by run                   | `null` for the run in the batch renewal (`plan-commands.feature.ts`)           | `a run-scoped write renews only its run`; the model (`claim(0, a), race(…, claim 1 null), advance(899999), release(1, b)`)                            | 10/1; counterexample                                      |
| 1.6 null renews every lease                | `run_id IS NULL` for a null run (SQLite `isNull`, memory `row.runId === null`) | SQLite and memory certifications: `claims.lease:write-renew-expire`; the model (`claim(0, a), advance(120000), claim(1, null)`)                       | 83/1 each; counterexample                                 |
| 1.6 a run renews only its own              | run filter dropped (SQLite, memory)                                            | certifications: `claims.lease:run-scoped`; the model (`race(heartbeat a, claim 0 b), advance(840000), heartbeat(a)`)                                  | 83/1 each; counterexample                                 |
| 1.6 stamp only the pinned person's claims  | the pinned-person test dropped (`claimRunOf`)                                  | domain `a lead writes a worker's delegated claim with the worker's run`; be-01 `a lead writes a worker's delegated claim…`                            | 71/1 (`run_mismatch`); 10/1                               |
| 1.6 the grant's run over the command's     | the command's `runId` preferred                                                | domain `refuses a forged run id…`, `refuses run_mismatch before the parent-claim checks`; be-01 `a forged run id is refused run_mismatch…`            | 70/2; 10/1                                                |
| 1.6 release only the caller's run          | every run released (`decideRelease`)                                           | domain: five run cases; be-01 `a forged run id…`, `a leaf held under two runs…`                                                                       | 67/5; 9/2                                                 |
| 1.6 pre-opt-in claims are the caller's     | no-run claims not counted as the run's                                         | domain `releases a claim taken with no run before it opted in`                                                                                        | 71/1                                                      |
| 1.6 a lead's release is judged without run | the run applied to every release                                               | domain `judges a lead's release of a worker's delegated claim without a run`; be-01 lead case                                                         | 71/1 (`run_mismatch`); 10/1 (`credential_not_for_person`) |

### Review of PR #768 (Fable, high), how each item is addressed

| Item | Fix                                                                                                                                                                                                                                                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-1 | the no-run rule (note 5): both adapters, `claims.lease:run-scoped`, the model, the heartbeat standing; `decideClaim` adopts a no-run claim of the pinned person as `alreadyHeld` (`isHeldUnderRun`); the claim-leases delta (renewal, standing, scenario "A run renews a pre-opt-in lease") and the run requirement of the agent-surface delta |
| S3-2 | design M15: undo and redo are per person and outside the run scope; the `releaseWorkItem` description no longer reads as covering undo; follow-up below                                                                                                                                                                                        |
| S3-3 | design M15: `run_mismatch` 403, the scoped standing, the no-run rule; design M2: `audienceRoot` and the preflight's exit contract (0, 3, or a throw on usage or settings) with no write mode                                                                                                                                                   |
| S4-1 | the bound-claim check and the `alreadyHeld` filter both key on the stamped run, and both are tested (`counts a run’s second step on a held leaf as no new bound claim`)                                                                                                                                                                        |
| S4-2 | the `credentialPinOf` Proof names the run carry                                                                                                                                                                                                                                                                                                |
| S4-3 | fe-01: the hint reads "The audience must be <root> or a path under it; suggested for this organization: <suggested>…"; `audience_not_wbs` names the root the page read (the admin's issuer list), else asks for it ("ask an admin for the value")                                                                                              |
| S4-4 | left as it is, by the coordinator's decision                                                                                                                                                                                                                                                                                                   |

New rows of the failure-proof table:

| Check                                         | Fault injected                                                            | Test that observed it failing                                                                                                                                                  | Result                              |
| --------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| a run renews the pre-opt-in lease             | no-run half dropped (SQLite `or(…, isNull)`, memory `row.runId === null`) | certifications `claims.lease:run-scoped`; be-01 `a run renews its person’s pre-opt-in lease`; the model (`claim(0, a), race(…, claim 1 null), advance(899999), release(0, a)`) | 83/1 each; 13/1; counterexample     |
| a run re-claims its own pre-opt-in claim      | adoption dropped (`each.runId === runId` in `decideClaim`)                | domain `adopts its own pre-opt-in claim…`; be-01 `re-claims its own pre-opt-in claim…`; the model (`claim(1, null), claim(1, a)`)                                              | 73/1; 13/1; counterexample          |
| bound-claim check keyed on the stamped run    | `input.runId` restored                                                    | be-01 `counts a run’s second step on a held leaf…`                                                                                                                             | 13/1, `claim_limit` cap 1 current 1 |
| `alreadyHeld` filter keyed on the stamped run | `input.runId` restored                                                    | the same case                                                                                                                                                                  | 13/1, no claim ids                  |
| the pin carries the run                       | `runId` dropped from `credentialPinOf`                                    | `machine-grant-run.controller.db.test.ts`                                                                                                                                      | 8/6                                 |
| fe-01 refusal names the root                  | null passed for the root                                                  | `renders audience_not_wbs on an oidc create`; `renders audience_not_wbs on register`                                                                                           | 40/2 (one pre-existing); 20/1       |

**Follow-up (S3-2):** record `runId` on `command_journal` and let a run-scoped principal undo
only its own run's entries. Today a run can undo another run's claim or release of its person
(note 7).

## Slice 6: `WorkloadJwtBearerProvider` and `twilight-dash mcp token` (task 2.4)

Built on branch `feat/dash-mcp-token-6` from the plan branch at 743808fa3 (slices 1 to 3 and
section 4 merged, plus main), 2026-10-27, on the assumed M2, M4 and M10. Every test below ran
under `env -u CLAUDECODE` on the laptop; nothing ran on h2puni, and no host was touched. No
file under `apps/wbs/` changed.

What landed, in `apps/twilight-structure/twilight-dash/cli/src/mcp/`:

- `machine-token.ts`: the endpoint of a resource (`<resource>/oauth`, `/token`), the run, the
  concealed `ApiKey` read from an owner-only file (`readOwnerOnly` and `MachineKey` are now
  exported by `compute/configuration.ts` for it), the workload token readers (a reread file, or
  GitHub Actions), and the token endpoint's refusal and `Retry-After`.
- `token-command.ts`: `twilight-dash mcp token`, dispatched by `entrypoint.ts` before `cli.ts`
  is loaded (note 1).
- `workload-provider.ts`: `WorkloadJwtBearerProvider`.
- Tests: `mcp-token.boot.test.ts` against the real stack (`testing/wbs-mcp-stack.ts`: be-01's
  composed grant route, the fixture mcp-01's booted tests use, and **mcp-01's production
  `main.ts`** in standalone mode with its real M10 limits and `MCP_TRUSTED_PROXY_HOPS=0`, each
  in its own process; Dash imports neither app), `token-command.test.ts` and
  `workload-provider.test.ts` against a **faithful fake** of the token endpoint where the real
  stack cannot produce the case on demand: a `429` with a chosen `Retry-After` at a chosen
  moment of the budget, answered as mcp-01's `machineRefusal` does (`429`,
  `invalid_request`, `rate_limited`, `Retry-After` in seconds).
- The Dash README's `mcp token` section, with Claude Code's `headersHelper` configuration for an
  API key (the headless swarm path).

### Slice 6 notes (assumptions taken, and gaps in the design)

1. **The helper budget and Dash's load time.** Loading `cli.ts`'s command graph takes about
   2.5 s (measured: `entrypoint.ts mcp token` exited in 2.68 to 2.76 s before the change), and a
   budget measured from the command's start does not see it, so a `Retry-After: 30` 2 s into the
   command would have been killed by Claude Code. `entrypoint.ts` now dispatches `mcp` first
   and imports only `src/mcp` (0.12 s to exit, twice), and every other command imports `cli.ts`
   dynamically. The 0.1 s of load before the command starts is inside M2's 1 s margin; the
   budget is still measured from the command's start, because Dash's monotonic origin is not
   promised to be the process start.
2. **The 5-minute cache margin cannot hold for short tokens** (M2). An OIDC token is capped at
   the assertion's `exp` minus 60 s, and a GitHub Actions token lives minutes, so an access token
   under 5 minutes would never be served: the SDK would send no bearer, re-authenticate, and
   then throw "Server returned 401 after successful authentication". The provider keeps a token
   until `min(5 min, half its lifetime)` before `exp` (fault F15). Design amendment proposed.
3. **"Drops it on any 401" has no SDK hook.** The SDK transport calls `auth` (and so
   `prepareTokenRequest`) only after a 401, or when `tokens()` serves nothing, and for a
   non-interactive provider `auth` always fetches. The provider therefore drops its token in
   `prepareTokenRequest` and in `invalidateCredentials('tokens' | 'all')` (F16), and the real
   stack proves the re-fetch after a 401 (F13).
4. **The provider's `Retry-After` needs the caller's cooperation.** The SDK sends the token
   request through the transport's `fetch` and throws on a `429` at once. The provider honours
   M2's wait (capped at 60 s, one retry) only when its `tokenFetch(fetch)` is the transport's
   `fetch`; the README says so. The retry resends the same assertion, which is safe because
   no `jti` is consumed (M3).
5. **The issuer is derived, not imported.** `mcpAuthorizationServerOf` lives in `@wbs/contracts`,
   which Dash's product boundary admits only at listed paths; `src/mcp/` derives the same two
   lines locally rather than widening the policy (which needs its own effective-policy test in
   `tools/tool-devsync`). The real-stack test pins the two: stamping `<origin>/oauth` made the
   SDK refuse the client information (F21). Follow-up if a third consumer appears.
6. **The helper derives its token endpoint** (`<resource>/oauth/token`, M2) instead of
   discovering it, saving two requests of the 10 s budget. A deployment fronting another
   token endpoint would break the helper; the provider uses the SDK's discovery.
7. **How the secret is supplied.** By file path in an argument, never the secret: `ps` shows
   arguments to every user, and an environment variable is inherited by every process Claude
   Code starts, so an agent's own shell could print it into a transcript. The key file must be
   owner-only (`readOwnerOnly`, F10); the workload token file need not be, because a projected
   service-account token is mounted 0644 by default. Residual: the agent's own user can read
   the key file; keeping the key from the agent needs another user.
8. **GitHub Actions** is supported through the runner's `ACTIONS_ID_TOKEN_REQUEST_URL` and
   `_TOKEN` (`--github-actions-audience`), tested against a fake runner endpoint only; no real
   Actions run was made.
9. **`Retry-After` as an HTTP date** is treated as absent (no retry, exit 1); mcp-01 sends
   seconds only. A `429` without `Retry-After` is not retried either.
10. **No request timeout in the helper.** Claude Code kills it at 10 s; a hung token request
    therefore ends without a Dash error line. The provider has none either (the SDK's own
    behaviour).
11. **The 100 staggered issuances** start 40 ms apart (4 s), not spread over 60 s: M10's burst
    of 100 makes any start pattern within a minute equivalent at the first minute, and a
    60 s spread would cost a minute of test time. The fault (two issuances per run, F2) drew
    M10's `429`.
12. **The stack runs mcp-01 at credential epoch 0.** Machine admission reads no epoch (M5), so
    the activation runbook's epoch step was not run; consent paths are not exercised here.
13. **CI routing.** Dash's tests start be-01's fixture and mcp-01's `main.ts`, both in
    `twilight-dash:test`'s inputs. _Corrected:_ the original note said an mcp-01-only PR might
    not select Dash. It does: `nx show projects --affected --files=apps/wbs/mcp-01/src/main.ts`
    named `twilight-dash` with the base's `project.json` too, and CI's pull-request run is
    `nx affected`. The review's `implicitDependencies` on `wbs-be-01` and `wbs-mcp-01` (S3-5)
    were added and then withdrawn: CI's `workspace-projects.test.ts` `productConstraints > is
satisfiable by every internal dependency in the actual repository graph` failed on them
    with `twilight-dash -> wbs-be-01` and `twilight-dash -> wbs-mcp-01` (run 40517831190), as a
    Twilight product may not depend on WBS apps. Follow-up if Dash's selection must not rest
    on the incidental path: a routing rule rather than a graph edge.
14. **`--run` is static per `headersHelper` entry**, so a batch that scopes each run needs one
    `--mcp-config` per run (README).
15. **2.2's moved negative** ("make the provider cache its first assertion") is F14 here.
16. **Design amended (review S2-1).** M2 now states the `min(5 min, half the lifetime)` margin
    (note 2) and the drop through `prepareTokenRequest` and `invalidateCredentials` (note 3).
17. **A misused flag echoed a secret (review S2-2).** `--key-file <key>` printed "no
    configuration at <key>", and `--assertion-file <token>` "cannot read the workload token at
    <token>". A value shaped like a key (`wbs_mk_` and an id) or a JWT (`eyJ…` with three parts)
    is now refused naming only the flag, and every key file and assertion file refusal names
    the flag and never the path, which also replaces the "configuration" wording (S4-2). A
    relative path starting with such a shape is refused too; nothing else is.
18. **Redirects (review S3-1).** Bun re-sends a POST body to a 307's target, across origins,
    so a token request is sent with `redirect: 'manual'` by the helper (a 3xx is refused, naming
    its status) and by `tokenFetch` (the 3xx reaches the SDK, which throws naming it).
    `redirect: 'manual'` rather than `'error'`: it gives a refusal that names the redirect.
19. **Follow-up: per-source sizing for multi-pool fleets (review S3-3).** M10's
    `issuancesPerSource` is the same burst 100 and 300 a minute as the per-credential limit;
    behind one proxy hop every agent on one host or NAT shares it, whatever credential it holds.
    The README says so.
20. **Follow-up: an `mcp-token.mjs` bundle before task 8.1 (review S3-4).** The helper runs from
    a checkout with `bun install`; the README says so.
21. **Not done: one in-flight issuance in the provider (review S4-5, optional).** Concurrent
    `auth` calls on one provider could each issue a token; how often the SDK makes them was not
    analysed. The stack harness's cleanup on a failed start (S4-4) is not proven by a test.

### Commands and results, slice 6

All on 2026-10-27 at the head of this branch, with `env -u CLAUDECODE` and `--skip-nx-cache`:

| Command                                                                                     | Result                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t typecheck lint -p twilight-dash`                                       | exit 0                                                                                                                                                                                                                                                                                                     |
| `bunx nx run twilight-dash:test`                                                            | 3404 pass, 0 fail (99 files, 845.9 s), exit 0; `src/mcp` alone 31 pass (8 boot, 23 fake)                                                                                                                                                                                                                   |
| `bunx nx run tool-devsync:test`                                                             | 966 pass, 7 fail (50 files, 834.3 s), exit 1: all seven are `sync.test.ts` "boot-commit convergence after reset", whose fixture `mcp.env` lacked `MCP_TRUSTED_PROXY_HOPS`. They failed identically on the base 743808fa3; the plan branch fixed the fixture in a8b233254, merged here for the review fixes |
| `bunx openspec validate --all --json`                                                       | exit 0; 301 items, 301 passed                                                                                                                                                                                                                                                                              |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0 (the existing store-memory and plan-commands review debt)                                                                                                                                                                                                                                           |
| `bunx prettier --check` on every changed file                                               | "All matched files use Prettier code style!"                                                                                                                                                                                                                                                               |
| `entrypoint.ts mcp token` (usage refusal), timed                                            | 2.68, 2.76, 2.68 s before note 1's fast path; 0.12, 0.12 s after                                                                                                                                                                                                                                           |

Not run: the h2puni gate, wbs-be-01's and wbs-mcp-01's suites (neither changed; their booted
fixture and `main.ts` ran inside Dash's tests), fe-01 and its e2e, gw-01, a real GitHub
Actions run, a real Claude Code `headersHelper` session, and anything on a host. No migration
and no `libs/**/service/` file changed.

### Failure-proof table, slice 6

Each check was watched failing with the fault injected, then restored; the `Proof:` comment
sits beside the check or its test. "Boot" is `mcp-token.boot.test.ts`, "helper"
`token-command.test.ts`, "provider" `workload-provider.test.ts`.

| #   | Check                                                       | Fault injected                                          | Test that observed it failing                                                                                                              |
| --- | ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| F1  | the helper keeps no cache (2.4's helper negative)           | a module-level memo of the bearer, printed once set     | boot `a re-run 0.6 s after a 401 on the token it served issues a new token`: the re-run printed the rejected token (`not.toBe(first)`)     |
| F2  | one issuance per run, under M10                             | each run sends its token request twice                  | boot `100 staggered issuances…`: a helper met M10's 429 and reached its wait                                                               |
| F3  | `wbs_run` sent                                              | `form.set('wbs_run', …)` removed                        | boot `a run is signed into the token as wbs_run`: no `wbs_run` claim                                                                       |
| F4  | `Retry-After` capped at the budget                          | the whole `Retry-After` waited                          | helper `with Retry-After: 30, 2 s into the run, waits 7 s and retries once`: slept 30000                                                   |
| F5  | no retry when the capped wait is ≤ 0                        | the `wait <= 0` check removed                           | helper `a 429 whose capped wait is zero or less is not retried`: retried and printed a token                                               |
| F6  | one retry, never a loop                                     | retry while `429`                                       | helper `retried once and refused again exits non-zero`: printed the third answer's token                                                   |
| F7  | exactly one credential                                      | `chosen.length === 0`                                   | helper `refuses no credential or two…` (`--key-file` with `--assertion-file`): issued                                                      |
| F8  | `https:` or loopback only                                   | any protocol admitted                                   | helper `refuses a plain-HTTP resource off loopback`: issued                                                                                |
| F9  | the key file holds a `wbs_mk_` key                          | shape check disabled                                    | helper `refuses a key file that holds no wbs_mk_ key, never echoing it`: issued                                                            |
| F10 | owner-only key file                                         | `readOwnerOnly`'s mode check skipped                    | helper `refuses a group-readable key file`: issued from a 0640 file                                                                        |
| F11 | Actions variables required                                  | an unset variable admitted                              | helper `refuses an unset ACTIONS_ID_TOKEN_REQUEST_TOKEN, naming it`: a request was sent                                                    |
| F12 | the replaced generation is removed                          | the sweep skipped (re-run after review: G10)            | the same test: two generations of pool-a                                                                                                   |
| F13 | the provider re-fetches after a 401 (its negative)          | `tokens()` keeps serving the first token                | boot `re-fetches after a 401`: "Server returned 401 after successful authentication"                                                       |
| F14 | a `pool-<poolId>` this Dash did not write is never replaced | `assertImportedPool` accepts a non-link                 | `refuses to replace a pool directory it did not write`: "pool pool-a could not be written; the store keeps what it had" instead            |
| G1  | a stray generation of the pool is swept (S2-1)              | the sweep spares the stray generation                   | `sweeps a stray generation of the pool, its key file included`                                                                             |
| G2  | an overtaken import exits non-zero (S2-1)                   | the re-read check disabled                              | `an import replaced concurrently exits non-zero and keeps no key of its own`: resolved                                                     |
| G3  | a failed write leaves no partial generation (S3-2)          | the generation's removal dropped from the catch         | `a write that fails leaves no partial generation, and the pool as it was`                                                                  |
| G4  | the store's missing parents are `0700` (S2-2)               | parents created without a mode, the store itself `0700` | `creates a missing store and its parents 0700`: 509 (0775, umask 002) for 448                                                              |
| G5  | a store that is a link is refused (S3-4)                    | `statSync` for `lstatSync`                              | `refuses a store that is a link`: resolved                                                                                                 |
| G6  | a pool link elsewhere (`/etc`) is refused (S3-4)            | any link target accepted                                | `refuses a pool link it did not make, to /etc, leaving both alone`: resolved                                                               |
| G7  | a `429` is retried at most three times, 60 s each (S3-1)    | the bound disabled                                      | `a 429 not waited out within its bound aborts, saying how long to wait`: resolved                                                          |
| G8  | the mode refusal names `chmod 600 <path>` (S2-2)            | the old message                                         | `refuses a group-readable pool key file, naming the chmod`                                                                                 |
| G9  | a `429` is waited out (S3-1)                                | the sleep dropped                                       | `waits out a 429 per its Retry-After and imports` and the bound test                                                                       |
| G10 | every other generation is removed after the switch          | the sweep skipped                                       | `a re-import replaces the pool keys…`: two generations; `sweeps a stray generation…`                                                       |
| G11 | the Dash document matches `agentPoolKeys` (S3-3)            | `mcpResource` removed from `pool-keys.v1.json`          | contracts `accepts the document Twilight Dash's pool import is tested with`: `allows` false                                                |
| F15 | short tokens are served (note 2)                            | a flat 5-minute margin                                  | boot `a run outlives its workload token`: "Server returned 401 after successful authentication"                                            |
| F16 | drop the token when the SDK asks for a new one              | `prepareTokenRequest` keeps the cache                   | provider `drops its token when the SDK asks for a new one, or invalidates it`                                                              |
| F17 | the provider's `Retry-After` capped at 60 s                 | cap removed                                             | provider `waits a token endpoint Retry-After, capped at 60 s, and retries once`: slept 90000                                               |
| F18 | a token needs `expires_in`                                  | check disabled                                          | provider `refuses a token without expires_in`: no throw                                                                                    |
| F19 | `entrypoint.ts` dispatches `mcp`                            | dispatch disabled                                       | boot `the entrypoint prints only the header map, and a refusal names no key`: exit 1                                                       |
| F20 | no key in any output                                        | the refusal names the request's `authorization` header  | boot, the same test: stderr held `error: refused for Basic …`                                                                              |
| F21 | the issuer is mcp-01's (note 5)                             | `<origin>/oauth` stamped                                | boot `connects and calls a tool…`: "OAuth client information is bound to authorization server …/oauth and is not presented to …/mcp/oauth" |

### Review of PR #767 (Fable, high), how each item is addressed

| Item | Fix                                                                                                               | Fault injected                                        | Test that observed it failing                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 | design.md M2 amended (note 16)                                                                                    | — (text)                                              | —                                                                                                                               |
| S2-2 | N1: secret-shaped flag values refused naming the flag                                                             | shape check disabled                                  | helper `a key given to --key-file`, `a token given to --assertion-file`: the file refusal instead                               |
| S2-2 | N2: key file refusals name `--key-file`, never the path                                                           | `readOwnerOnly`'s refusal rethrown as is              | helper `a secret that is no file, given to --key-file`: stderr "config_absent: no configuration at sk-pasted-secret-value"      |
| S2-2 | N3: assertion file refusals name `--assertion-file`, never the path                                               | the path in the message                               | helper `a secret that is no file, given to --assertion-file`: stderr "cannot read the workload token at sk-pasted-secret-value" |
| S3-1 | N4: the helper never follows a redirect                                                                           | `redirect: 'manual'` and the 3xx check removed        | helper `is never followed…` (two real servers, a cross-origin 307): printed the other origin's token                            |
| S3-1 | N5: `tokenFetch` never follows a redirect                                                                         | `init` passed unchanged                               | provider `never follows a redirect of a token request` (two real servers): 200 instead of 307                                   |
| S3-2 | N6: unreadable apart from empty or oversize                                                                       | an unreadable file answered "holds no workload token" | `machine-token.test.ts` `refuses an unreadable assertion file apart from an empty or oversize one`                              |
| S4-5 | N7: the cap counts bytes                                                                                          | `assertion.length`                                    | the same test: 120,000 bytes admitted                                                                                           |
| S3-2 | N8: GitHub non-200 refused                                                                                        | status check disabled                                 | `machine-token.test.ts` `refuses a GitHub Actions answer other than 200…`: resolved with the 403 body's value                   |
| S3-2 | N9: a non-JSON answer named by status                                                                             | a refusal coded `unknown` returned                    | `machine-token.test.ts` `names a proxy's non-JSON 502 and a JSON answer without error…`: resolved                               |
| S3-2 | N10: JSON without `error` named by status                                                                         | `error` read unchecked                                | the same test: resolved with a refusal coded `undefined`                                                                        |
| S3-2 | N11: only the delay form of `Retry-After`                                                                         | any value read with `Number`                          | `machine-token.test.ts` `reads only the delay form of Retry-After`: NaN for the HTTP date                                       |
| S3-2 | N12: the token is dropped at `servedUntil`                                                                        | the expiry check disabled                             | provider `serves its token until 5 minutes before exp…`: still served                                                           |
| S3-2 | N13: `invalidateCredentials` drops the token                                                                      | every scope ignored                                   | provider `drops its token when the SDK invalidates it`: still served                                                            |
| S3-3 | README: the per-source limit; note 19                                                                             | — (text)                                              | —                                                                                                                               |
| S3-4 | README: a checkout with `bun install`; note 20                                                                    | — (text)                                              | —                                                                                                                               |
| S3-5 | withdrawn: `implicitDependencies` broke the product boundary (note 13); Dash is already selected by `nx affected` | —                                                     | CI `productConstraints…actual repository graph` failed with the edges                                                           |
| S4-1 | static `test.each` labels                                                                                         | —                                                     | —                                                                                                                               |
| S4-2 | "key file" wording (with S2-2)                                                                                    | —                                                     | —                                                                                                                               |
| S4-3 | README: the design cannot hide the key from the agent's own user                                                  | — (text)                                              | —                                                                                                                               |
| S4-4 | the stack stops both processes and removes its store on a failed start                                            | not proven by a test (note 21)                        | —                                                                                                                               |
| S4-5 | bytes (N7); the single in-flight issuance is not done (note 21)                                                   | —                                                     | —                                                                                                                               |

Commands for the fixes, 2026-10-27 with `env -u CLAUDECODE` and `--skip-nx-cache`, after
merging the plan branch at a8b233254: `bunx nx run-many -t typecheck lint -p twilight-dash`
exit 0; `bun test src/mcp src/no-ambient-clock.test.ts src/cli.test.ts` (Dash) 73 pass, 0
fail (6 files); `tool-devsync` `sync.test.ts -t "boot-commit convergence"` 8 pass, 0 fail
(a8b233254's fixture fix); `openspec validate --all --json` 301 of 301; `check-indexes working .
HEAD` exit 0; prettier clean. The full Dash and tool-devsync suites were not rerun; CI runs
them.

## Slice 7: the grant-client timeout and human-only tools by policy (tasks 4.4, 5.1, 5.2)

Built on branch `feat/wbs-mcp-human-only-7` from main at 6b4e05823 (slices 1 to 6 merged
through #751 and #769), 2026-10-28, for the plan branch `plan/wbs-mcp-agent-surface-2`. Every
test below ran under `env -u CLAUDECODE` on the laptop; nothing ran on h2puni, and no host was
touched.

What landed:

- **4.4.** `machineGrantClient` (`apps/wbs/mcp-01/src/machine-grant-client.ts`) bounds its fetch
  to be-01's grant route, body included, by `BE_CALL_TIMEOUT_MS` (35 s, the tool-call bound of
  section 4 note 15), raced with `untilAborted` (now exported by `wbs-client.ts`) so a fetch that
  ignores its signal cannot hold the request. A timeout is `MachineGrantTimedOut`, a
  `MachineGrantDefect`: the token endpoint reports it and answers `502 server_error`, and the
  request's `finally` releases its pending slot and reservation as for any other defect. The
  third parameter sets the bound for tests.
- **5.1.** `EndpointShape.humanOnly` (`libs/wbs/domain/contracts/src/http/endpoint-shape.ts`)
  tags 45 shapes. `EXCLUDED_PATHS` (`apps/wbs/mcp-01/src/openapi-tools.ts`) shrinks to
  `/api/auth/*`, `/internal/*`, `/api/smoke/echo` and `/api/organization/active`.
  `toolsFromDocument(document, humanOnly = HUMAN_ONLY_OPERATIONS)` skips every operation
  whose method and path a `humanOnly` shape declares, and throws when one matches nothing.
  `main.ts` derives its tools at startup, so that throw fails the boot. The capacity report,
  `putApiCompute-providersByProviderIdResourcesByResourceIdCapacity-report`, is a tool. The
  tool count goes from 104 to 76: 29 newly tagged operations leave the list, the capacity report
  joins it, and the README says so.
- **5.2.** `organization-delegation.boot.test.ts` lists tools at one mcp-01, against the booted
  be-01, as a consented human (dany), a consented agent (claire) and a machine token. The three
  answers (names, descriptions and input schemas) are equal, and they are the whole derived set.

### Slice 7 notes (assumptions taken, and gaps in the design)

1. **The covered set.** It is the spec delta's list: machine credentials (4), trusted issuers
   (3), provisioning tokens (4), memberships and the members routes (1 and 3), invitations (3,
   plus the onboarding accept), join requests (3), domains (5), SSO connections (4), the session
   policy (2), the limits read (1), the capacity-mode switch (`patchApiOrganization`; the read
   `getApiOrganization` stays a tool), restore approvals (1) and onboarding (5). Compute provider
   administration (4) is tagged as well. The spec does not name it, but it was excluded before
   and is administration of the same kind; leaving it untagged would have exposed it when
   `EXCLUDED_PATHS` shrank. Agent pools do not exist yet: task 6.2 tags their routes, and
   `generated-document.test.ts`'s pinned `HUMAN_ONLY` list gains them then.
2. **Where the tag lives.** It is a field on the shape (`humanOnly?: true`), not a
   `RequestPolicy` kind. be-01's adapters read `policies` to authorize a request, and this tag
   authorizes nothing in be-01. mcp-01 reads it from `httpShapes`, not from the emitted
   document, so the OpenAPI document is unchanged. An external fixture document passes its own
   `humanOnly` list: the fixture tests pass a one-entry list, or `[]` where the fixture tags
   nothing.
3. **"Matching nothing".** A tagged shape matches by method and the document's `{name}` path.
   `documentPathOf` is now exported by `@wbs/contracts` for this, and the emitter uses it too. In
   production the document is generated from the same table, so the startup throw guards a
   document that drifted from the shapes, as the `EXCLUDED_PATHS` stale check does.
4. **The capacity report's two halves.** A provider reporter's machine token reaching be-01
   through the tool is `machine-admission.boot.test.ts`'s new test against the booted grant
   backend, which gains two fixture routes. A consented agent's `not_an_agent_principal` is
   be-01's existing `refuses a browser session and an MCP delegation, storing nothing`
   (`compute-provider.controller.db.test.ts`). An MCP delegation is the principal a consent
   session's call carries, and nothing in this slice changes it.
5. **The machine token in the parity test.** The delegation backend holds no grant keys, so the
   test's mcp-01 composes machine grants over a stand-in for be-01's grant route.
   `tools/list` asks be-01 nothing, so the stand-in grant is never sent to be-01. The consent
   tokens are the real booted ones.
6. **The 5.2 negative is the machine half.** The injected fault hides write tools from a caller
   whose `authInfo` carries a machine caller. A human and an agent consent carry the same
   `authInfo` shape (subject, scopes, session id), so no realistic fault separates them in the
   `tools/list` handler. The test still asserts agent equals human.
7. **A timeout is reported, not `temporarily_unavailable`.** A be-01 that accepts the connection
   and never answers is a deployment fault no one else reports, as `BeCallTimedOut` is for a tool
   call. `unavailable` (503) stays for a be-01 that refuses connections or answers 5xx, and be-01
   reports those failures itself.
8. **A delegated claimant's members test.** The agent-consent test in
   `organization-delegation.boot.test.ts` asserted that `getApiOrganizationMembers` answered
   `insufficient_scope`. That tool no longer exists, so the test now asserts it is absent from
   the agent's `tools/list`.

### Commands and results, slice 7

All on 2026-10-28 at the head of this branch, with `env -u CLAUDECODE` and `--skip-nx-cache`:

| Command                                                                                     | Result                                                           |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `bunx nx run-many -t typecheck lint -p wbs-mcp-01 wbs-contracts wbs-be-01`                  | exit 0                                                           |
| `bunx nx run-many -t test -p wbs-contracts`                                                 | 609 pass, 0 fail (60 files)                                      |
| `bunx nx run-many -t test -p wbs-mcp-01`                                                    | 720 pass, 0 fail (32 files)                                      |
| `bunx nx run-many -t test -p wbs-be-01`                                                     | 3784 pass, 0 fail (3787 tests, 259 files, 1331.2 s)              |
| `bunx openspec validate --all --json`                                                       | exit 0; 301 items, 301 passed                                    |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0 (the existing store-memory and plan-commands review debt) |
| `bunx prettier --check` on every changed file                                               | "All matched files use Prettier code style!"                     |

Not run: the h2puni gate, fe-01 and its e2e (no fe-01 file changed, and the shape type gains
one optional field), gw-01, and `tool-devsync`. The tool-devsync tests were skipped because
mcp-01's OAuth metadata is unchanged (`bin/dev-mcp-probe.sh` checks only the metadata) and no
env or deploy file changed. No migration changed.

### Failure-proof table, slice 7

Each check was watched failing with the fault injected, then restored. The `Proof:` comment
sits beside the check or its test.

| #   | Check                                                    | Fault injected                                                                   | Test that observed it failing                                                                                                                                                                                                                |
| --- | -------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | the grant fetch is raced against its timeout (4.4)       | the race removed; the signal only handed to a fetch that ignores it              | limits `frees the pending slot of a grant request be-01 never answers, after the timeout`: timed out after 5000 ms                                                                                                                           |
| G2  | a timeout is `MachineGrantTimedOut`                      | the `signal.aborted` mapping disabled                                            | the same test: reported `could not send the request to be-01 …: TimeoutError`, not `MachineGrantTimedOut`                                                                                                                                    |
| H1  | a `humanOnly` shape is no tool (5.1, "untag a route")    | `humanOnly: true` removed from `listMembers` (`organization-shapes.ts`)          | `tags exactly the covered set humanOnly, and offers none of it as a tool`, `pins every generated MCP operation name…` and the README count (76 vs 77)                                                                                        |
| H2  | the derivation skips a tagged operation                  | the `continue` after a `humanOnly` match removed                                 | `emits no tool for any of D1’s three exclusion classes` (the fixture's `getApiOrganizationMemberships` became a tool); deriving the generated document threw at `POST /api/organization/machine-credentials` (17 tests across the two files) |
| H3  | a tagged shape matching no operation fails startup (5.1) | the `unmatched.length > 0` throw disabled                                        | `refuses to start when a humanOnly shape matches no operation` (fixture), `…whose method the document serves under no such path`, and `…of the generated document`                                                                           |
| H4  | the capacity report is a tool (5.1)                      | `/api/compute-providers/*` put back in `EXCLUDED_PATHS`                          | `machine-admission.boot.test.ts` `an agent's machine token reports capacity through the tool, and be-01 stores it`: `mcp-01 has no tool named …Capacity-report`                                                                              |
| P1  | one tool list for every principal (5.2)                  | the `tools/list` handler hides non-GET tools from a caller with a machine caller | `organization-delegation.boot.test.ts` `a consented human, a consented agent and a machine token list the same tools`                                                                                                                        |

## Slice 8: agent pools (tasks 6.0, 6.1 and 6.2)

Built on branch `feat/wbs-agent-pools-8` from `plan/wbs-mcp-agent-surface-2` at 6b4e05823,
2026-10-28. Every test below ran under `env -u CLAUDECODE` on the laptop; nothing ran on h2puni.

**Assumptions Dany may reverse (tasks.md 0.2).** M7 is built as designed, with API-key pools
only (no OIDC pool in v1). M16 (g): `parent_claim_foreign` and D7 stay exactly as they are
today, so every agent of a pool (all bound to the creating admin) may claim under another's
subtree claim.

What landed:

- **6.0** Five account-keyed checks the M16 table lacked are added to design.md M16: claim
  identity (`refuseIdentity`), a member's machine-credential reach, consent agents
  (`agentsBoundTo`), saved-plan rename and delete (`mayTouchSavedPlan`), and project owner
  edits (`canEditProjectInOrganization`). None changes behaviour here.
- **6.1** `20261028100000_add_agent_pool` (the `agent_pool` table, its live-name index and
  `machine_credential.agent_pool_id`) and `20261028100100_widen_organization_audit_agent_pools`
  (`agent_pool_created`, `agent_pool_revoked`, `agent_pool_rekeyed` and the subject kind
  `agent_pool`, by compatible rebuild). The rebuild and its `down.sql` both recreate task 1.2's
  two partial unique indexes. Both `down.sql` files refuse by name: the first while any pool
  exists, the second while any pool audit row exists. The credential read now joins the pool,
  so `admitMachineCredential` judges a pool's `expiresAt` (slice 1 note 3's constant is gone).
  Every test pinning the migration list or rollback order carries the two names.
- **6.2** `AgentPools` (`@wbs/core` `ports/agent-pools.ts`), `AgentPoolRepository`
  (`@wbs/store-sqlite` `agent-pool.ts`), and `agentPoolRoutes` (`@wbs/core`
  `http/agent-pool.routes.ts`) behind four shapes in `@wbs/contracts` `agent-pool-shapes.ts`:
  `GET`/`POST /api/organization/agent-pools`, `POST …/:id/rekey` and
  `DELETE …/:id?removePersons=true`. They are wired in `app.ts`, `boot.ts` and both organization
  harnesses, kept out of the MCP tools (`EXCLUDED_PATHS`), and listed in the route inventory.
  Refusal codes `pool_changed` and `persons_not_removed` are added to `refusal.ts`.

### Slice 8 notes (assumptions taken, and gaps in the design)

1. **"Through `addPerson`'s cap check".** The pool's persons, keys, pool row and audit rows are
   written in one `BEGIN IMMEDIATE` transaction of the SQLite repository. Running them as a
   directory command batch would have needed the batch's unit of work to carry machine
   credentials. The cap is judged by the same reading and decision `addPerson` uses:
   `readAgentPersonCapIn` (extracted from `OrganizationLimitGaugeRepository`, which now
   delegates to it) and `refuseLimit`, once for the whole pool, inside that transaction. The gap:
   no directory announcement is pushed for the new persons, so an open people list shows them
   on its next read. Each person's root name is its own opaque id, as for `addPersonWithin`.
2. **Names.** The agent at index `i` is `<name>-<i+1>` in the organization, and its
   credential takes the same name. The pool name is 1–60 characters and not shaped like a
   secret. A live pool, an organization person or a live credential holding any of these names
   gives `409 name_taken`. Revoking a pool frees its name.
3. **Keys document (for 6.4).** Create and re-key answer `201` with one document: `format:
'wbs-agent-pool-keys'`, `version: 1`, `organizationId`, `poolId`, `name`, `expiresAt`,
   `issuedAt`, and `agents[]`, each with `personId`, `personName`, `credentialId` and `key`, in
   name order. The keys are minted in the route and only digests reach the store. Nothing
   logs them: the create test spies on the console and checks that no secret, digest or
   `wbs_mk_` reaches the list, the audit or a log line.
4. **Audit detail.** Each key gets `machine_credential_created` or `machine_credential_revoked`
   with today's detail plus `agentPoolId`. The pool row carries `size`, `expiresAt`, `personIds`
   and `credentialIds` (created), `credentialIds` (re-keyed), or `credentialIds` and `personIds`
   (revoked). It never carries a name, a key, a secret or a digest.
5. **Re-key is two reads.** The route reads the pool's persons, mints one key each, and the
   store re-checks inside its transaction that the keys name exactly those persons. A person
   removed in between gives `409 pool_changed`, and nothing is written. Pool persons are the
   persons its credentials name, so a person removed alone leaves the pool smaller. Re-keying
   keeps the persons' leases, because each keeps a live credential.
6. **`removePersons`** is a query flag on `DELETE` (`?removePersons=true`), not a body. The
   revocation commits first; the route then runs one directory batch of `deletePerson`
   (`cascade: true`) for the pool's persons as the admin (A24). A refused batch answers
   `409 persons_not_removed` with the pool revoked and its persons kept. The design's later
   `DELETE …/agent-pools/:id/persons` is not built: a revoked pool's persons can still be
   removed one at a time with `deletePerson`.
7. **Revocation ends both secrets of a rotated pool key.** A pool key can still be rotated
   through the single-credential route, and the pool revoke ends every secret that is
   unexpired at the revoke. A pool person who also holds a key issued alone keeps its leases.
8. **OIDC pools** are refused by the schema (`source` may only be `'api_key'`) as
   `400 invalid_body`. Size, a past `expiresAt` and one more than 90 days ahead get the same
   answer.
9. **Who may act.** Only a current `admin` or `super_admin`, checked inside each act's
   transaction; a member or viewer gets `403 forbidden`. Every delegation, grant and machine
   key gets `403 insufficient_scope` (`sessionOrganizationOf`). The test drives this with an
   API key on `/api`; a separate delegation case was not written, because the same
   `principal.delegation` guard decides both.
10. **The listing** (`GET`) is admin-only. It shows every pool, revoked ones included, each
    with its live credentials and no secret.
11. **Memory parity.** The memory source has no activated organization, and organization
    administration ports are SQLite-only, as `MachineCredentialAdministration` is. No plan
    store port grew, so store-memory and the conformance suite are unchanged.
12. **No new env key.** Dev needs nothing seeded for this slice; its two migrations are
    additive and run at deploy.
13. **Expired pools.** A token request with an expired pool's key reaches be-01's grant route
    as `401 unknown_identity`; mcp-01 maps that to `invalid_client` (`machine-token.test.ts`
    `maps unknown_identity and not_activated to invalid_client…`, in the mcp-01 run below). The lease then lapses at its own end and is
    released as `lease expired`.
14. **Human-only (M8, slice 7 / #770).** After merging the plan branch with #770, all four pool
    shapes carry `humanOnly: true`, and mcp-01's pinned `HUMAN_ONLY` list in
    `generated-document.test.ts` names them. The `EXCLUDED_PATHS` entries this slice first added
    were dropped, because #770 replaced those credential exclusions with the tag. P14 is now the
    tag (see below).

### Commands and results, slice 8

All on 2026-10-28 with `env -u CLAUDECODE` and `--skip-nx-cache`, on the laptop:

| Command                                                                                                                                                    | Result                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t typecheck lint -p wbs-contracts wbs-core wbs-store-sqlite wbs-be-01 wbs-mcp-01 wbs-domain wbs-store-memory wbs-conformance wbs-fe-01` | "Successfully ran targets typecheck, lint for 9 projects and 3 tasks they depend on", exit 0                                                                                                                                                                                                                        |
| `bunx nx run-many -t test -p wbs-domain wbs-contracts wbs-core wbs-store-sqlite wbs-store-memory wbs-conformance wbs-mcp-01 --parallel=1`                  | every project green but store-sqlite: 2001 pass, 2 fail (`audit.test.ts`, which requires `auditOnCreate` on every drizzle insert, and `runtime-ledger.db.test.ts`, whose old-branch fixture has no `machine_credential`). Both were fixed (note 15), then store-sqlite was rerun: 2003 pass, 0 fail, 1 skip, exit 0 |
| `bunx nx run wbs-be-01:test`                                                                                                                               | 3808 pass, 1 fail, 3 skipped, 3812 tests in 261 files (1257 s). The failure was `runtime-authority.db.test.ts`'s fixed `-13` migration window; it became `-15`, and that file was rerun: 30 pass, 0 fail                                                                                                            |
| `bun test src/` (mcp-01, after the fixture updates)                                                                                                        | 712 pass, 0 fail                                                                                                                                                                                                                                                                                                    |
| `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts` on the four new SQL files                                                                       | exit 0                                                                                                                                                                                                                                                                                                              |
| `bunx openspec validate --all --json`                                                                                                                      | 301 items, 301 passed                                                                                                                                                                                                                                                                                               |
| `bunx prettier --check` on every changed file but the SQL                                                                                                  | "All matched files use Prettier code style!"                                                                                                                                                                                                                                                                        |

The be-01 suite was not rerun in full after the `-15` fix; only the changed file was. Not run:
the h2puni gate, fe-01's tests and browser e2e (no fe-01 source changed), gw-01, and the
tool-devsync workspace tests (no env key changed). CI runs them.

15. **Two store-sqlite checks met by this slice.** `audit.test.ts` requires
    `auditOnCreate` on every drizzle insert. `person_organization` carries no audit columns, so
    the pool now writes it with raw SQL, as `mapInOrganization` does. `runtime-ledger.db.test.ts`
    builds an old branch without `machine_credential`, so its fixture now leaves out
    `20261028100000_add_agent_pool`, which alters that table.

### Failure-proof table, slice 8

Each check was watched failing with the fault injected, then restored. The `Proof:` comment
sits beside the check or its test. "Controller" is `agent-pool.controller.db.test.ts`, "store" is
`agent-pool.db.test.ts` (store-sqlite), and "migration" is `agent-pool-migration.db.test.ts`.

| #   | Check                                                 | Fault injected                                      | Test that observed it failing                                                                                                           |
| --- | ----------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | the forward rebuild recreates task 1.2's `_run` index | the index left out of `…agent_pools/migration.sql`  | migration `keeps task 1.2's issuance insert preparing after the rebuild`: "ON CONFLICT clause does not match any … UNIQUE constraint"   |
| P2  | the `down.sql` rebuild recreates it                   | the index left out of `…agent_pools/down.sql`       | migration `keeps task 1.2's issuance insert preparing after rolling the rebuild back`, and `restores the schema it left, byte for byte` |
| P3  | `add_agent_pool`'s guard                              | the count replaced by `0 = 0`                       | migration `refuses rollback while a pool exists`: exit 0, the pool dropped                                                              |
| P4  | the audit widening's guard                            | the filter replaced by `WHERE 0`                    | migration `refuses rollback over one pool audit row of each action`: the narrow CHECK, not the named guard                              |
| P5  | the cap judged inside the transaction                 | the cap read before the write turn                  | store `never holds more agent persons than the cap…` (`fc.asyncModelRun`, seed 20261028): `[CreateRacing(3, 6)]`, 9 agents of 8         |
| P6  | only an admin creates                                 | `poolAdministratorRefusal` admits every member role | controller `refuses a member and a viewer forbidden…`: 201 with the keys                                                                |
| P7  | every live key revoked                                | `live.slice(1)` revoked                             | controller `revokes every key of the pool…`: the skipped agent's claim survived the sweep                                               |
| P8  | re-key creates no person                              | a fresh person minted per key in `rekey`            | controller `re-keys the same persons at the cap, creating none…`: eight new person ids                                                  |
| P9  | `removePersons` removes them                          | the directory batch skipped                         | controller `removes the pool's persons with removePersons…`: `removedPersons: 0`, eight persons kept                                    |
| P10 | the cap refusal                                       | refusal disabled                                    | controller `refuses a pool crossing the agent-person cap…`: 201 instead of 409                                                          |
| P11 | re-key keys name exactly the pool's persons           | `pool_changed` refusal disabled                     | store `refuses keys that do not name exactly the pool's persons`: `rekeyed` for a one-person set                                        |
| P12 | `expiresAt` at most 90 days ahead                     | the bound multiplied by 1000                        | controller `refuses a size of 0 or 101, … one past 90 days`: the 91-day pool created                                                    |
| P13 | the pool's expiry reaches admission                   | `findById` answers `expiresAt: null`                | controller `an expired pool…`: the expired key admitted                                                                                 |
| P14 | pool routes are no MCP tools                          | both `EXCLUDED_PATHS` entries removed               | mcp-01 `generated-document.test.ts` `keeps agent pool administration out of the generated MCP tools`                                    |
| P15 | boot wires the pools                                  | the `agentPools` binding removed                    | `boot.db.test.ts` `serves agent pools from the shared database once activated`: "boot did not wire agent pools"                         |
| P16 | no key in a log line                                  | the create route logs the minted keys               | controller `makes eight agent persons…`: `not.toContain` over the console capture                                                       |

16. **P14 after #770.** With `humanOnly` removed from `createAgentPool`, three mcp-01 tests
    failed: `tags exactly the covered set humanOnly…`, `pins every generated MCP operation
name…` and `keeps agent pool administration out of the generated MCP tools`. After the
    merge, the full mcp-01 `bun test src/` gave 721 pass, 0 fail. README's tool count (76) is
    unchanged, because no pool route is a tool.

Every negative is restored in the tree. Two of them also stay as permanent tests, run on edited
copies of the folder: `fails task 1.2's insert when the forward rebuild omits an issuance index`
and `… after a rollback whose rebuild omits an issuance index`.

17. **The claims history does not keep a removed person's name.** M7 said it did. After
    `removePersons`, the claim history still names the person's id, but `holder.name` reads
    `null`, because names are read from the directory at read time. The controller test pins
    what is true today; snapshotting the name is a separate change. M7 is amended to say so.

### Review of PR #771 (Fable, high), how each item is addressed

| Item | Fix                                                                                                                                                                                                                                                                   | Fault injected                                            | Test that observed it failing                                                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1    | the merge of #770 was already finished in 4ff14e478: four shapes `humanOnly`, the pinned `HUMAN_ONLY` list, the `EXCLUDED_PATHS` entries gone; note 14 and P14 updated                                                                                                | `humanOnly` removed from `createAgentPool`                | mcp-01 `tags exactly the covered set humanOnly…` and two more (note 16)                                              |
| S2-1 | re-key takes an optional `expiresAt` (create's bound, `isAgentPoolExpiryWithinBounds`) and stores it; without one, an expired pool is `409 pool_expired`                                                                                                              | the `pool_expired` refusal disabled                       | controller `refuses re-keying an expired pool unless a new expiry is given`                                          |
| S2-1 | the same 90-day bound on the re-key body                                                                                                                                                                                                                              | the bound check removed from the route                    | controller `re-keys an expired pool with a new expiry within 90 days, and refuses one past them`: 201 instead of 400 |
| S2-2 | the re-key set is the persons holding a live pool key (`poolPersons(…, 'live')`); revoke keeps the unfiltered read (`'any'`). An assumption Dany may reverse, stated in M7 and the spec                                                                               | the live filter dropped                                   | controller `re-keys only the agents holding a live pool key`: three keys, not two                                    |
| S3-2 | M7 amended (shared cap reading, listing, no `/persons` route, re-key semantics, keys document, history names); spec scenarios for listing, name bounds, keys answered once, `pool_changed`, `pool_expired`, a refused removal                                         | — (text)                                                  | —                                                                                                                    |
| S3-3 | the keys document carries `authorizationServer` and `mcpResource` (v1), and both 201s are `Cache-Control: no-store`                                                                                                                                                   | `noStore` dropped from `createAgentPool`                  | controller `is answered no-store on create and re-key`                                                               |
| S4-1 | the composed harness takes a `logDestination`, used by the services logger and the app's `makeLogger` at `trace`; the create test checks the pino lines, and the audit-failure test proves the capture is live (it holds `unexpected endpoint failure`, no `wbs_mk_`) | not injected separately (the console negative P16 stands) | —                                                                                                                    |
| S4-2 | the `persons_not_removed` 409 carries `poolId` and `revokedCredentials` (a detail code in `refusal.ts`)                                                                                                                                                               | the body narrowed back to its error                       | controller `answers persons_not_removed with the pool and its revoked keys…`: the answer failed its own schema, 500  |
| S4-3 | the claims history test pins the removed person's id (and the name gap, note 17); the shape JSDoc names `isSecretShaped`'s rule; `runbook-prod-deploy.md` has the swap-window rule (the outgoing release ignores pool expiry)                                         | —                                                         | —                                                                                                                    |

Commands for the fixes, 2026-10-28 with `env -u CLAUDECODE`: `bunx nx run-many -t typecheck lint`
over contracts, core, store-sqlite, be-01, mcp-01 and fe-01; targeted tests, recorded below in
the PR's commit message.

## Slice 9: the fe-01 agent pools panel (task 6.3)

Built on branch `feat/wbs-pool-panel-9` from `plan/wbs-mcp-agent-surface-2` at 1c0664ce9,
2026-10-28. Every command below ran under `env -u CLAUDECODE` on the laptop; nothing ran on
h2puni. No be-01 change was needed.

What landed:

- `AgentPoolsSlot` and `AgentPoolsPanel` (`apps/wbs/fe-01/src/components/organization/
agent-pools-panel.tsx`), composed on the organization page after machine credentials. The
  slot draws nothing for a member or viewer, who send no pools request, and nothing without
  organizations. A failed role read draws an alert with retry.
- The panel reads `GET /api/organization/agent-pools` and `GET /api/organization/limits`
  together. Each pool shows its name, standing (Live, Expired, Revoked), agents, live keys,
  expiry (or revocation) and creation. Loading, empty, failure with retry, and `forbidden`
  (no panel) are rendered states. A loss refusal gives the page up.
- **Create** is a dialog: name, agents (1–100), and an optional expiry day. Before confirming,
  it states the persons it creates (`<name>-1` to `<name>-N`) and the organization's agent
  persons against their cap, and it disables the confirm button when the pool does not fit.
  `agent_person_limit` (409) names the cap, the current count and what fits.
- **Keys once.** The `201` document goes straight into a blob (`openAgentPoolKeysFile` in
  `agent-pool-keys-file.ts`), and the panel saves it at once through an anchor attached to the
  document for the click. The reply is never put in state, the query layer, a log or browser
  storage. The panel holds only the blob and its object URL, until the admin presses Done, the
  next write starts, or the panel unmounts; then the URL is revoked. Until then "Save the file
  again" saves the same blob with no request. The note gives the file name and key count, says
  the keys are not shown, to save again before Done if no file appeared, and gives the two
  import commands: `chmod 600 <file>`, then `twilight-dash pool import <file> --store
~/.config/wbs/pools`, then delete the file. (Amended by the review of PR #774, S2-1.)
- **Re-key** confirms in the row: how many live keys stop working, how many new keys are
  saved, and how many agents without a live key stay keyless. The body is always JSON: `{}`
  keeps the expiry, `{ expiresAt }` replaces it. `409 pool_expired` (or a pool the list
  already shows expired) makes the new expiry required, with the reason in an alert.
  `pool_changed` and `not_found` are said in place.
- **Revoke** confirms in the row with the counts. "Also remove the N agent persons" is
  opt-in and starts off, and `?removePersons=true` is sent only when it is checked.
  `409 persons_not_removed` is drawn as a partial success: the pool is revoked, its keys no
  longer work, and its persons stay and still count toward the limit.
- Every refusal the five shapes model has a sentence in `agentPoolRefusal`
  (`agent-pool-refusal.ts`). An impossible reply or a thrown write reaches the Error Boundary.
- `e2e/agent-pools.spec.ts`: the panel in Chromium at 1280 and 375 px, every `/api` answered at
  the browser as `organization.spec.ts` does. It checks one `download` event named
  `pool-pool-new.keys.json`, no `wbs_mk_` in the page, and nothing sideways, and it saves a
  screenshot of each state.

### Slice 9 notes (assumptions taken)

1. **File name.** M7 names the download `pool-<id>.keys.json`; the panel uses exactly that
   (`pool-<poolId>.keys.json`), not a name built from the pool name.
2. **Expiry is a UTC day.** The expiry control is a date input. The keys stop at 00:00 UTC on
   the chosen day, which is how every instant on this page is shown (`minuteOf`). The days
   offered run from tomorrow to 89 days ahead, so 00:00 UTC on the last day is always within
   be-01's 90-day bound, whatever minute the form is sent.
3. **Counts come from the last read.** The headroom shown before creating is the limits read
   taken with the list, which every write rereads. A race past it still meets be-01's cap
   check, and that answer is drawn (`agent_person_limit`).
4. **A failed limits read fails the panel.** The panel does not draw pools without the counts a
   create must state, so a limits failure is the panel's failure with retry, and a limits
   `forbidden` hides the panel as the pools `forbidden` does.
5. **Re-key needs a live key.** Re-key is disabled when no agent of the pool holds a live key,
   since it would issue no key (M7: only agents holding a live pool key are re-keyed).
6. **No new design token.** The partial-success box uses the `destructive/40` border the
   existing confirm boxes use; the design system has no warning colour.
7. **The keys file is held until Done (ASSUMED, review of PR #774 S2-1; Dany may reverse).** A
   browser save can fail with no signal to the page: a cancelled Save-as, Chrome blocking an
   automatic download that arrives after the click's transient activation (a slow 100-key
   create), or Safari or Firefox losing a URL revoked straight after the click. So the panel
   keeps the blob (never the parsed document, never its text in React state) and its object
   URL until Done, the next write, or unmount, and offers "Save the file again" from that same
   blob. be-01 still answers the keys once; M7's delivery wording and the agent-pools spec say
   so now. The next write releases the previous file, because its note goes away with it.
8. **An unreadable 201.** A create or re-key whose 2xx reply fails the contract
   (`invalid_response`) may have made the pool. The panel says "The keys could not be read; the
   pool may exist — refresh and re-key it." and rereads the list.
9. **Rereads after a moved pool.** `pool_expired`, `pool_changed` and `not_found` on re-key,
   and `not_found` on revoke, reread the list so the row matches the sentence. A confirmation
   whose pool the reread shows revoked or gone is closed; `not_found` is then said at the panel.
10. **Expiry days are judged when a form opens** (`Draft.openedAt`, `Rekeying.openedAt`), not at
    the list's read time. Row chips still use the read time. The `invalid_body` sentences say
    "up to 90 days ahead".
11. **The keys note survives a reread that hides the panel** (`forbidden`): only the note is
    drawn until Done.

### Reviewed by eye

The browser spec's screenshots at 1280 and 375 px were reviewed: the empty list, the populated
list (Live, Expired, Revoked), the create dialog with its counts, the "keys downloaded" note,
the re-key confirmation, the `pool_expired` state, the revoke confirmation, and the
persons-kept state. The first pass put the actions beside the facts, so the dates wrapped and
the revoked row's columns did not line up. The actions moved onto the name line, the facts got
the full width, and dates take a full line on a phone. The persons-kept sentence no longer
repeats its heading, and the Revoked chip is muted, with only Expired drawn as needing action.

### Commands and results, slice 9

All on 2026-10-28 with `env -u CLAUDECODE`, on the laptop:

| Command                                                                                                                                                                        | Result                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `bun nx run-many -t lint typecheck -p wbs-fe-01`                                                                                                                               | "Successfully ran targets lint, typecheck for project wbs-fe-01 and 1 task it depends on"          |
| `bun nx run wbs-fe-01:test`                                                                                                                                                    | unit 1079 pass (87 files); UTC 4694 pass (237 files); zoned 5 pass (4 files); exit 0               |
| `TZ=Pacific/Auckland bunx vitest run src/components/organization/agent-pools-panel.test.tsx`                                                                                   | 31 pass (the zoned config only collects `*.zoned.test.*`, so this was run by hand)                 |
| `bunx playwright test -c tmp/pool-shots.config.ts` (a local config that serves only Vite on :7480 and runs `e2e/agent-pools.spec.ts`; every `/api` is answered at the browser) | 8 pass, at 1280 and 375 px                                                                         |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                    | exit 0 (review debt only in two existing indexes: store-memory 53/40 and core plan-commands 48/40) |
| `bunx openspec validate --all --json`                                                                                                                                          | 301 items, 301 passed                                                                              |
| `bunx prettier --check` and `plaintext-secrets.ts` on every changed file                                                                                                       | clean, exit 0                                                                                      |

Not run: the h2puni gate, the ordinary `bun run e2e` stack locally (CI runs the new spec there), and be-01 or mcp-01 suites (neither changed).

### Failure-proof table, slice 9

Each fault was injected into the production file, the panel's test file was run, and the fault was then reverted. The `Proof:` comment sits beside the check. "Panel" is `agent-pools-panel.test.tsx`.

| #   | Check                                              | Fault injected                                           | Test that observed it failing                                                                                     |
| --- | -------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Q1  | keys never reach the DOM                           | the first key rendered in a hidden span of the keys note | panel `creates a pool, downloads its keys exactly once and never renders them`: the page held `wbs_mk_`           |
| Q2  | one download per 201                               | `downloadAgentPoolKeys` called twice on create           | the same test: 2 files saved, 1 expected                                                                          |
| Q3  | re-key always sends a JSON body                    | `body` dropped when the expiry is kept                   | panel `re-keys with a JSON body, {} …` and four more re-key cases: no request was sent and no keys note was drawn |
| Q4  | `removePersons` starts off                         | the checkbox starts checked                              | panel `revokes without removing persons unless asked…` and four more revoke cases                                 |
| Q5  | `?removePersons=true` only when asked              | the query sent always                                    | panel `revokes without removing persons…`: `search` was `?removePersons=true`                                     |
| Q6  | counts gate the create                             | `fits` ignores the headroom                              | panel `states the counts and holds a pool that does not fit`: the button was enabled                              |
| Q7  | no counts without the limits read                  | only the pool reply judged                               | panel `renders a failed limits read as the panel failure…`: no alert                                              |
| Q8  | `pool_expired` asks for a new expiry               | sent to the in-place sentence                            | panel `offers a new expiry when the pool expired`: no required `New expiry` field                                 |
| Q9  | `persons_not_removed` is a partial success         | sent to the alert                                        | panel `renders persons_not_removed as revoked with persons kept`: no partial-success state                        |
| Q10 | a read's `forbidden` hides the panel               | drawn as a failure                                       | panel `renders no panel when … answers forbidden` (pools and limits)                                              |
| Q11 | members and viewers send nothing                   | the slot draws for every role                            | panel `sends no pools request and renders no panel for a member` (and a viewer)                                   |
| Q12 | a failed role read is rendered                     | the slot draws nothing                                   | panel `renders a failed role read with retry, and recovers`                                                       |
| Q13 | late replies from another organization are dropped | the generation fence removed                             | panel `never shows the previous organization's pools after a switch`                                              |
| Q14 | writes are serialized                              | the `isPending` admission removed                        | panel `serializes a double-clicked re-key`: 2 re-key POSTs                                                        |
| Q15 | `name_taken` has its own sentence                  | the `not_found` sentence used                            | panel `renders name_taken on create and keeps the draft, never as success`                                        |
| Q16 | the page composes the slot                         | `AgentPoolsSlot` removed from the page                   | `organization-page.test.tsx` `composes the agent pools panel for an admin`                                        |

### Review of PR #774 (Fable, high), how each item is addressed

| Item | Fix                                                                                                                                                                                                                                                                                    | Fault injected                                         | Test that observed it failing                                                                                                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 | the keys file is held as a blob until Done, the next write or unmount, and saved again from that blob; the anchor is attached for the click; the URL is revoked on release, not after the click (note 7)                                                                               | no revoke on Done                                      | panel `saves the same file again without a request, and releases it on Done`                                                                                                                         |
| S2-1 | same                                                                                                                                                                                                                                                                                   | an empty unmount cleanup                               | panel `releases the held file when the panel unmounts`                                                                                                                                               |
| S2-1 | same                                                                                                                                                                                                                                                                                   | "Save the file again" saves nothing                    | panel `saves the same file again…` (1 save, 2 expected)                                                                                                                                              |
| S2-1 | same                                                                                                                                                                                                                                                                                   | the anchor clicked detached                            | panel `creates a pool, downloads its keys exactly once…` (`attached: [false]`)                                                                                                                       |
| S2-1 | same                                                                                                                                                                                                                                                                                   | no release when the next write starts                  | panel `releases the previous file when the next write starts`                                                                                                                                        |
| S2-1 | same                                                                                                                                                                                                                                                                                   | `deliver` saves twice                                  | panel `creates a pool…`, `re-keys with a JSON body…`, `saves the same file again…`, `serializes a double-clicked re-key`                                                                             |
| S2-1 | Q1 rechecked on the new path                                                                                                                                                                                                                                                           | the first key appended to the note's file name         | panel `creates a pool…` and `re-keys with a JSON body…`: the page held `wbs_mk_`                                                                                                                     |
| S3-1 | reread after re-key `pool_expired`                                                                                                                                                                                                                                                     | the reread skipped                                     | panel `rereads after pool_expired so the row says Expired`: the row said Live                                                                                                                        |
| S3-1 | reread after re-key `not_found`, said at the panel                                                                                                                                                                                                                                     | the reread skipped                                     | panel `says a re-keyed pool is gone, rereads, and drops its row`                                                                                                                                     |
| S3-1 | reread after revoke `not_found`                                                                                                                                                                                                                                                        | the reread skipped                                     | panel `renders a refused revoke in place and rereads after not_found`                                                                                                                                |
| S3-1 | a confirmation for a revoked or gone pool is closed after a reread; the panel JSDoc says which writes reread                                                                                                                                                                           | the closing removed                                    | panel `closes a re-key whose pool the reread shows revoked`                                                                                                                                          |
| S3-2 | unreadable 2xx keys reply: the sentence and a reread (note 8)                                                                                                                                                                                                                          | drawn as the dialog's sentence                         | panel `says the keys could not be read and rereads`: no reread                                                                                                                                       |
| S3-2 | the mutate-side generation fence now has its negative                                                                                                                                                                                                                                  | the fence after the create POST removed                | panel `never saves a create's keys after an organization switch`: org-a's keys were saved                                                                                                            |
| S3-3 | a save that throws reaches the Error Boundary                                                                                                                                                                                                                                          | — (the test is the negative: `createObjectURL` throws) | panel `a save that throws reaches the error boundary`                                                                                                                                                |
| S3-3 | re-key `invalid_body` and `insufficient_scope`, revoke `insufficient_scope` and a transport failure                                                                                                                                                                                    | — (rendered-state tests)                               | panel `renders invalid_body on re-key in place`, `renders insufficient_scope on re-key in place`, `renders insufficient_scope on revoke`, `renders a transport failure on revoke and keeps the pool` |
| S4   | `agentPoolRefusalText` takes the operation; the effect's ref copy is `fence`; `isPending` and `isSending` are documented; expiry bounds come from the form's open time (note 10); `invalid_body` says "up to 90 days ahead"; an expired pool's confirmation says its keys have expired | —                                                      | existing tests, copy updated                                                                                                                                                                         |
| S4   | the keys note survives a `forbidden` reread (note 11)                                                                                                                                                                                                                                  | `absent` returns null with a note held                 | panel `keeps the keys note when the reread hides the panel`                                                                                                                                          |
| S4   | a Refresh keeps the keys note                                                                                                                                                                                                                                                          | the note cleared on refresh                            | panel `creates a pool…`: no note after Refresh                                                                                                                                                       |

The browser spec now saves the file again (a second `download` event with the same name) and
checks the reread's Expired chip after `pool_expired`. Its stub marks the pool lapsed when it
answers `pool_expired`. The screenshots of the note and the `pool_expired` state were taken
again and reviewed. The `/api/onboarding` answer in this spec is `selection_required`, unlike
`organization.spec.ts`'s `onboarding_inactive`, because the panel needs an activated
organization; CI's ordinary e2e job ran it (see the PR).

Commands for the fixes, 2026-10-28 with `env -u CLAUDECODE`, on the laptop:
`bun nx run-many -t lint typecheck -p wbs-fe-01 --skip-nx-cache` succeeded;
`bun nx run wbs-fe-01:test --skip-nx-cache` gave unit 1079, UTC 4707 and zoned 5 passing, exit 0;
`agent-pools-panel.test.tsx` 44 pass; the browser spec 8 pass at 1280 and 375 px;
`openspec validate --all --json` 301 of 301.

**Cross-PR finding from the #772 review (S2-2).** The note's import hint was
`twilight-dash pool import <file>`, which fails the CLI's usage (`--store <dir>` is required),
and a browser saves the file 0644, which the import refuses (it needs owner-only 0600). The
note now shows two commands, `chmod 600 <file>` and `twilight-dash pool import <file> --store
~/.config/wbs/pools`, and still says to delete the file. `~/.config/wbs/pools` is a placeholder
store until a canonical one is named. The create test pins both lines exactly; the screenshot
was taken again (the commands scroll inside their own box at 375 px; the page does not).

## Slice 10: `twilight-dash pool import` (task 6.4)

Built on branch `feat/dash-pool-import-10` from `plan/wbs-mcp-agent-surface-2` at 1c0664ce9,
2026-10-28. Every test below ran under `env -u CLAUDECODE` on the laptop; nothing ran on h2puni.

What landed:

- `twilight-dash pool import <pool-keys.json> --store <directory>`
  ([`pool-import.ts`](../../../apps/twilight-structure/twilight-dash/cli/src/mcp/pool-import.ts)),
  dispatched by `entrypoint.ts` beside `mcp`, so it never loads `cli.ts`'s command graph.
- `machine-token.ts` gains `ApiKey.of` (a key from a validated document), `ApiKey.credentialId`,
  `ApiKey.writeNew` (a new `0600` file, never following a link), `IssuedToken`, and
  `postTokenRequest`, the redirect-refusing POST that `mcp token` used inline and now shares
  with the import's proof issuance. Its `Proof:` comment moved with it.
- The Dash README's [`pool import`](../../../apps/twilight-structure/twilight-dash/cli/README.md#pool-import)
  section, an agent-pools spec requirement with four scenarios, and design.md M7's delivery
  bullet naming the store and the run.

### Slice 10 notes (assumptions taken)

1. **The store is the key files `mcp token --key-file` reads, not a second store.** `mcp token`
   has no store of its own: it reads an owner-only file named by `--key-file`. The import
   writes exactly that file per agent, plus a `--mcp-config` file per agent whose
   `headersHelper` names it, under a required `--store` directory (no default: a missing
   location is not guessed; the README's convention is `~/.config/wbs/pools`). The
   directory is created with any missing parents `0700`, and refused when it is a link or other
   users can enter it.
2. **The run is `pool-<poolId>/<personId>`, fixed per agent, not per process start.** M15 needs
   a run that survives re-fetches, and mcp-01 caps distinct runs per credential per day, so a
   fresh run per process start would orphan leases on every restart and spend that budget. A
   deterministic run also survives a re-key, so 8.1's "re-key mid-run" keeps the agents'
   leases. Two processes started on one config share a run; the README says to start one per
   config. Ids are held to `[A-Za-z0-9_-]{1,100}` (be-01 mints UUIDs), so the run is at most
   206 characters and never secret-shaped.
3. **Every key is proven before anything is written.** The proof is one `client_credentials`
   token request per agent, with its run, through the same `postTokenRequest` as `mcp token`;
   the bearer is dropped (never stored or printed, valid until it expires). Sequential. A pool
   of N spends N issuances of mcp-01's per-source bucket (`machine-limits.ts` `M10_LIMITS`:
   burst 100, 5 a second), which every agent on the host shares: a pool of 100 empties the
   burst, and agents started right after meet `429`s. The import waits out a `429` per its
   `Retry-After`, at most 60 s and three times per agent, then aborts with `wait N s and rerun`;
   the README says to wait about N/5 s after a large import before starting agents.
4. **Atomic replacement by a link switch.** `rename(2)` cannot replace a non-empty directory,
   so `pool-<poolId>` is a link to a generation `.pool-<poolId>.<16 hex>`; a re-import writes a
   new generation and renames a new link over the old one, then removes every other generation
   of the pool and every pending link (a crashed import's leftovers included). Key
   paths in the configs name the link, so a helper started before a re-key reads the new key
   on its next run. A `pool-<poolId>` that is not such a link is refused, never replaced.
5. **The downloaded file must be `0600`** (the most restrictive reading). A browser saves it
   `0644`; the refusal names the fix with the path, `run: chmod 600 '<path>'` (the path is not
   secret: a key pasted as the path is refused before). **Standard input is not accepted**: a pipe has no
   owner or mode to check, and the panel's download is a file anyway.
6. **`authorizationServer` must equal `<mcpResource>/oauth`**, the issuer `mcp token` derives.
   Otherwise the proof would test one server and the helpers would ask another.
7. **Dash keeps its own copy of the document shape.** The product fence refuses
   `@wbs/contracts` in Dash's `mcp/` (lint: "can only depend on libs tagged with
   product:twilight-dash, product:shared"), so `PoolKeys` mirrors `agentPoolKeys` and narrows
   it. The two are pinned by a committed document,
   `cli/src/mcp/testing/pool-keys.v1.json`: Dash's tests import it, and contracts'
   `agent-pool-shapes.test.ts` reads its bytes (no import across the fence; contracts lint is
   clean) and requires `agentPoolKeys.allows` it. Its secrets are 43 `*`, so the
   plaintext-secrets hook (which has no allowlist) does not match; Dash's test substitutes
   real-shaped ones. The contracts `test` targets list it as an input.
8. **No file locking; a lost race is loud and leaves no key.** Each import removes, after its
   switch, every generation of the pool but the one `pool-<poolId>` links to, then re-reads the
   link: when it is not its own generation (or its generation is gone), it exits non-zero
   (`another import replaced pool … concurrently`). The overtaken import's generation, and any
   generation a concurrent import was still writing, is removed (that import's write or rename
   then fails, or its re-read does). The race is proven through a `PoolFiles.rename` seam that
   switches the link right after this import's switch. An operator still runs one import at a
   time.
9. **The cleanup of a partial generation** is now proven through the `PoolFiles.writeNewText`
   seam failing with ENOSPC after the first key file (G3).
10. The output names the pool name, each agent's person name, id, run and config path, and
    the downloaded file to delete. `pool.json` and the configs hold no key.

### Commands and results, slice 10

All on 2026-10-28 with `env -u CLAUDECODE`, on the laptop:

| Command                                                                           | Result                                                               |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `bunx nx run-many -t typecheck lint -p twilight-dash --skip-nx-cache`             | "Successfully ran targets typecheck, lint for project twilight-dash" |
| `bun test … src/mcp/pool-import.test.ts src/mcp/token-command.test.ts` (Dash cli) | 35 pass, 0 fail                                                      |
| `bun test … src/mcp/mcp-token.boot.test.ts` (real be-01 + mcp-01)                 | 9 pass, 0 fail                                                       |
| Burokrat `check-indexes working . HEAD` (after the commit)                        | exit 0                                                               |
| `bunx openspec validate --all --json`                                             | 301 items, 301 passed                                                |
| `bunx prettier --check` on every changed file                                     | "All matched files use Prettier code style!"                         |
| CI run 40622098433 on ad3d85fcc                                                   | success (gate workspace, gate twilight, pixels)                      |

After the review fixes (2026-10-28, `env -u CLAUDECODE`):

| Command                                                                                              | Result                                                    |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `bun test … src/mcp/` (Dash cli: pool import, token command, machine token, workload provider, boot) | 66 pass, 0 fail                                           |
| `bunx nx run-many -t typecheck lint -p twilight-dash wbs-contracts --skip-nx-cache`                  | "Successfully ran targets typecheck, lint for 2 projects" |
| `bunx nx run wbs-contracts:test --skip-nx-cache`                                                     | 610 pass, 0 fail                                          |
| `bunx openspec validate --all --json`                                                                | 301 items, 301 passed                                     |
| `bunx prettier --check` on every changed file                                                        | "All matched files use Prettier code style!"              |

The full local `nx run twilight-dash:test` ran, but its output was filtered badly and its
summary lost, so it is not claimed; CI's `gate twilight` and `gate workspace` carry it. Not run:
the h2puni gate, other projects' suites (only Dash changed), tool-devsync (no tool touched).

### Failure-proof table, slice 10

Each check was watched failing with the fault injected into `pool-import.ts` (F13: into
`machine-token.ts`), running `pool-import.test.ts`, then restored (`diff` against the saved copy
empty). The `Proof:` comment sits beside the check or its test.

| #   | Check                                                       | Fault injected                                                 | Test that observed it failing                                                                                                                                                          |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | a key that fails to issue aborts the import                 | `proveIssues(…).catch(() => undefined)` in the loop            | `a key that fails to issue aborts the import with nothing written` and `a refused re-import keeps the pool as it was` resolved; the entrypoint test's refused import exited 0 (3 fail) |
| F2  | each agent its own run                                      | `runOf(\`pool-${poolId}\`)` for every agent                    | `stores each agent its key file and MCP config, each with its own run`                                                                                                                 |
| F3  | no key in the output                                        | `deps.write(JSON.stringify(pool.agents))` before the last line | the same test (`not.toContain('wbs_mk_')`) and the entrypoint's `prints no key on success or refusal…`                                                                                 |
| F4  | an unknown version is refused naming it                     | the version gate disabled                                      | `refuses an unknown document version…`: "Validation failed for version" instead                                                                                                        |
| F5  | the pool key file is owner-only                             | `readFileSync` for `readOwnerOnly`                             | `refuses a group-readable pool key file`                                                                                                                                               |
| F6  | `authorizationServer` is the one `mcp token` asks           | the check disabled                                             | `refuses an authorizationServer that mcp token would not ask`                                                                                                                          |
| F7  | a key is of its credential                                  | the check disabled                                             | `refuses a key that names another credential, and an agent listed twice`                                                                                                               |
| F8  | an agent is listed once                                     | the check disabled                                             | the same test: "pool pool-a could not be written; the store keeps what it had" (EEXIST) instead                                                                                        |
| F9  | the store is `0700` and the user's                          | the check disabled                                             | `refuses a store other users can enter`: the import resolved                                                                                                                           |
| F10 | a key pasted where the path belongs is refused unechoed     | the check disabled                                             | `refuses a key pasted where the file belongs`: "the pool key file does not exist" instead                                                                                              |
| F11 | a re-import switches the pool in one rename                 | the rename only on a first import                              | `a re-import replaces the pool keys, and an agent absent from it loses its key`: fleet-1's first key read                                                                              |
| F12 | the replaced generation is removed                          | the sweep skipped (re-run after review: G10)                   | the same test: two generations of pool-a                                                                                                                                               |
| F13 | `ApiKey.of` admits only a `wbs_mk_` key                     | its check disabled                                             | `refuses a document whose key is no wbs_mk_ key, never echoing it`                                                                                                                     |
| F14 | a `pool-<poolId>` this Dash did not write is never replaced | `assertImportedPool` accepts a non-link                        | `refuses to replace a pool directory it did not write`: "pool pool-a could not be written; the store keeps what it had" instead                                                        |

The boot test `twilight-dash pool import (task 6.4)` in `mcp-token.boot.test.ts` adds the real
path: be-01's grant route and mcp-01's production entrypoint issue the proof token; the stored
`headersHelper`, run by `sh -c`, prints a bearer whose `wbs_run` is `pool-pool-boot/claire` and
which calls `getApiProjects` (200); after the fixture revokes the key, re-importing the same
document is refused after one `401` and the stored key file is unchanged. No fault was injected
into it separately: it exercises the checks F1 to F13 already prove.

### Review of PR #772 (Fable, high), how each item is addressed

No S1. The review confirmed the secret core: the key only through `--key-file`, 0600 and 0700,
`O_EXCL | O_NOFOLLOW` independent of umask, proof before write for every agent, and the quoting.

| Item | Fix                                                                                                                                                                                                                                                                                  | Proof       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| S2-1 | after the switch, every `.pool-<poolId>.<16 hex>` (and pending `.link`) but the link's target is removed; the link is re-read and an import overtaken by another exits non-zero; note 8 rewritten                                                                                    | G1, G2, G10 |
| S2-2 | the mode refusal names `run: chmod 600 '<path>'`; `--store` parents are created `0700`; README and tasks.md give the two lines `chmod 600 <file>` and `twilight-dash pool import <file> --store <dir>`, with the documented store `~/.config/wbs/pools` (the fe-01 panel's, slice 9) | G4, G8      |
| S3-1 | note 3 corrected (a pool of N spends N issuances of the per-source bucket); a `429` is waited out per `Retry-After`, at most 60 s and three times per agent, then `wait N s and rerun`; README: wait about N/5 s before starting the agents                                          | G7, G9      |
| S3-2 | a `PoolFiles` seam (`writeNewText`, `rename`; production passes `systemPoolFiles`); ENOSPC after the first key file leaves the store exactly as it was                                                                                                                               | G3          |
| S3-3 | `cli/src/mcp/testing/pool-keys.v1.json`, used by `pool-import.test.ts` and read (not imported) by contracts' new `agent-pool-shapes.test.ts`; contracts lint is clean                                                                                                                | G11         |
| S3-4 | negatives for a linked `--store` and a `pool-<id>` link to `/etc` (refused; `/etc` and the link untouched)                                                                                                                                                                           | G5, G6      |
| S4   | the dead `isAbsolute` check is gone; `proveIssues`' JSDoc says each proof mints a discarded bearer; `MOST_AGENTS` names the 64 KiB cap (100 agents measured at 32,802 bytes); README: after a Bun upgrade that moves `bun`, re-key and re-import or fix the configs' path            | —           |

## Slice 11: load evidence (task 4.3)

**Result.** Every M10 fence holds exactly against real processes, and nothing failed, busied
SQLite or logged an error. **The design load itself does not hold:** one be-01 sustained
85.9 of the 200 calls a second, with p50 1.1 s. be-01's CPU per call is the binding limit, not
any M10 fence (see the deviation below). 40 agents (80 calls a second) hold, with be-01 already
near one core.

### How it ran

- **Driver.** `apps/wbs/mcp-01/src/load/m10-load.ts` (its JSDoc lists the phases). be-01 is
  `apps/wbs/be-01/src/testing/mcp-load-backend.ts`: production `buildServices` and `buildApp`
  from the composed organization harness, over a freshly migrated SQLite file in `/tmp`, with
  machine grants and a load-only `/__load/delay` hold on `/api`. mcp-01 is
  `src/load/mcp-01-loopback.ts`: `startMcpApplication` composed as `main.ts` composes it, with
  `MachineTrafficLimits` built by `mcpOAuthFromEnv`, bound to `127.0.0.1`. Each runs as its own
  Bun process. The driver is a third process speaking raw HTTP: `client_credentials` with Basic
  and `wbs_run=load-run-<person>`, then single JSON-RPC `tools/call` posts to `/mcp`, stateless.
- **Seed.** org-a has 100 agent persons bound to one super admin, org-b has 10, and each agent
  has one API key and its own leaf in its organization's one project. All are written into
  SQLite the way the tests do it. Every secret (the be-01↔mcp-01 secret, the grant key, the RSA
  signing key, the store key, the API keys) is generated per run and never printed. The temp
  directory is removed at the end.
- **Source address.** `MCP_TRUSTED_PROXY_HOPS=1`, and every token request sets one
  `X-Forwarded-For` entry from TEST-NET-2, one address per phase.
- **Host.** h2puni (AMD EPYC-Genoa, 8 vCPU, 15 GiB, shared: load average 9.2 at the 100-agent
  start, 5.6 at the 40-agent start). Bun 1.4.4. The checkout was a detached `git worktree`
  (`~/puni-00-load-tbf`) of the gate tree's repository at **16bf197ee** (this branch's driver commit on plan head 12a51df0b; the later merge of af44c632d, PR #772, changed no be-01 or mcp-01 runtime file), with
  `bun install --frozen-lockfile`. It has been removed since.
- **Command**, via `~/m10-load-runs/run.sh` started with `nohup setsid`:
  `HEAVY_LOCK_LABEL=m10-load:16bf197ee HEAVY_LOCK_WAIT_SECONDS=3600 bin/with-heavy-lock.sh --
env -u CLAUDECODE bun apps/wbs/mcp-01/src/load/m10-load.ts --agents=100 --steady-seconds=300`.
  The first attempt gave up after its 3600 s queue behind a gate (`bd4a837f`, exit 75, nothing
  ran). The second waited 1951 s, ran, and **exited 1** on one expectation: `steady: at least
95% of the design rate`. `--agents=40 --steady-seconds=120` then exited 0, with all 18
  expectations holding.
- **What "in flight" means here.** It is the driver's outstanding `/mcp` requests per
  organization, an upper bound on mcp-01's slots. CPU and RSS are sampled from `/proc` every
  1 s (every 100 ms in the burst). A CPU figure over 100% is Bun's other threads (GC, I/O).

### 1. Issuance burst (100 agents, source `198.51.100.10`)

| Measure                    | Value                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| issued at once             | 100 of 100, wall 169 ms                                                                     |
| latency p50 / p95 / p99    | 159.5 / 165.7 / 165.8 ms (max 168.5)                                                        |
| the 101st, at once after   | **429**, `{"error":"invalid_request","error_description":"rate_limited"}`, `Retry-After: 1` |
| be-01 CPU mean / peak, RSS | 81.9% / 85.1%, 414 MiB                                                                      |
| mcp-01 CPU mean / peak     | 140.5% / 170.3%, 435 MiB (RS256 signing of 100 tokens)                                      |
| 40 agents (second run)     | 40 of 40, p50 108 ms, p99 112 ms                                                            |

### 2. Steady design load (100 agents, 300 s)

Each agent runs claim → `postApiClaimsRenew` → `getApiProjectsByIdClaims` → release on its own
leaf, one call each 500 ms, sequentially (no catch-up), with its own token and `wbs_run`.

| Measure                     | 100 agents (design: 200 calls/s)     | 40 agents (80 calls/s)     |
| --------------------------- | ------------------------------------ | -------------------------- |
| calls, achieved rate        | 26,048 in 303 s, **85.9/s**          | 9,720 in 122 s, 79.7/s     |
| outcomes                    | 26,048 ok; 0 tool errors, 0 HTTP 429 | 9,720 ok                   |
| latency all p50 / p95 / p99 | **1,117 / 1,804 / 2,004 ms**         | 68.6 / 309 / 404 ms        |
| commands (claim, release)   | p50 1,290, p99 2,120 ms              | p50 140, p99 434 ms        |
| heartbeat                   | p50 1,078, p99 1,935 ms              | p50 55, p99 339 ms         |
| claims read                 | p50 919, p99 1,895 ms                | p50 7.5, p99 28 ms         |
| org-a in flight, peak, mean | 100 (of 128), 99.2                   | 36, 8.0                    |
| be-01 CPU mean / peak, RSS  | 115.9% / 164.9%, peak 1,427 MiB      | 97.6% / 146%, peak 910 MiB |
| mcp-01 CPU mean / peak, RSS | 15.4% / 40%, 451 MiB                 | 14.5% / 32%, 401 MiB       |
| driver CPU mean             | 4.2%                                 | 3.8%                       |
| SQLite busy, error lines    | 0, 0 (both logs)                     | 0, 0                       |

### 3. Fences (100-agent run; the 40-agent run's figures are the same)

| Fence                                       | Sent                                                                                    | Observed                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| per credential, 10/s burst 20, single calls | 40 at once by `org-a-agent-1`, while the other 99 kept their pace                       | 20 ran, 20 were **HTTP 429**, `Retry-After: 1`, `{"error":"rate_limited"}`; the 99 made 1,268 calls with 0 failures                 |
| per credential, a batch                     | one JSON-RPC batch of 30, after refill                                                  | HTTP 200 array: 20 ran, 10 tool errors `getApiProjectsByIdClaims could not be called: rate_limited (429). Retry after 1 s.`         |
| org in flight, 128                          | be-01 held 1.5 s per `/api` call; 150 calls at once from 15 org-a credentials (10 each) | **exactly 128 ran, 22 were HTTP 429**, `Retry-After: 1`; org-b's 10 agents meanwhile: 40 calls, 0 failures (p50 1,517 ms, the hold) |
| org in flight, undelayed (observed only)    | 200 calls at once from 20 org-a credentials                                             | 128 ok, 72 HTTP 429 (p50 117 ms, p99 460 ms): be-01's queue alone holds 128 calls                                                   |
| failed auth per IP, 30/min                  | 40 unknown credentials, one by one, from `198.51.100.30`                                | 30 × 401 `invalid_client`, then 10 × 429 `rate_limited`; a valid org-b client from `198.51.100.31`: 200                             |
| failed auth per `(client_id, IP)`, 5/min    | 6 wrong secrets for `org-a-agent-2`'s real id from `198.51.100.40`                      | 401 × 5, then 429; the holder's right secret from `.40`: 429 (the failure buckets are read first, M10); from `.41`: 200             |

### Deviation from M10: one be-01 carries about 85 calls a second, not 200

- **What was seen.** At 100 agents every call queued in be-01. Throughput was 85.9 calls a
  second, latency was about 1.1 s, and the agents' in-flight count sat at 100. It stayed under
  128 only because each agent waits for its answer. With about 130 such agents, the
  organization would meet `too_many_in_flight` at the same 86 calls a second, and the
  per-replica fence would be refusing load that be-01 could not serve anyway. M10's "about 60
  in flight at the design load" assumes 300 ms calls at 200 a second. On this host the service
  time is 11 to 12 ms of be-01 CPU per call, about 86 a second for one core.
- **The cause: be-01 CPU per call.** mcp-01 stayed at about 15%, and the driver at about 4%.
  A local 40-agent run with `bun --cpu-prof-md` on be-01 (a one-off, not committed) gave, by
  share of be-01's samples (seeding included):
  - drizzle building SQL per query (`buildQueryFromSourceParams`, 31% total) and SQLite
    statement preparation per query (`prepare`, 16% self). No hot statement is prepared once.
  - endpoint lookup (`mount.ts` `onRequest`: `matchPath` over every endpoint, then a sort, for
    every request), about 10%.
  - per-request rereads: the machine credential (`findById`, 8%), the activation marker
    (`readOrganizationActivation`, 6%), organization access (`resolve`, about 3%).
  - `secretMatches` hashing both sides on each request (`mcpSecretOf`, 3.5%).
  - the load backend's own request copy (`mcp-load-backend.ts` fetch wrapper, about 5% self).
    Production be-01 has no such wrapper, so the harness overstates be-01's cost by about that
    much.
  - At 40 agents, reads took 7.5 ms at p50 while claim and release took 140 ms. Writes also
    wait their turn on the serialized write path.
- **Proposed fixes** (not in this PR; for the lead to schedule):
  1. Prepare the hot statements once (the credential reread, the activation marker, the claims
     reads and the lease renewal), or cache drizzle's prepared queries.
  2. Index the endpoint table once by method and segment count (or a literal-prefix trie)
     rather than matching every endpoint per request.
  3. Cache the activation marker with the existing marker-change signal, and compute the
     expected secret's SHA-256 once in `identityResolver`.
  4. Re-run this driver after each. Until then, document the measured per-replica capacity
     (about 85 calls a second on h2puni) beside M10's table, and size swarms to it. Under
     M10's 2 calls a second per agent, that is about 40 agents per be-01.

  Retuning a fence would not help: the fences are right, and be-01 is the bottleneck.

- **Not a deviation.** The HTTP 429 body says `rate_limited` for `too_many_in_flight` too (only
  `Retry-After` differs). This is section 4 note 6's documented form, and the batch form names
  the reason.

### Proofs for the driver

| Check                                   | Fault injected                                                   | Observed                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| exit 1 on a violated expectation        | the in-flight expectation raised to the limit + 1                | 20-agent local run exited 1 naming `in-flight fence: 150 org-a calls…`                    |
| the error-line scan reads pino's labels | `"level":"(info\|fatal)"` in place of `"level":"(error\|fatal)"` | 20-agent local run exited 1 on `no error line in either log`, counting mcp-01's 161 lines |
| (real) the design-rate expectation      | none: the 100-agent h2puni run                                   | exited 1 on `steady: at least 95% of the design rate`                                     |

be-01 writes only its port line to stdout at `info` during the run, so be-01 contention would
show up as failed calls (counted per outcome) rather than in its log. The `SQLITE_BUSY` scan
has no injected-fault proof.

### Commands and results, slice 11

All on 2026-10-28 with `env -u CLAUDECODE`, on the laptop unless marked:

| Command                                                                                                    | Result                                                                      |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| h2puni, under the heavy lock: `bun apps/wbs/mcp-01/src/load/m10-load.ts --agents=100 --steady-seconds=300` | exit 1, 17 of 18 expectations hold (the design rate does not); tables above |
| h2puni, under the heavy lock: the same with `--agents=40 --steady-seconds=120`                             | exit 0, 18 of 18                                                            |
| local smoke `--agents=20 --steady-seconds=10`                                                              | exit 0, 17 of 17 (before the error-line expectation was added)              |
| `bunx tsc --build --force apps/wbs/mcp-01/tsconfig.json`, and the same for be-01                           | exit 0, exit 0                                                              |
| `bunx eslint apps/wbs/mcp-01/src/load apps/wbs/be-01/src/testing/mcp-load-backend.ts`                      | exit 0                                                                      |
| `bunx prettier --check` on every changed file                                                              | "All matched files use Prettier code style!"                                |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                | exit 0                                                                      |
| `bunx openspec validate --all --json`                                                                      | 301 items, 301 passed                                                       |

Not run:

- the h2puni gate;
- the mcp-01 and be-01 test suites (no production file changed; the new files hold no
  tests);
- a multi-replica run, and anything through Caddy, which the source address only simulates;
- OIDC (`jwt_bearer`) issuance under load (API keys only);
- the per-IP failure overshoot under concurrency (the flood was sent one by one);
- a run of the production `main.ts` be-01 (the harness composition was used);
- a repeat of the 100-agent run on a quiet host.

## Slice 12: be-01 call capacity (task 4.5)

**Result.** One be-01 now carries **120.6 calls a second** at 100 agents on h2puni, up from
**86.2** in the same lock window on the plan head (+40%). Every M10 fence holds exactly in both
runs; the design rate (200 a second) still does not, so M10's sizing is restated in design.md
(about 60 agents per be-01). No request-time security state is cached across requests; the
one precomputed value is each configured service secret's digest, derived from configuration
for the process's lifetime (there is no reload path).

### What changed, and why it is safe

1. **Statements stay compiled** (`libs/wbs/adapters/store-sqlite/src/db.ts`,
   `STATEMENT_CACHE_SIZE`). Drizzle's Bun adapter compiles through `Database.query`, whose
   per-connection cache held 20; one call issues about 80 distinct statements, so nearly every
   statement was compiled again (a local count over a 20-agent run: 80 distinct SQL texts,
   55,902 executions). The bound is now 1,024. The cache is private to its `Database`, so a
   replaced handle starts empty, and SQLite recompiles a cached statement after another
   connection's schema change (both observed in `db.db.test.ts`).
2. **Observation connections are reused** (`poolReadConnections`, wired in `source.ts`). After
   (1), `prepare` was still 10% of be-01's samples: every claims read and live-plan
   observation opened a read-only connection (a local count: 931 `BEGIN DEFERRED` compiles in
   10 s at 20 agents), compiled its statements and closed it. The pool lends an idle connection
   to one caller at a time. A connection released inside a transaction, beyond eight idle, or
   after the pool closed is closed, so no snapshot outlives its observation, and each
   observation's `BEGIN DEFERRED` reads what was committed by then. The source's `close` drains
   it. This is not the reader pool the ports-and-adapters history declined (2026-09-05 §10):
   no read runs in parallel, the same per-observation connections are kept open between uses.
   The two schedule handoff tests now count open snapshots (connections in a read
   transaction), since an idle pooled connection is open by design.
3. **Endpoint lookup is indexed** (`apps/wbs/be-01/src/http/endpoint-index.ts`). `mount.ts`
   matched every endpoint and sorted the matches per request; `indexEndpoints` buckets the table
   once by method (`HEAD` also reaching `GET`) and segment count, each bucket sorted by the same
   precedence, and takes the first match. The JSDoc states why that equals the old choice. Both
   production tables (145 and 151 endpoints) hold no two same-method paths one request could
   both match.
4. **Configured secrets are digested once** (`secretMatcher` in `http/identity.ts`). The
   presented secret is still digested and compared with `timingSafeEqual` per request.
5. `M10_LOAD_BE_PROFILE_DIR` lets the driver write a be-01 `--cpu-prof-md` profile.

**Not changed, on purpose.** The credential row, revocation, pool expiry, membership and
organization access are reread on every request, as before. The activation marker is not
cached: it is read inside the transactions it guards (about 60 call sites), and a cache would
need an invalidation proof across processes (blue/green share the file), so it was skipped. Its
two reads are now compiled once, which removes most of their cost. Durability is unchanged:
`synchronous` stays 2 (FULL) under WAL. `COMMIT`'s `run` is about 7% of be-01's samples, much
of it the WAL sync, and is left as is.

**Claim and release.** `EXPLAIN QUERY PLAN` over every hot statement found no table scan on a
per-request path except `SCAN project` (covering index) in `findCrossReferences` and
`SCAN step_blockage` in the step-blockage read, both over tiny tables here; no index was added.
Their 140 ms p50 at 40 agents (slice 11) was queueing: they load the whole project and run the
cross-reference check inside one serialized write turn. Locally at 40 agents they now take
p50 13 ms (73 ms on the plan head).

### Profile (local, 40 agents, before and after)

`prepare` fell from 12.8% of be-01's samples to under 0.1%; endpoint lookup (`matchPath` and
the mount filter) from about 6% to about 1.5%. What is left is mostly drizzle building SQL and
mapping rows for each query (about 25% self time in drizzle-orm), SQLite executing (`values`,
`all`, about 16%), `COMMIT` (about 7%) and Elysia's request handling. Removing drizzle's per-query build means `.prepare()` with placeholders for each hot
query, a per-repository change not made here.

Laptop runs (24 threads, not quiet; `--agents=40 --steady-seconds=60`, 80 calls a second
each), be-01 process CPU per call: plan head 9.97 ms; after (1)+(3) 8.57 ms; after all 8.25 ms
(a run with only the pool experiment added gave 7.61 ms). Laptop noise is about ±0.5 ms.

### h2puni, 100 agents, 300 s

`~/m10-load-runs/run12.sh` under `nohup setsid`: one `bin/with-heavy-lock.sh` session
(label `m10-load:04c774afb`, `HEAVY_LOCK_WAIT_SECONDS=14400`) ran
`env -u CLAUDECODE bun apps/wbs/mcp-01/src/load/m10-load.ts --agents=100 --steady-seconds=300`
in two detached worktrees of the gate tree's repository, `~/puni-00-load-tbf` at **04c774afb**
(this branch) and then `~/puni-00-load-base-tbf` at **5c403a1d9** (plan head), each with
`bun install --frozen-lockfile`. Both worktrees have been removed. A first attempt gave up after
its 3600 s queue behind the plan branch's gate (exit 75, nothing ran). Host: AMD EPYC-Genoa,
8 vCPU, shared; load average 8.8 at the first start, 7.0 at the last end.

| Measure                     | plan head 5c403a1d9           | this branch 04c774afb          |
| --------------------------- | ----------------------------- | ------------------------------ |
| calls, achieved rate        | 26,196 in 303.8 s, **86.2/s** | 36,480 in 302.4 s, **120.6/s** |
| outcomes                    | 26,196 ok                     | 36,480 ok                      |
| latency all p50 / p95 / p99 | 1,175 / 1,702 / 2,003 ms      | **809 / 1,158 / 1,447 ms**     |
| commands p50 / p99          | 1,439 / 2,096 ms              | 873 / 1,481 ms                 |
| heartbeat p50 / p99         | 1,117 / 1,901 ms              | 795 / 1,434 ms                 |
| claims read p50 / p99       | 731 / 1,784 ms                | 711 / 1,384 ms                 |
| be-01 CPU mean / peak       | 114.6% / 182%                 | 117.1% / 178.9%                |
| be-01 CPU per call          | 13.3 ms                       | **9.7 ms**                     |
| be-01 RSS peak / end        | 1,454 / 1,337 MiB             | 1,390 / 1,187 MiB              |
| mcp-01 CPU mean, RSS peak   | 15.8%, 464 MiB                | 20.9%, 470 MiB                 |
| org-a in flight peak, mean  | 100, 99.3                     | 100, 98.8                      |
| expectations                | 17 of 18 (design rate fails)  | 17 of 18 (design rate fails)   |
| exit                        | 1                             | 1                              |

Both runs saturate be-01 (100 agents always in flight), so the achieved rate is be-01's
capacity: 1 / 120.6 s is about 8.3 ms per call at saturation (from throughput). Every fence observed the same as in
slice 11 in both runs: per credential 20 admitted and 20 HTTP 429; the batch 20 ran and 10
tool errors; in flight exactly 128 and 22 HTTP 429, org-b 40 ok; failures 30 × 401 then 10 ×
429; `(client_id, IP)` 5 × 401 then 429, holder elsewhere 200; 0 error lines, 0 SQLite busy.

### Proofs

| Check                                                  | Fault injected                                                       | Observed                                                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| statement cache keeps a request's statements           | `Database.MAX_QUERY_CACHE_SIZE` assignment removed                   | `keeps a request-sized set of statements compiled` failed `toBe`                                              |
| index precedence (synthetic ambiguous table)           | buckets sorted `comparePaths(right, left)`                           | property failed, counterexample `GET /api/projects/active`                                                    |
| index takes the first match                            | last match returned                                                  | property failed, counterexample `GET /api/projects/%E0%A4%A`                                                  |
| `HEAD` reaches `GET` (synthetic)                       | `methods.add('HEAD')` dropped                                        | property failed, counterexample `HEAD /api/projects/active`                                                   |
| index over both production tables                      | `methods.add('HEAD')` dropped; bucketing the untrimmed pathname      | failed on `HEAD /api/projects/register/runtime-commands/0`; on `GET /health/`                                 |
| production tables and precedence                       | reverse sort (as above)                                              | passed: no ambiguous pair exists there, so precedence is proved on the synthetic table only                   |
| pool never keeps a snapshot                            | pooled regardless of `isInTransaction`                               | `closes a connection released inside a transaction` counted 1 open, expected 0                                |
| pool idle limit                                        | `idle.length >= idleLimit` dropped                                   | `keeps at most its idle limit…` counted 3 open, expected 2                                                    |
| pool closes late releases                              | `closed` test dropped                                                | the same test counted 1 open after close, expected 0                                                          |
| source drains its pool                                 | `reads.close()` dropped from the source's `close`                    | `reuses one read connection and closes every pooled one with the source` counted 1, expected 0                |
| no snapshot at the optimizer handoffs (schedule tests) | `observeCommitted`'s commit omitted **and** the pool's guard dropped | both `closes the …` cases failed (Retry 500; [1, 1] snapshots at the handoffs)                                |
| (same, single faults)                                  | commit omitted alone; guard dropped alone                            | both passed: either layer alone leaves no snapshot (the pool closes a connection released in its transaction) |
| secret matcher uses the configured secret              | compared the presented digest with itself                            | 3 failed: both machine-grant `internal_unauthorized` cases and the internal-secret identity test              |
| an absent configured secret matches nothing            | absent expected digested as `''`                                     | `matches a secret only against a configured one…` failed on `''`                                              |
| an absent presented secret matches nothing             | presented-absent test dropped                                        | the same test threw on `null`                                                                                 |

Revocation, pool expiry, member removal and deactivation still take effect on the next request
because nothing about them is cached; their existing tests ran unchanged in CI. No new cache of security state was added, so no new negative of that kind was
needed.

### Commands and results, slice 12

All on 2026-10-28 with `env -u CLAUDECODE`, on the laptop unless marked:

| Command                                                                                                                              | Result                                       |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| h2puni, under the heavy lock: the two 100-agent runs above                                                                           | exit 1 each, 17 of 18 (the design rate)      |
| `bun apps/wbs/mcp-01/src/load/m10-load.ts --agents=40 --steady-seconds=60`, plan head, this branch at each step                      | exit 0 each; CPU per call above              |
| the same with `M10_LOAD_BE_PROFILE_DIR` (before and after)                                                                           | exit 0; profiles above (not committed)       |
| `bun nx run wbs-store-sqlite:test --skip-nx-cache`                                                                                   | 2012 tests across 150 files, success         |
| `bun test` on be-01's `src/http/`, `src/app.routes.test.ts`, `schedule-organization`, `machine-grant`, elysia `identity`, `internal` | 132 pass; 73 pass; 45 pass; 0 fail           |
| `bun nx run-many -t typecheck lint -p wbs-be-01 wbs-store-sqlite wbs-mcp-01 --skip-nx-cache`                                         | success                                      |
| CI `ci` on 04c774afb (run 40656467339)                                                                                               | success                                      |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                          | exit 0                                       |
| `bunx openspec validate --all --json`                                                                                                | 301 items, 301 passed                        |
| `bunx prettier --check` on every changed file                                                                                        | "All matched files use Prettier code style!" |

### Review of PR #776

A Fable-high review found no S1. Its findings and what was done:

| Finding                                                                            | Change                                                                                                                                                                                                                                                                                                                                                                        | Proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1: the pool's lent/idle/closed ownership needs a model-based test               | `db.pool.model.db.test.ts`: `fc.modelRun` over acquire, a read transaction on a lent connection, release (committed or inside its transaction), a second release, a failing `open` and pool close; idle limit 0–3; 300 runs. States, events and invariants added to the `poolReadConnections` JSDoc. Named `.db.test.ts` so `test:api` runs it beside the other SQLite tests. | Each sabotage failed (fast-check's shrunk counterexample, first element the idle limit; seeds vary): released guard dropped → `[3, acquire, release(0, as is), releaseAgain(0), closePool]` (the second release closed it again, so open fell below idle plus lent); `closed` test dropped → `[3, acquire, closePool, release(0, as is)]`; idle limit dropped → `[2, acquire, acquire, acquire, release(0, …) × 3]`; in-transaction test dropped → `[2, acquire, read(0), release(0, as is)]` |
| S3-2: `observeCommitted`'s JSDoc let a read keep the handle, which a pool lends on | JSDoc corrected (answers are plain data and must not keep `db`); a lent handle is a proxy that throws on any use after its release                                                                                                                                                                                                                                            | handing out the connection's own `db` made `refuses a pooled handle used after its release` read through it                                                                                                                                                                                                                                                                                                                                                                                   |
| S3-3: no negative for the common path, a thrown read whose rollback succeeds       | `reuses a connection after a failed read and sees later commits`: pooled and reused (`{ now: 1, ever: 1 }`), the next observation sees the writer's insert, a full checkpoint runs                                                                                                                                                                                            | closing every released connection gave `{ now: 0, ever: 2 }`; omitting the rollback gave `{ now: 1, ever: 2 }` (released inside its transaction, so closed)                                                                                                                                                                                                                                                                                                                                   |
| S4: wording                                                                        | verify.md: the configured secret's digest is precomputed for the process's lifetime; design M10: "about 8.3 ms per call at saturation (from throughput)"; JSDoc: `MAX_QUERY_CACHE_SIZE` is a process-global static set on import, and pooled readers keep the old file on a rename-replace (a restore stops be-01 first)                                                      | none needed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Optional: a failed rollback masked the read's failure in `observeCommitted`        | an AggregateError of both, as `observeNow` does                                                                                                                                                                                                                                                                                                                               | rethrowing the read's failure alone failed `reports a read failure and its failed rollback together`                                                                                                                                                                                                                                                                                                                                                                                          |
| Optional: drop the `$client` cast                                                  | kept: the exported `Drizzle` type has no `$client`, and widening `Connection.db` to carry it would let every caller reach the raw client                                                                                                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Not run:

- the h2puni gate;
- be-01's and mcp-01's whole suites on the laptop (CI ran them);
- a two-be-01 run, so the restated sizing's second process is unmeasured;
- drizzle `.prepare()` per hot query, the next step if more is needed;
- a run on a quiet host.

## Slice 13 — pool swarm rehearsal (8.1 pre-dev)

Task 8.1's scenario on a throwaway stack, every part a real process over loopback HTTP, so the dev
run (waiting on a pool in the dev web app) is a formality. 8.1 stays open.

- be-01: `apps/wbs/be-01/src/testing/pool-swarm-backend.ts`, the composed harness (production
  `buildServices` and `buildApp`, fresh migrated SQLite in a temp directory), machine grants with
  a generated key, the claim lease sweep started as boot starts it, one activated organization.
  Its admin acts only through be-01's routes, as a browser session.
- mcp-01: the production entrypoint `src/main.ts`, standalone, `MCP_PUBLIC_URL`
  `http://127.0.0.1:<port>/mcp`, M10 limits, `MCP_TRUSTED_PROXY_HOPS=0`.
- Dash: the real CLI. `pool import` writes the store, and each agent's stored `headersHelper`
  runs `mcp token`.
- Agents: `apps/wbs/mcp-01/src/load/pool-swarm-agent.ts`, one process each, MCP SDK 1.31.0
  Streamable HTTP clients. Each runs its `<personId>.mcp.json` `headersHelper` through `sh -c` the
  way Claude Code does: when connecting, and again on an HTTP 401, then resends; never on an
  in-band tool error.
- Driver: `apps/wbs/mcp-01/src/load/pool-swarm-rehearsal.ts`. It exits 1 on any failed
  expectation. Boot test: `apps/wbs/mcp-01/src/pool-swarm.boot.test.ts` runs it clean, then with
  `--fault=skip-revoke`, in about 21 s.

The resource model:

- two divisible resources, RAM (capacity 24 GiB) and disk (40 GiB);
- six leaves, each demanding 8 GiB RAM and 10 GiB disk, so exactly three fit at once;
- each agent claims with `assign: true`;
- each agent registers a reported resource use (its disk copy) under its run.

### Timeline (laptop, 0b3d13127, 2026-10-28)

Times are milliseconds from the driver's start; the first 4.2 s is boot.

| ms   | Actor       | Event                                                                                                                                    |
| ---- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 4335 | admin       | `agent_pool_created`: pool `fleet`, 3 persons, 3 keys (201)                                                                              |
| 4520 | Dash        | `pool import`: exit 0, every key issued one proof token, no key printed                                                                  |
| 4726 | agents (3)  | `headersHelper` → `mcp token` issues; tools listed                                                                                       |
| 5240 | agents      | claimed: three distinct leaves, the losers of each race met `already_claimed` and took the next                                          |
| 5275 | agents      | resource uses registered (`active`)                                                                                                      |
| 5280 | agents      | heartbeat × 3: `leases: 2` each (its own two step claims, not the pool's six)                                                            |
| 5996 | agents      | released; resource uses → `cleanup_pending`                                                                                              |
| 6080 | agents      | claimed again (round 2)                                                                                                                  |
| 6087 | admin       | `agent_pool_rekeyed` (201): same persons, 3 new credentials                                                                              |
| 6218 | Dash        | `mcp token` with an old key: exit 1, `HTTP 401 invalid_client`                                                                           |
| 6393 | Dash        | `pool import` of the new document into the same store: exit 0                                                                            |
| 6402 | each agent  | heartbeat with its old bearer: tool error `machine_credential_refused`                                                                   |
| 6404 | each agent  | next heartbeat: HTTP 401, helper re-runs (new key through the store link), new jti, heartbeat ok                                         |
| 6831 | agents      | heartbeat × 3 ok; the claims kept their ids, holders and runs                                                                            |
| 7522 | agents      | released                                                                                                                                 |
| 7586 | agents      | claimed (round 3), copies registered, heartbeat × 3 ok                                                                                   |
| 8255 | admin       | `agent_pool_revoked` (200): `revokedCredentials: 3, removedPersons: 0`                                                                   |
| 8268 | be-01       | the lease sweep settled: 0 claims left. Leases ended in the revoke, and the tick the revoke asked for released them                      |
| 8298 | each agent  | heartbeat: `machine_credential_refused`, then HTTP 401, then the helper exits 1 (`HTTP 401 invalid_client`)                              |
| 8900 | 2 agents    | one more helper run the agents did not ask for (origin not traced; likely the SDK transport after the failed call), refused the same way |
| 8974 | admin, Dash | spare pool of 1 created and imported; its agent claims                                                                                   |
| 9231 | admin       | `agent_pool_revoked` with `removePersons=true`: `revokedCredentials: 1, removedPersons: 1`                                               |

### Assertions (136, all held; laptop and h2puni)

| Area          | Assertion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create        | 201; `pool import` exits 0 and prints no key; the cap's `agentPersons` rises by 3; the listing shows 3 live credentials; each run is `pool-<poolId>/<personId>`                                                                                                                                                                                                                                                                                                                                                                            |
| Tools         | each agent lists `getApiProjectsByIdStartable`, `postApiProjectsByIdCommands`, `postApiClaimsRenew` and `postApiProjectsByIdResourceUses`, and none of `HUMAN_ONLY_OPERATIONS`; the four pool operations are in that set                                                                                                                                                                                                                                                                                                                   |
| Claims        | every claim succeeds on a distinct leaf, acquiring 8 GiB RAM and 10 GiB disk; the admin's `/claims` shows each held by its pool person under its own distinct run; `/startable` shows the holder as assignee; RAM 24 and disk 30 occupied; the other three leaves `doesNotFit`; person work lists the claim under the run                                                                                                                                                                                                                  |
| Heartbeat     | each answers `ok` with `leases` equal to its own claim count (run scoping, M15)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Release       | every unit is freed, no claim is left, and each resource use goes to `cleanup_pending`                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Re-key        | 201, the same persons with disjoint credentials; no agent person consumed; the old key issues nothing; the listing shows exactly the new credentials; each agent's sequence is `[machine_credential_refused, ok]` with one 401 and one `after_401` helper run between; the claims keep id, holder and run, are unrevoked, and their lease is not earlier                                                                                                                                                                                   |
| Revoke        | 200 `{revokedCredentials: 3, removedPersons: 0}`; after the sweep settles there are no claims, every unit is free, and the cap counts 0 claims; claim history has a `credential_revoked` release per agent under its run; each resource use is `cleanup_pending` (never released automatically, per `wbs-resource-release-tracking`); each agent sees `[machine_credential_refused, helper_failed:1]`; the latest key issues nothing; the listing shows `revokedAt` and no live credential; the revoked persons still count toward the cap |
| removePersons | 200 `{revokedCredentials: 1, removedPersons: 1}`; `agentPersons` drops by 1 and the claim goes with the person                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Audit         | `agent_pool_created` × 2, `agent_pool_rekeyed` × 1, `agent_pool_revoked` × 2; `machine_token_issued` names all six fleet credentials of both generations, with exactly one row per credential and run however many times the helper ran; no row carries a key                                                                                                                                                                                                                                                                              |

What the design says about re-keying, and what was observed: re-key revokes the old keys without
ending leases (`AgentPoolRepository.rekey` never calls `endLeasesOfUncredentialed`), so the claims
continue. An outstanding bearer of an old key is refused on its next call. be-01 rereads the
credential on every call, so that call is an in-band `machine_credential_refused`; it does not
live until its TTL. Its `jti` then enters mcp-01's refused set, so the next request is HTTP 401
and the helper re-runs. Revocation follows the same path, except the re-run cannot issue.

### Proofs (R5)

| Injected fault                                                                                                                                 | Observed                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--fault=skip-reimport`: re-key without importing the new document                                                                             | exit 1. Every agent got `[machine_credential_refused, helper_failed:1]`, the round-2 heartbeats and releases failed, and audit counted 4 of 6 credentials. The three round-2 claims were stranded until their lease runs out, which is what a fleet that misses the re-import would see |
| `--fault=skip-revoke`                                                                                                                          | exit 1 on the lease checks: claims left, RAM 24 / disk 30 held, the cap at 3, no `credential_revoked` history, uses `active`, the agents still `ok`                                                                                                                                     |
| production fault: `endLeasesOfUncredentialed` commented out of `AgentPoolRepository.revoke` (libs/wbs/adapters/store-sqlite/src/agent-pool.ts) | exit 1 on the same nine lease checks (the revoke answered 200, but nothing ended); reverted                                                                                                                                                                                             |

`Proof:` comments sit beside the two checks in `pool-swarm-rehearsal.ts`. The boot test runs
`--fault=skip-revoke` on every CI run, so the lease checks stay breakable.

### Commands and results, slice 13

All on 2026-10-28 with `env -u CLAUDECODE`:

| Command                                                                                                                                                                                                                                                        | Result                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| laptop: `bun apps/wbs/mcp-01/src/load/pool-swarm-rehearsal.ts` at 0b3d13127                                                                                                                                                                                    | exit 0, 136 of 136                                                                         |
| laptop: the same with `--fault=skip-reimport`, `--fault=skip-revoke`, and the production fault above                                                                                                                                                           | exit 1 each                                                                                |
| laptop: `bun test --timeout=10000` in `apps/wbs/mcp-01` (whole suite, the boot test included)                                                                                                                                                                  | 723 pass, 0 fail                                                                           |
| h2puni (`ubuntu-8gb-hel1-1`, bun 1.4.4), 0b3d13127 in a detached worktree of `~/puni-00-gate-tbf` (removed after), `bun install --frozen-lockfile`, under `bin/with-heavy-lock.sh` (waited 0 s): the rehearsal, then `--fault=skip-revoke`, then the boot test | exit 0, 136 of 136 (revoke at 10155 ms, sweep settled at 10173 ms); exit 1; 2 pass, 0 fail |
| `bunx tsc --build --force` for `apps/wbs/mcp-01` and `apps/wbs/be-01`                                                                                                                                                                                          | exit 0                                                                                     |
| `bunx eslint` on the four new files                                                                                                                                                                                                                            | no problems                                                                                |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                                                                                    | exit 0                                                                                     |
| `bunx openspec validate --all --json`                                                                                                                                                                                                                          | 301 items, 301 passed                                                                      |
| `bunx prettier --check` on every changed file                                                                                                                                                                                                                  | "All matched files use Prettier code style!"                                               |

Not run:

- the dev run itself (8.1), which waits on a pool in the dev web app;
- real Claude Code. The agent replays its `headersHelper` contract (run at connect and on HTTP 401)
  with the SDK, so Claude Code's actual retry timing is unobserved;
- lease expiry by time (15 minutes) and pool expiry (`expiresAt`); covered by existing tests, not
  by this run;
- several mcp-01 replicas. Each replica learns a revocation at its own first refused call (M3);
  one replica ran here;
- the h2puni gate (`bin/h2puni-gate.sh`); CI runs the full suites;
- the origin of the unrequested helper run after a failed helper, which was not traced.

## Slice 14 — prod runbook (task 8.2)

`docs/runbook-prod-deploy.md` gains "MCP agent surface": the three settings and where each
lives per target, how to generate them, the cutover order (bundle, be-01 before mcp-01,
activation, key rotation, the pool swap-window rule, task 3.8's timing), the audience
preflight, post-swap checks, rollback of the pool and machine-token migrations, capacity, and
what Kubernetes still lacks. `docs/runbook-organization-activation.md` step 2c now names the
real env root, `/home/puni1/wbs` (it said `/srv/wbs`, the stale copy).

Docs only; nothing was run on any host. Every name the section cites was read in code at
25b873b1d:

| Runbook claim                                                     | Code                                                                                                                                      |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Compose deploys be, gw, fe only                                   | `tools/tool-remote-scripts/src/lib/deploy-contract.ts:24` `TIERS`                                                                         |
| prod never routes `/mcp`                                          | `tools/tool-remote-scripts/src/swap.ts:151` `readMcpExposure`                                                                             |
| the secrets ride be's derived file; the server rides `be-01.env`  | `tools/tool-remote-scripts/src/lib/docker.ts:134–140` `SECRET_KEYS`, `:256` `APP_ENV_ALLOWED_KEYS`                                        |
| the swap checks only the 32-character floor                       | `docker.ts:458–460` `VALUE_RULES`; not in `APP_ENV_REQUIRED_KEYS` or `SECRET_REQUIRED_KEYS`                                               |
| boot refuses an activated store without them                      | `apps/wbs/be-01/src/boot.ts:519–522`; `config.ts:111–116` `missingMcpServiceSettings`                                                     |
| strength, distinctness, `_PREVIOUS` needs `_CURRENT`              | `apps/wbs/be-01/src/runtime/machine-grant.ts:15,22,67`; `config.ts:79–96`                                                                 |
| `kid` derived from the key                                        | `machine-grant.ts:28,47–49`                                                                                                               |
| the server's canonical form                                       | `libs/wbs/domain/contracts/src/mcp-authorization-server.ts:34–54`                                                                         |
| either secret on `/internal/mcp/*`, the dedicated one for grants  | `apps/wbs/be-01/src/http/identity.ts:97–111`                                                                                              |
| activation exit 8                                                 | `apps/wbs/be-01/src/organization-activation-cli.ts:95,102`                                                                                |
| keep `_PREVIOUS` 24 h 60 s                                        | `libs/wbs/application/core/src/service/machine-grant.ts:8` `MOST_MACHINE_GRANT_SECONDS`                                                   |
| `MCP_ACCESS_TOKEN_TTL` defaults to 3,600 s; 3.8's branch          | `apps/wbs/mcp-01/src/oauth.ts:98,627–631`                                                                                                 |
| preflight: read-only, exit 3, the message, the accepted-ids parse | `apps/wbs/be-01/src/trusted-issuer-audience-check-cli.ts:11–45`; `libs/wbs/adapters/store-sqlite/src/db.ts:348`                           |
| the schema Job runs capture, migrate, rollback only               | `tools/tool-deploy/src/k8s/execute.ts:777,812,813`                                                                                        |
| mcp-01 offers grants only standalone with the secret              | `apps/wbs/mcp-01/src/config.ts:83`; the probe's grant list, `bin/dev-mcp-probe.sh:76–97`                                                  |
| mcp-01 at epoch 1 without either secret refuses                   | `apps/wbs/mcp-01/src/oauth.ts:419`                                                                                                        |
| pool revoke with persons removed                                  | `libs/wbs/domain/contracts/src/http/agent-pool-shapes.ts:179`; `apps/wbs/fe-01/src/components/organization/agent-pools-panel.tsx:118–121` |
| the three guarded downs and the append-only audit                 | each `down.sql` CHECK name; `organization_audit_no_delete`, `20261028100100_…/migration.sql:93`                                           |
| `bootCommit` is null without a checkout                           | `apps/wbs/be-01/src/deployed-commit.ts:90–110`                                                                                            |
| prod overlay: `MCP_TRUSTED_PROXY_HOPS=1`, `MCP_PUBLIC_URL`        | `deploy/k8s/wbs/overlays/prod/kustomization.yaml:38,40`                                                                                   |
| capacity                                                          | slice 12 above (120.6 calls a second)                                                                                                     |

Gaps found, filed as task 8.3:

1. No deploy CLI runs the audience preflight or takes `--accept-breaking`. Neither the Compose
   swap nor the schema Job (`BACKEND_TASK_SCRIPT`) calls `trusted-issuer-audience-check-cli.ts`;
   the only reference to `--accept-breaking` is the CLI's own JSDoc. The runbook gives a
   manual `docker run` with the candidate image instead.
2. `deploy/k8s/wbs/base/mcp.yaml` gives mcp-01 neither `MCP_BE_INTERNAL_SECRET` nor
   `INTERNAL_AUTH_SECRET`, so a Kubernetes mcp-01 offers no machine grant and refuses to start
   at credential epoch 1. The prod and staging `wbs-backend-config` lack
   `WBS_MCP_AUTHORIZATION_SERVER` (only the local overlay sets it, inside a Secret).
3. The Compose swap preflight does not know whether the store is activated, so a missing grant
   setting surfaces as a be-01 boot refusal after migration. The runbook adds a `grep -c`
   check before every be swap of an activated store.
