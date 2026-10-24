# Task 3.1 independent review — request changes

Reviewed frozen clean `/tmp/puni-cross-address`, branch `feat/cross-project-address-search`, HEAD `4677cd3c0cf7bc3331b7a51c639ba398c17b779d`, against base `c51ba1697`, the supplied review diff, `/tmp/puni-address-search-architecture.md`, and the integration tree's current task 3.1, proposal, design D8 and project-addresses delta. Scope is the three additive lookup operations and their composition/client contracts. No source, index, HEAD, OpenSpec or WBS edits were made.

## Actionable findings

### 1. P2 — A present JSON-null cursor silently restarts both discovery operations

Location: `libs/wbs/application/core/src/service/project-address-search.ts:52–55` (`addressPageQueryOf`), with downstream absence checks in `discoverProjects` and `discoverCandidates`.

`decodeCursor('bnVsbA')` returns JSON `null`. The query parser uses the same `null` value for an absent cursor and rejects only `undefined`, so both services bypass their exact cursor-shape checks. A supplied malformed continuation consequently becomes a successful first-page request. This contradicts the binding strict version/kind/shape contract and the requirement not to silently restart an invalid continuation.

Fresh mounted probes on the frozen tree, using `OrganizationHarness.open()`, registered user `ada`, and a created `ALPHA` project, observed:

- `GET /api/project-addresses/projects?q=a&cursor=bnVsbA` → **200**, returning ALPHA.
- `GET /api/projects/<selected-id>/address-candidates?cursor=bnVsbA` → **200**, returning its candidate observation.

Expected for both: **400 `{ error: 'invalid_query' }`**. These probes exercised the real mounted routes and temporary fixture databases; no source mutation was needed.

Bounded fix: distinguish absence from a present decoded-null value in the new query boundary, without changing the old list/local contracts. Add both mounted negatives (including the numeric/empty discovery gate if sharing the validation branch), observe failure on current code, then restore a passing implementation and record the new guard's actual proof.

### 2. P2 — Candidate cursor scope validation coerces malformed JSON values

Location: `libs/wbs/application/core/src/service/project-address-search.ts:230–240`, especially `String(cursor['scope'])` at line 232.

The exact cursor contract requires a string scope. Coercion admits the array `["node"]` through the shape/type check. With a stale revision, execution reaches the revision comparison before coordinate validation and returns stale instead of invalid query. This is a request-classification defect even though current authorization remains enforced.

A fresh mounted probe obtained a genuine candidate cursor, retained its binding, and encoded `{ ...cursor, scope: ['node'], stepId: 'anything', revision: 'old' }`. The route returned **409 `stale_address_revision`**, whereas malformed field types require **400 `invalid_query`**. The unchanged-revision case eventually refuses because coordinate equality fails, so testing only current revisions misses the defect.

Bounded fix: require `typeof scope === 'string'` and check the allowed literals without coercion. Add a malformed-type regression with both current and stale revisions; require 400 before the stale branch. Observe a guard-removal negative and update the adjacent proof accurately.

### 3. P2 — Placement-validation proof is a zero-test failure, and the claimed regression is absent

Location: `libs/wbs/adapters/store-sqlite/src/project-address-search.ts:161–170`; also the placement-validation claim in `/tmp/puni-address-search-report.md`.

The adjacent comment claims that removing placement validation made mounted `fails corrupt placement and step facts visibly rather than issuing an observation` return 200 instead of 500. That test does not exist in the frozen controller suite. Its cited artifact, `/tmp/address-proof-placement-validation.txt`, contains only:

```text
error: regex "fails corrupt placement" matched 0 tests. Searched 1 file (skipping 12 tests)
```

Thus this is **not** a watched production-path invariant failure. The restored 17-test run also contains no corrupt-placement case. The production validator is present, but its mandatory R5 proof and regression are missing; the comment/report currently assert evidence the artifact disproves.

Bounded fix: add the named corruption regression through real adapter capture and/or the mounted route. Inject a malformed frozen number or position, establish a passing refusal control with the guard, remove the actual placement guard, and require a selected test to fail because malformed facts escaped (not because zero tests ran or a downstream response validator happened to fail). Restore the guard, rerun the focused positive control, and replace the comment/report with the actual observed command/assertion. Do not count the current exit 1 as evidence.

## Spec and implementation assessment

Apart from the malformed-cursor findings and missing R5 evidence above, the implementation matches the lookup-only architecture on inspection:

