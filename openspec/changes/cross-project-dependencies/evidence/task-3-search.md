# Task 3.1 implementation report

Frozen worktree: `/tmp/puni-cross-address`, branch `feat/cross-project-address-search`, base `c51ba1697`. No commit created; root owns integration/commit/OpenSpec/WBS. No OpenSpec or documentation in the repository changed.

## Implemented contract

Three additive shared GET shapes/routes: project discovery, selected-project address candidates, exact observed-project reference resolution. `qar1` hashes the exact approved project/abbreviation/address descriptor using the injected Digest. Existing local step-reference service, `ar1`, routes and wire declarations are untouched. A selected project supplies a complete minimal placement/step capture; lazy whole/node/descendant-step options share the page cap. Uncoded steps retain stable options. Qualified resolution binds the selected stable identity, rejects malformed syntax before stale revisions, and maps missing endpoints/current-prefix mismatch to generic404.

The dedicated read-only SQLite transaction resolves organization admission and required metadata on its connection. Scope predicates precede joined abbreviation decoding. Search uses bounded SQL keyset chunks, a safe Unicode metadata superset plus exact `nameMatches`, literal substring/prefix matching, and no work-item query. Required abbreviation anomalies are checked before filtering. Reader methods/access fail after closure; connections close after success, modeled refusal and throw. No scheduler/optimizer/admitted writer is injected.

Cursor payloads use exact v1 kinds and SHA256 bindings of normalized query/server access namespace/selected project; candidate continuation additionally binds qualified revision and stable endpoint coordinates. Numeric/empty project discovery validates queries/cursors and admission then returns an empty page.

Production boot and both OrganizationHarness modes receive the required capability. Existing unrelated buildApp fixtures explicitly receive a modeled refusal fixture; no silent optional production fallback was introduced. Shared shape registration exposes the normal generated OpenAPI/MCP path. `wbs-api.ts` exports `ProjectAddressApi` / `httpProjectAddressApi` separately from the established editor ProjectApi, returning shape-derived ClientReply values and accepting AbortSignal. This preserves typed refusal/cancellation and avoids forcing the new capability into existing editor doubles; root was informed of this integration choice.

## RED and GREEN

Initial mounted RED was observed before implementation: first2 tests0pass2fail6assertions, expected200/received404 for authorized alphabetic discovery and numeric/empty discovery. After adding selected-project/resolution/refusal contracts, RED0pass5fail13assertions, all at the intended missing routes (404 or NOT_FOUND body). These initial RED outputs are in the worker tool transcript. First GREEN5pass0fail35assertions. Later cases were added as contract regressions against the implemented paths, then production guard mutation negatives were watched individually; do not interpret them as preimplementation RED for every function.

Final new suites, after fault restoration and final state-comparison improvement:
`bun test apps/wbs/be-01/src/controller/project-address-search.controller.db.test.ts libs/wbs/adapters/store-sqlite/src/project-address-search.db.test.ts`
17pass0fail116assertions,4.43s. `/tmp/address-frozen-tests.txt`.

New suites plus shared MCP generation, existing pure local address tests and qualified parser tests:
`bun test apps/wbs/be-01/src/controller/project-address-search.controller.db.test.ts libs/wbs/adapters/store-sqlite/src/project-address-search.db.test.ts apps/wbs/mcp-01/src/generated-document.test.ts libs/wbs/application/core/src/module/work-item/step-addresses.test.ts libs/wbs/domain/domain/src/project-address.test.ts`
40pass0fail241assertions,8.28s. `/tmp/address-final-tests.txt`. Final subsequent production changes were Proof comments only; the mounted refusal side-effect assertion was strengthened from connection-local total_changes to whole persisted table snapshots, then the new suites reran GREEN above.

Existing mounted local regressions:
`bun test apps/wbs/be-01/src/controller/work-item.controller.test.ts -t 'resolves canonical|refuses an old revision|reads leaf step nodes'`
3pass0fail20assertions,103filtered,2.67s. `/tmp/address-local-regression.txt`.

Production shape/policy/reachability:
`bun test apps/wbs/be-01/src/app.routes.test.ts -t 'reach|binds|pinned'`
4pass0fail1186assertions,2filtered,2.77s. `/tmp/address-routes-green.txt`. MCP generation separately9pass0fail24assertions (`/tmp/address-mcp.txt`). No committed generated document is maintained: CLI and MCP derive directly from shared shapes.

