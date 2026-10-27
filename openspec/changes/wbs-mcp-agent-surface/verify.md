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