- Production composition supplies a required search service backed by a dedicated read-only connection. Admission is reconstructed on that connection using current activation, organization binding/revocation, membership and credential policy. Scope predicates precede decoding foreign project metadata. Viewer lookup remains read access, including restricted projects; pre-activation legacy access remains deployment-wide and keeps duplicate abbreviations as separate stable choices.
- Selected-project capture and resolution use the path project ID throughout. No abbreviation lookup can rebind to another holder. Syntax is checked before revision comparison; revision comparison precedes current-prefix and endpoint resolution. Missing work items/codes map to generic 404, while ambiguity/parent/alias outcomes retain typed 422.
- `qar1` uses the injected digest and the exact approved tuple, with the complete derived address description including uncoded steps. Existing local `ar1` implementation and route behavior are unchanged. Names are excluded from address meaning.
- Project discovery uses scoped SQL keyset chunks and no work-item trees. The SQL non-ASCII branch is a safe metadata superset; JavaScript applies the existing exact name predicate. Literal punctuation is preserved. The loop continues across superset chunks until enough exact matches or exhaustion, and continuation identifies the last returned project.
- Candidate enumeration is lazy and flat, counting whole, node and descendant-step choices together. It captures all selected-project placements and steps before deriving numbers/revision. Parent and uncoded options preserve stable identity without inventing textual references.
- Cursor bindings hash normalized query/access namespace/project identity; endpoint cursors also carry revision and stable endpoint coordinates. Existing decoding bounds input to 512 base64url characters. Generated cursor payloads do not copy large queries or deep effective numbers. Current access is rechecked independently of cursor contents. Impossible coordinates refuse rather than restart, except the decoded-null bypass above.
- The transaction encloses admission and reads; success, modeled refusal and exceptions close the connection. Retained reader methods/access are guarded after closure. No writer, optimizer or scheduler capability is injected. The strengthened persisted-table comparison can observe writes on other connections.
- Shared HTTP shapes, mounting, operation inventories and shape-derived MCP generation are integrated. The separate typed frontend `ProjectAddressApi` preserves refusal/cancellation without forcing unrelated editor doubles to implement a new capability.

No picker UI, external authoring, scheduling, activation or history completion is implied or required for this slice.

## Evidence audit

Read the implementation report and the actual named output logs. The twenty claimed mutation artifacts break down as follows:

| Claimed fault         | Audit                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| organization-scope    | Actual selected mounted test fails on foreign project output.                                                                                  |
| placement-scope       | Actual selected mounted test fails on wrong selected-project candidates.                                                                       |
| step-scope            | Actual selected mounted test fails on foreign step IDs.                                                                                        |
| project-cap           | Actual selected mounted test fails on excess project entries.                                                                                  |
| candidate-cap         | Actual selected mounted test fails: expected 2, received 3.                                                                                    |
| alphabetic-gate       | Actual selected mounted test fails on numeric discovery output.                                                                                |
| grammar               | Actual selected mounted test fails: malformed-before-stale expected 422, received 409.                                                         |
| stale                 | Actual selected mounted test fails: expected 409, received 404 after rename.                                                                   |
| ambiguous             | Actual selected mounted test fails on duplicate-number resolution.                                                                             |
| project-binding       | Actual selected mounted test fails: expected invalid query, received 200.                                                                      |
| snapshot-transaction  | Actual selected adapter test fails on rival name/placement visibility.                                                                         |
| snapshot-close-guard  | Actual selected adapter test fails because retained access does not throw.                                                                     |
| metadata-anomaly      | Actual selected mounted test fails: expected 500, received 200.                                                                                |
| placement-validation  | **Invalid evidence: zero selected tests; see finding 3.**                                                                                      |
| step-validation       | Actual direct capture test fails with `capture admitted malformed step evidence`; it avoids the initially masked response-validation negative. |
| candidate-binding     | Actual selected mounted test fails: expected invalid query, received candidates with 200.                                                      |
| candidate-stale       | Actual selected mounted test fails: expected 409, received 200.                                                                                |
| impossible-coordinate | Actual selected mounted test fails: expected invalid query, received empty candidates with 200.                                                |
| current-prefix        | Actual selected mounted test fails on generic-not-found mismatch.                                                                              |
| unicode-superset      | Actual selected mounted test fails when CITY is omitted from the Unicode query.                                                                |

These support **19 actual selected-test negative failures, not 20**. Their surrounding source and assertions match the intended production boundaries. The initial missing-route RED is not used as proof for later guards. This audit does not claim a separate mutation for every disjunct in composite validators; the two fresh cursor probes demonstrate why that distinction matters.

Reviewed positive output:

- `/tmp/address-frozen-tests.txt`: 17 tests, 116 assertions, zero failures.
- `/tmp/address-final-tests.txt`: combined 40 tests, 241 assertions, zero failures.
- `/tmp/address-local-regression.txt`: 3 mounted old-local tests, 20 assertions, zero failures.
- `/tmp/address-routes-green.txt`: 4 shape/policy/reachability tests, 1186 assertions, zero failures.
- `/tmp/puni-address-search-socket-root.log`: root rerun passes 1 test, 5 assertions; earlier worker EPERM is accurately superseded for this check.
- `/tmp/puni-address-search-frontend-root-correct-tier.log`: existing full Vitest configuration filtered to `wbs-api.test.ts` passes 67 tests in one file. The earlier wrong-tier no-files run is not treated as a pass.
- Backend/frontend composite typechecks are reported exit 0, with the named diagnostic logs empty. Empty files alone do not independently prove exit status; this review accepts the recorded command results and did not rerun the composites. Format output reports success; named ESLint diagnostics are empty.