Backend typecheck:
`bunx tsc --build --force apps/wbs/be-01/tsconfig.json`
exit0, empty diagnostic log `/tmp/address-final-be-typecheck2.txt`. Earlier final attempt caught an optional stepId test assertion, corrected by explicit test narrowing before this successful run.
Frontend typecheck:
`bunx tsc --build --force apps/wbs/fe-01/tsconfig.json`
exit0, empty diagnostic log `/tmp/address-fe-typecheck.txt`.

Format over every named changed/new TS file passed (`/tmp/address-frozen-format.txt`); `git diff --check` passed. Full named-file ESLint initially reported4errors confined to the2new test files (imports, unnecessary String conversion, optional-chain expression, unknown rejection callback). Those were corrected; the2files then passed `--fix` and the final file-scoped ESLint log is `/tmp/address-frozen-eslint.txt`. Other named files had no errors in the full named-file run (`/tmp/address-final-eslint.txt`).

## Watched R5 mutations

Every row below is an independent production-path fault, test exit1, restored before the next fault. Adjacent Proof comments name the observed injected fault/test. Initial snapshot removal also removed transaction cleanup so the observed assertion was changed snapshot facts, not a secondary rollback error. The first step-validation attempt only checked mounted500 and survived because response validation also rejected malformed position; this revealed a weak negative. Added direct production adapter capture assertion, reran removal and observed `capture admitted malformed step evidence`; restored GREEN. Exact logs are preserved.

- `organization-scope`: `alphabetic prefix`; exit1; `/tmp/address-proof-organization-scope.txt`.
- `placement-scope`: `selected project scopes`; exit1; `/tmp/address-proof-placement-scope.txt`.
- `step-scope`: `viewer can discover`; exit1; `/tmp/address-proof-step-scope.txt`.
- `project-cap`: `alphabetic prefix`; exit1; `/tmp/address-proof-project-cap.txt`.
- `candidate-cap`: `selected project scopes`; exit1; `/tmp/address-proof-candidate-cap.txt`.
- `alphabetic-gate`: `numeric input`; exit1; `/tmp/address-proof-alphabetic-gate.txt`.
- `grammar`: `manual punctuation`; exit1; `/tmp/address-proof-grammar.txt`.
- `stale`: `manual punctuation`; exit1; `/tmp/address-proof-stale.txt`.
- `ambiguous`: `duplicate numbers`; exit1; `/tmp/address-proof-ambiguous.txt`.
- `project-binding`: `cursor reuse`; exit1; `/tmp/address-proof-project-binding.txt`.
- `snapshot-transaction`: `holds authorization`; exit1; `/tmp/address-proof-snapshot-transaction.txt`.
- `snapshot-close-guard`: `closes success`; exit1; `/tmp/address-proof-snapshot-close-guard.txt`.
- `metadata-anomaly`: `fails missing abbreviation`; exit1; `/tmp/address-proof-metadata-anomaly.txt`.
- `placement-validation`: `fails corrupt placement`; exit1; `/tmp/address-proof-placement-validation.txt`.
- `step-validation`: `rejects malformed trusted step`; exit1; `/tmp/address-proof-step-validation.txt`.
- `candidate-binding`: `cursor reuse`; exit1; `/tmp/address-proof-candidate-binding.txt`.
- `candidate-stale`: `changes revision`; exit1; `/tmp/address-proof-candidate-stale.txt`.
- `impossible-coordinate`: `impossible and malformed`; exit1; `/tmp/address-proof-impossible-coordinate.txt`.
- `current-prefix`: `duplicate numbers`; exit1; `/tmp/address-proof-current-prefix.txt`.
- `unicode-superset`: `exact Unicode`; exit1; `/tmp/address-proof-unicode-superset.txt`.

The tested refusal side-effect comparison reads every persisted non-SQLite-internal table and compares ordered serialized rows, so writes on a different connection are observable. Read-only SQLite connection enforcement is inherited from the already-proven database boundary.

## Actual cost observations

The SQLite test's bounded project search on a fixture with4authorized-legacy a-projects and1b-project returned2metadata rows. It observed exactly2 `FROM project` statements (one bounded anomaly query and one bounded superset selection), and zero `work_item` statements. Selected capture observed exactly1project-scoped placement query. This is not a constant-query claim for a whole HTTP discovery request: Unicode false-positive chunks can require additional bounded scans/anomaly checks. No benchmark/performance budget was supplied or claimed.