Evidence limits: the mounted rename case does not actually install a second holder of the old abbreviation; that no-rebinding property is supported here by source tracing rather than a full reuse fixture. The snapshot rival-write test changes labels/placements, not membership; coherent admission is supported by the shared-connection transaction wiring. The Unicode fixture covers matching correctness, but not a multi-chunk run of false positives. The existing local pure revision suite covers uncoded-step ordering; the new mounted revision test changes code and position together. These are limits of the submitted evidence, not newly observed implementation failures.

## Verdict and skipped checks

**Request changes for this slice.** The architecture is substantially compliant, but strict malformed-cursor behavior is not fully implemented and one required safety proof is absent and inaccurately recorded. Fix the three bounded findings, attach actual focused RED/restored-GREEN evidence, and obtain follow-up review before marking task 3.1 verified.

No broad suites, mutations, full gate, CI, migration/secrets gate, browser suite, build or deployment were run by this reviewer. Only the two targeted mounted cursor probes were executed, using temporary fixture databases. No release or full-feature completion claim is made. The frozen worktree remained clean after the probes.

## Scoped re-review — approved at `1b89328d5`

Reviewed the four-file follow-up `4677cd3c0..1b89328d5`, its supplied diff package, final source, appended implementation report, mutation script, structured evidence and named output logs. Confirmed clean HEAD `1b89328d5f74d68eefaa76c1855a42799c5a4360`. This verdict supersedes the earlier request-changes verdict for the three findings above.

All three findings are resolved:

1. `addressPageQueryOf` now rejects a present decoded-null cursor while preserving the absent-cursor sentinel. Four mounted regressions cover alphabetic, numeric and empty project discovery plus selected-project candidates. The guard sits before either discovery operation, so the numeric/empty shortcut cannot bypass it.
2. Candidate cursor scope now requires a string and an allowed literal without coercion, before revision comparison. Mounted regressions cover both current and stale revisions. The current-revision case remains a useful passing control during the mutation; the stale case detects the original incorrect 409.
3. Actual malformed-placement regressions now exist at the mounted route and direct adapter-capture boundary. The source Proof comment names the observed tests and failure. The implementation report explicitly supersedes its inaccurate earlier claim and retains the original zero-test log as invalid historical evidence.

Audited replacement fault evidence:

| Fault                | Before control | Injected fault | Restored control | Intended observed failure                                                                                                               |
| -------------------- | -------------- | -------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| null-cursor          | 4 pass, 0 fail | 0 pass, 4 fail | 4 pass, 0 fail   | All four mounted requests return 200 instead of 400.                                                                                    |
| scope-type           | 2 pass, 0 fail | 1 pass, 1 fail | 2 pass, 0 fail   | Array scope plus stale revision returns 409 instead of 400; current revision control passes.                                            |
| placement-validation | 2 pass, 0 fail | 0 pass, 2 fail | 2 pass, 0 fail   | Mounted response is 200 with `number: "bad"` instead of 500; direct capture fails with `capture admitted malformed placement evidence`. |

The evidence JSON records the commands, exit statuses and selected counts. The script restores each production file in `finally`, verifies exact selected/pass/fail counts, and requires the intended assertion/error marker. The logs independently show these selected tests and actual failure outputs. The placement negative is not masked by response validation. The accurate cumulative account is **19 prior valid fault runs plus 3 new valid fault runs**; the original zero-test run remains excluded. These are fault-run counts, not a claim of independent mutations for every validator disjunct.

The initial six-case cursor RED log shows 1 pass and 5 failures, matching the two original cursor defects. Final affected-suite output `/tmp/address-round1-final-tests.txt` shows **25 passing tests, 133 assertions, zero failures**. Named format output passes; backend composite typecheck and named ESLint are reported exit 0 with empty diagnostic logs. I also ran `git diff --check 4677cd3c0..1b89328d5` successfully and verified the tree remains clean. I did not rerun the already-proved suites or mutations.

**Scoped verdict: approve task 3.1's reviewed lookup implementation and these fixes. No remaining actionable findings from this review.** Earlier evidence limits remain as stated, but do not establish further implementation failures. This approval covers the lookup slice only; it is not full-feature verification, host-gate/CI approval, or deployment approval. No source/index/HEAD changes, broad checks, frontend/socket reruns, builds, full gates or deployment were performed during this re-review.