## Unavailable / skipped checks

- Full h2puni/h4claw gate, full Nx test/lint/build, CI secrets/migration lint and deployment not run; slice-only local verification. No feature-wide completion claim.
- `bun test apps/wbs/be-01/src/app.routes.test.ts` includes a real socket test; `refuses framed GET and HEAD bodies on the production health route` failed `EPERM: operation not permitted, listen` at Bun.serve. Root rerun command: `bun test apps/wbs/be-01/src/app.routes.test.ts -t 'refuses framed GET and HEAD bodies'`. `/tmp/address-generated.txt` contains this unavailable check alongside the earlier integration failures, which were subsequently fixed by modeled fixture admission and route probe parameters.
- Frontend runtime tests remain unverified. Initial `bun nx run wbs-fe-01:test:unit --testFile=src/lib/wbs-api.test.ts` reported Nx daemon/plugin socket EPERM; with sockets disabled the flag proved invalid Vitest `Unknown option --testFile`. Correct root rerun: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun nx run wbs-fe-01:test:unit --args=src/lib/wbs-api.test.ts`. In this sandbox its Vitest child exited1 immediately with no diagnostics. Root subsequently diagnosed the concrete cause outside sandbox: the existing `vitest.node.config.ts` NODE_SUITES excludes wbs-api.test.ts, so test:unit was the wrong tier and correctly selected no files. Root is rerunning through the existing full Vitest configuration with a single-file filter; no suite inventory was changed. Logs `/tmp/address-fe-test.txt`, `/tmp/address-fe-test2.txt`, `/tmp/address-fe-test3.txt`. Root explicitly owns rerunning outside sandbox; no claim these new frontend tests pass.
- No separate core/store Nx typecheck was run; backend composite tsc covered their referenced sources. No new UI, external writer, scheduling semantics or activation capability is implemented in this slice.

## Self-review and remaining review scope

The implementation preserves the approved live/history separation and old local resolver. All shape descriptors are mounted, fixtures/inventories are exhaustive and MCP names are pinned. The lookup uses no existing full project-list path, no scheduler and no write capability. Stable project selection prevents abbreviation reuse from redirecting resolution. The selected full placement capture remains necessarily proportional to that single project's size. Name-only edits retain revision; leafhood/uncoded-step position changes invalidate it. Legacy duplicate abbreviations remain separate choices.

The type-level empty-page assertion was removed; production has no new unchecked cast/any/non-null assertion. Trusted placement and step checks throw; existing domain/abbreviation checks retain their prior proofs. New application checks were fault-tested as listed, but no claim is made that each individual disjunct of every composite cursor/metadata validator has its own independent mutation; independent Astra review should assess the requested R5 scope. Independent review has not been run by this worker (no subagents authorized); root will request it after freeze.

## Explicit integration manifest

All paths below are worker changes and safe to stage/copy as named paths; no unrelated working changes were present at start. Includes every buildApp refusal-fixture addition, production composition, shared exports/registry, route inventories, frontend and generated-MCP test integration.

```text
apps/wbs/be-01/src/app.routes.test.ts
apps/wbs/be-01/src/app.test.ts
apps/wbs/be-01/src/app.ts
apps/wbs/be-01/src/boot.db.test.ts
apps/wbs/be-01/src/boot.ts
apps/wbs/be-01/src/controller/auth.integration.test.ts
apps/wbs/be-01/src/controller/calendar-marker-identity.db.test.ts
apps/wbs/be-01/src/controller/calendar-marker.controller.db.test.ts
apps/wbs/be-01/src/controller/capacity-body.db.test.ts
apps/wbs/be-01/src/controller/directory.controller.db.test.ts
apps/wbs/be-01/src/controller/history.controller.test.ts
apps/wbs/be-01/src/controller/internal.integration.test.ts
apps/wbs/be-01/src/controller/oidc-identity.controller.db.test.ts
apps/wbs/be-01/src/controller/oidc.integration.test.ts
apps/wbs/be-01/src/controller/priority-ladder-body.db.test.ts
apps/wbs/be-01/src/controller/project-address-search.controller.db.test.ts
apps/wbs/be-01/src/controller/project.controller.test.ts
apps/wbs/be-01/src/controller/saved-plan.controller.db.test.ts
apps/wbs/be-01/src/controller/step.controller.db.test.ts
apps/wbs/be-01/src/controller/typed-dependency-commands.controller.db.test.ts
apps/wbs/be-01/src/controller/typed-dependency-copy.controller.db.test.ts
apps/wbs/be-01/src/controller/typed-dependency-graph.controller.db.test.ts
apps/wbs/be-01/src/controller/typed-dependency-lifecycle.controller.db.test.ts
apps/wbs/be-01/src/controller/undo.controller.db.test.ts
apps/wbs/be-01/src/controller/work-item.controller.test.ts
apps/wbs/be-01/src/health.db.test.ts
apps/wbs/be-01/src/migrate.test.ts
apps/wbs/be-01/src/testing/app-fixture.ts
apps/wbs/be-01/src/testing/browser-lifecycle-mounted.worker.ts
apps/wbs/be-01/src/testing/organization-harness.ts
apps/wbs/be-01/src/testing/organization-route-inventory.ts
apps/wbs/be-01/src/testing/project-address-search-fixture.ts
apps/wbs/be-01/src/testing/route-requests.ts
apps/wbs/fe-01/src/lib/wbs-api.test.ts
apps/wbs/fe-01/src/lib/wbs-api.ts
apps/wbs/mcp-01/src/generated-document.test.ts
libs/wbs/adapters/store-sqlite/src/db.ts
libs/wbs/adapters/store-sqlite/src/index.ts
libs/wbs/adapters/store-sqlite/src/project-address-search.db.test.ts
libs/wbs/adapters/store-sqlite/src/project-address-search.ts
libs/wbs/application/core/src/http/project-address.routes.ts
libs/wbs/application/core/src/index.ts
libs/wbs/application/core/src/ports/project-address-search.ts
libs/wbs/application/core/src/service/project-address-revision.ts
libs/wbs/application/core/src/service/project-address-search.ts
libs/wbs/domain/contracts/src/http/project-address-shapes.ts
libs/wbs/domain/contracts/src/http/shapes.ts
libs/wbs/domain/contracts/src/index.ts
```

Root follow-up: outside-sandbox socket check passed1test5assertions (`/tmp/puni-address-search-socket-root.log`). Worker sandbox EPERM remains accurately recorded above as the earlier limitation.

Root follow-up final: existing full frontend Vitest configuration, filtered to src/lib/wbs-api.test.ts, passed67tests (1file) outside sandbox. Exact command from apps/wbs/fe-01: `TZ=UTC bunx vitest run src/lib/wbs-api.test.ts --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000`; exit0, log /tmp/puni-address-search-frontend-root-correct-tier.log. Earlier wrong-tier/no-files failure is not a code failure and remains recorded; no suite inventory/config changed. Only this file was tested, not full frontend/browser.

# Review fix round 1 of 5 — findings 1–3

Reviewed `/tmp/puni-address-search-review.md` in full against frozen base `4677cd3c0cf7bc3331b7a51c639ba398c17b779d`. No Git metadata, WBS, OpenSpec, frontend or broader feature edits were made. Only the four paths in `/tmp/puni-address-search-round1-paths.txt` changed.

## Evidence correction (supersedes earlier placement-proof/count claims)

The independent audit established **19 valid prior selected-test mutation failures, not20**. `/tmp/address-proof-placement-validation.txt` is retained unchanged as an invalid, superseded artifact: its regex selected zero tests. The named corrupt-placement controller test was absent in the frozen source. The earlier report's placement mutation claim and source Proof comment were inaccurate; this section replaces that claim, and the source comment now names the actual new capture-boundary proof. A nonzero exit code without selected intended failures is not accepted as proof.

The other19 earlier negative artifacts remain as audited; no historical artifacts were overwritten. The3new independent fault proofs below bring the independently selected failures to22distinct fault runs (19previous+3new), with counts/positive controls stated individually rather than treating zero-test output as a failure.

## Bounded fixes and fresh RED

- The new page-query boundary distinguishes absent cursor from a present cursor decoded as JSONnull. `bnVsbA` now returns strict400 invalid_query on alphabetic, numeric, empty discovery and selected-project paging. Existing list/local cursor contracts are untouched.
- Candidate cursor scope requires a string and an allowed literal, without String coercion. Array scopes refuse400 before revision comparison, for both current and stale observations.
- Added a real mounted malformed frozen-number test and an adapter capture test. A stored `frozen_number='bad'` must throw `malformed project address placement` at capture; the direct test fails explicitly if malformed detached facts escape. The mounted test independently requires500 and, with the guard removed, actually receives200 rather than a downstream masked500.

Before the cursor fixes:
`bun test apps/wbs/be-01/src/controller/project-address-search.controller.db.test.ts -t 'rejects present JSON null|rejects array cursor'`
**1pass5fail14assertions**,6selected tests,14filtered,2.70s. `/tmp/address-round1-cursor-red.txt`. Four JSON-null cases returned200 instead of400. The array/current control already returned400; array/stale returned409 instead of400.

Before removing placement validation, both real new placement cases passed:
`bun test apps/wbs/be-01/src/controller/project-address-search.controller.db.test.ts libs/wbs/adapters/store-sqlite/src/project-address-search.db.test.ts -t 'malformed.*placement evidence'`
**2pass0fail3assertions**,19filtered. `/tmp/address-round1-placement-control.txt`.

## Exact mutation proofs and restored controls

`python3 /tmp/address-round1-mutations.py` owns every fault/restoration sequentially. It requires the expected total selected test count, exact failed count, exit status, a named `(fail)` record and the intended assertion/error marker. It runs a positive control before each fault and again after restoring the original file in finally. Missing/no-match summaries throw and are not recorded as proof. Structured evidence: `/tmp/address-round1-proof-evidence.json`.

### null-cursor

- control: exit0, 4pass/0fail; `/tmp/address-round1-null-cursor-control.txt`.
- fault: exit1, 0pass/4fail; `/tmp/address-round1-null-cursor-fault.txt`.
- restored: exit0, 4pass/0fail; `/tmp/address-round1-null-cursor-restored.txt`.

### scope-type

- control: exit0, 2pass/0fail; `/tmp/address-round1-scope-type-control.txt`.
- fault: exit1, 1pass/1fail; `/tmp/address-round1-scope-type-fault.txt`.
- restored: exit0, 2pass/0fail; `/tmp/address-round1-scope-type-restored.txt`.

### placement-validation

- control: exit0, 2pass/0fail; `/tmp/address-round1-placement-validation-control.txt`.
- fault: exit1, 0pass/2fail; `/tmp/address-round1-placement-validation-fault.txt`.
- restored: exit0, 2pass/0fail; `/tmp/address-round1-placement-validation-restored.txt`.

The null guard removal selected all4JSON-null tests, and all4failed on200 instead of400 (including numeric and empty input). Scope string/literal validation removal selected2tests: the current observation stayed400 and passed, while the stale observation failed409 instead of400. Placement guard removal selected2tests and both failed: mounted expected500/received200, and direct capture threw `capture admitted malformed placement evidence`. These selected failures demonstrate the intended production boundaries. Each restored control passed before subsequent work.

## Final affected verification

`bun test apps/wbs/be-01/src/controller/project-address-search.controller.db.test.ts libs/wbs/adapters/store-sqlite/src/project-address-search.db.test.ts`
**25pass0fail133assertions**,10.00s, exit0. `/tmp/address-round1-final-tests.txt`.

`bunx tsc --build --force apps/wbs/be-01/tsconfig.json`
exit0, empty diagnostics `/tmp/address-round1-typecheck.txt`; composite covers the affected core/SQLite/backend types.

`bunx prettier --check` over the4manifest paths: exit0, all matched files conform; `/tmp/address-round1-format.txt`. `git diff --check` passes. Named-file ESLint result is recorded in the final freeze update below.

No frontend tests, socket checks, full suites/gates, builds, deployment, WBS or OpenSpec work was repeated. Root's original frontend full-config run passed67tests and its socket run passed1test5assertions; those unchanged contracts did not require repeating for this fix. The prior wrong-tier frontend command is superseded by that root evidence.

## Exact round1 manifest

```text
apps/wbs/be-01/src/controller/project-address-search.controller.db.test.ts
libs/wbs/adapters/store-sqlite/src/project-address-search.db.test.ts
libs/wbs/adapters/store-sqlite/src/project-address-search.ts
libs/wbs/application/core/src/service/project-address-search.ts
```

Final round1 freeze: named-file `bunx eslint` on all4manifest files exited0 with no diagnostics (`/tmp/address-round1-lint.txt`). Source is frozen after successful tests/types/lint/format/diff checks; root owns commit and scoped Astra re-review.
