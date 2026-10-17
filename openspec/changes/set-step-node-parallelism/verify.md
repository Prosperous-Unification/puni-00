## Scope and candidate

Foundation only, based exactly on `e7b49e09dec24eb5d50b11ffe6bb137391a3043d`, isolated clone
`/tmp/puni-step-parallel-foundation-sol-20261015`. This packet does not complete WBS 010.4.13.3.
No public writer, importer, lifecycle transfer, scheduling behavior, Stage 7a resolver change,
StepBlockage activation, deployment or host gate is part of this candidate. Parity here covers
internal store reads/set/remove and terminal unit-of-work semantics; lifecycle parity remains
in the unchecked slices. SQLite's work-item cascade does not establish safe public lifecycle
semantics for authored overrides. Do not enable a writer from this foundation alone.

## TDD

`evidence/tdd-red.txt`: eight real memory/SQLite source cases failed because
`source.stores.stepParallels` did not exist. An initial test import-path typo was corrected
before this RED was captured. `evidence/tdd-order-red.txt`: a later mixed-case owner-order
case failed on memory's locale comparator; the corrected comparator passed on both sources.
The original committed shared case replaced explicit 1 with 3 before reading it; it did not
prove preservation across a row-default edit. The dedicated review correction below supplies
that missing evidence.

## Final checks

- `bun test libs/wbs/adapters/store-memory/src/step-parallel-conformance.test.ts libs/wbs/adapters/store-memory/src/step-parallel-fixture.test.ts libs/wbs/adapters/store-sqlite/src/step-parallel-conformance.db.test.ts libs/wbs/adapters/store-sqlite/src/step-parallel.db.test.ts libs/wbs/application/conformance/src/case-manifest.test.ts libs/wbs/domain/domain/src/node-resources.test.ts apps/wbs/be-01/src/controller/step-node-resources.controller.db.test.ts --timeout=30000`: **53 passed, 0 failed, 209 assertions**. Includes unchanged Stage 7a domain and mounted reads. Transcript: `evidence/focused-final.txt`.
- `bun test libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts --test-name-pattern 'certifies the sparse step parallelism source inventory' --timeout=30000`: **2 passed, 148 filtered, 0 failed, 32 assertions**. Both source declarations explicitly offer the new family. Transcript: `evidence/source-inventory-final.txt`.
- `bunx tsc --build --force libs/wbs/adapters/store-memory/tsconfig.json libs/wbs/adapters/store-sqlite/tsconfig.json`: **exit 0**, including referenced domain/core/conformance builds and test typings. Early test generic-row typings were corrected before this final build.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:build:portable --skip-nx-cache`: **passed**, 571 modules bundled. The adapters have TypeScript build/typecheck targets rather than a separate runtime build. Transcript: `evidence/portable-build-final.txt`.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts apps/wbs/be-01/drizzle/20261015110000_add_step_node_parallelism/migration.sql apps/wbs/be-01/drizzle/20261015110000_add_step_node_parallelism/down.sql`: **exit 0**. Focused SQL tests exercise real empty rollback/forward and retained-fact rollback refusal with table and applied ledger preservation.
- Installed pinned OpenSpec CLI: `bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js --version`: **1.12.0**. `validate set-step-node-parallelism --strict --json`: **1 valid, zero issues**; `validate --all --json`: **212 passed, 0 failed (194 changes, 18 specs)**. JSON transcripts are under `evidence/`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint -p wbs-domain,wbs-core,wbs-conformance,wbs-store-memory,wbs-store-sqlite --skip-nx-cache --parallel=2`: **all 5 passed**, cache skipped. Transcript: `evidence/scoped-lint-final.txt`.
- Changed-file Prettier check passed before the initial commit. The original unstaged `git diff --check` exited 0 but omitted new evidence files and did not prove the committed range was clean. Astra review ran `git diff --check e7b49e09dec24eb5d50b11ffe6bb137391a3043d 72a44ceff2ed1b6dc8acc6a26cb8cfcbbde89b8a` and observed exit 2: CRLF/trailing spaces in `evidence/portable-build-final.txt` and `evidence/source-inventory.txt`. The earlier whitespace verification claim was therefore too broad; the corrected full-range check is recorded below. Normal lefthook hooks are installed; no hook bypass is used.

## Safety mutations

`evidence/receipts.json` records **30 independent restored-source mutations**, all with a
nonzero Bun test exit and the named negative failing. The final rerun used the settled-operation
assertion helper so every later state read follows the actual operation's completion.

- Integer/lower/upper range predicates independently; memory write validation and SQLite
  write/read validation calls.
- Memory owner read/write, step, project, leaf and retained duplicate guards.
- SQLite owner, missing step, cross-project step and parent-owner defensive read checks.
- SQL integer/range CHECK, composite uniqueness and owner/step foreign keys.
- INSERT and UPDATE project/leaf trigger clauses independently.
- Down retained-count check: replacing it with zero would discard the fact and ledger.
- Memory commit-copy ownership, refused-batch memory rollback and SQLite rollback.
- Exact source-family inventory membership.

Adjacent production `Proof:` comments name the observed failure; raw transcripts accompany
each receipt. The one initially unobserved memory write-owner mutation prompted a dedicated
trusted-reference write assertion; its final rerun failed as intended. Early lint rejected
unsorted imports and awaited Bun assertions typed as void; imports were sorted and the helper
now awaits the actual production promise before asserting its rejection.

## Deferred and unavailable checks

No host gate, full unfiltered source suites, full repository tests/CI, browser interaction,
backend/image build, public transport, lifecycle, transfer, scheduler integration or release
checks were run. Those slices remain unchecked and the parent owns review/integration.
Dependencies are shared through a symlink to the exact-base clone's existing `node_modules`;
a fresh frozen install was not performed and is not claimed. Plain `openspec` is absent from
PATH; the available installed pinned CLI above performed validation. No push or deployment.

## Exact-review corrections (2026-10-15)

Astra blocked `72a44ceff2ed1b6dc8acc6a26cb8cfcbbde89b8a` on the missing equal-default
preservation proof and committed evidence whitespace. The shared source conformance now
contains `retains an explicit equal-default value across row-default edits while its sibling
stays absent`: assert the row default is 1; store Dev=1; read explicit Dev=1 with no QA fact;
change the actual row default to 4; read explicit Dev=1 again; explicitly assert QA remains
absent. Row-default inheritance inputs are proved without activating Stage 7a override resolution.

Four additional watched production-path faults each failed that case: independently drop
explicit 1 in the memory and SQLite setters, and independently substitute the row default
in the memory and SQLite readers. Both read faults pass the first read at default 1 and fail
after the default changes to 4. All production files were restored; this correction changes
coverage and evidence only. See `evidence/equal-default-receipts.json` and its four transcripts.
Adjacent `Proof:` comments identify the failed assertions.

The two flagged evidence files now use LF and contain no trailing whitespace. Their observed
command output is preserved; only output-transport whitespace was normalized. Review evidence
transcripts are likewise normalized before being added to Git.

Revalidation after the corrections:

- The same seven-file focused command above: **55 passed, 0 failed, 219 assertions**;
  `evidence/review-focused.txt` includes the two new source cases.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-conformance:lint --skip-nx-cache`:
  **passed**, cache skipped (`evidence/review-lint.txt`). Other production projects were
  unchanged by these corrections; their earlier scoped lint evidence remains recorded above.
- `bunx tsc --build --force libs/wbs/adapters/store-memory/tsconfig.json libs/wbs/adapters/store-sqlite/tsconfig.json`:
  **exit 0**, including the changed shared kit and its two adapter test consumers.
- Pinned OpenSpec 1.12.0 `validate --all --json`: **212 passed, 0 failed**;
  summary extracted from that run in `evidence/review-openspec-summary.json`.
- Changed-file Prettier check and the full staged-range whitespace check
  `git diff --cached --check e7b49e09dec24eb5d50b11ffe6bb137391a3043d` are run before the
  correction commit: **both passed, exit 0**. The post-commit base-to-HEAD check is reported
  with the exact new candidate SHA. Unlike the original unstaged check, this range includes every
  previously committed and newly staged evidence file.

No production behavior changed, so the portable build and migration lint were not repeated;
the migration rollback cases remain included in the fresh focused run. No push, host gate,
merge or deployment was performed. External Tool Wiki activation remains inactive and is
not a claimed certification.

## Pure resolver prerequisite — 2026-10-17

Scope is task 4.0 only, based on exact recoverable foundation
`fea8863394fc08a64920d170e3fd1622e6881de4`, isolated at
`/tmp/puni-step-parallel-resolver-20261017`. No live consumer, scheduler, schema,
writer, transport or stepless behavior changed. The unavailable later transport
head `1b4b9e3` was not reconstructed. Tasks 4.1–4.4 remain unchecked.

All commands below ran serially through `python3 evidence/.../rss-guard.py`
(from the repository root with the full change evidence path), with a 768 MiB
process-tree RSS ceiling sampled every 20 ms. The wrapper and rerunnable mutations
are retained in `evidence/resolver-2026-10-17/`; each transcript ends with exit and
sampled peak. Sampling is observed process-tree RSS, not a kernel memory limit.
Existing root `node_modules` was linked; no frozen dependency install is claimed.

- TDD: missing-export RED retained in `tdd-red.txt`; a typed throwing stub then
  produced five behavior failures (`tdd-behavior-red.txt`) before implementation.
- `bun test libs/wbs/domain/domain/src/step-parallel.test.ts libs/wbs/domain/domain/src/node-resources.test.ts`:
  **32 passed, 0 failed**, including provenance, sibling isolation, explicit
  equality/default change, independent pair guards, invalid values on each route,
  inclusive limits, resource composition and mutable-fact isolation.
- `python3 .../mutations.py`: **seven independent faults each exited 1** with the
  intended behavior test failing: ignoring overrides, equality collapse, each pair
  guard omitted, each value-validation call omitted, and a returned getter retaining
  the mutable fact. See `mutation-receipts.json` and corresponding transcripts.
- `bunx tsc --build --force libs/wbs/domain/domain/tsconfig.json`: **exit 0**,
  sampled peak 311619584 bytes.
- Initial scoped ESLint found three numeric test-name template errors, corrected
  using `String`. Its module-boundary rule skipped without the project graph.
  `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/step-parallel-resolver-graph.json`
  then exited 0, peak 276324352 bytes. Final scoped ESLint over the two TypeScript
  files **exited 0 without warnings**, peak 684322816 bytes (`lint-final.txt`).
- Pinned OpenSpec 1.12.0 via its existing cached CLI:
  `validate set-step-node-parallelism --strict --json`: **1 passed, 0 failed**,
  no issues (`openspec.txt`).

Full repository tests, builds, all-change OpenSpec validation and the exact-SHA
h2puni host gate are not run by this local prerequisite slice. No integration,
release, push, merge or deployment claim is made.

Normal `git commit` hooks passed, including scoped ESLint, formatting, plaintext
secrets and private nesting; commit-message hooks also passed. The initial commit
receipt is retained in `evidence/resolver-2026-10-17/commit-hooks.txt` (peak
718348288 bytes, below 768 MiB). The repository's migration and doc-cap hooks
skipped because this slice stages no matching files. Tool Wiki returned visible
`inactive`, `certified:false` because its external activation root is not provisioned;
this is not a Tool Wiki certification claim. Adding this receipt uses the same
normal hooks on amend.

## Accessor review correction — 2026-10-17

Astra's review of `b36b49123f7cec5037ec59df8540ab44146922c9` identified a
second read of `override.maxParallel` after validation. A legitimate getter could
return 2 for validation and 1001 for the returned maximum. The new regression
reproduced that failure: **25 passed, 1 failed**, expected 2 and received 1001
(`evidence/resolver-accessor-2026-10-17/tdd-red.txt`).

The resolver now captures the maximum once and validates and returns the same
number. The regression asserts both the returned value and exactly one getter
read. Replacing the returned snapshot with a fresh property read independently
failed that regression; the rerunnable injection and transcript are
`resolver-accessor-2026-10-17/{mutation.py,reread.txt}`. The original mutation
runner's source anchors were updated for the captured numeric local; its prior
receipts remain historical evidence from the prerequisite commit.

Serial checks through the existing 768 MiB RSS guard:

- Focused resolver and node-resource tests: **33 passed, 0 failed**, 49 assertions
  (`focused-green.txt`).
- Scoped ESLint over the two changed TypeScript files: **exit 0**, no warnings,
  peak 685768704 bytes (`lint.txt`).
- Domain forced TypeScript build: **exit 0**, peak 327557120 bytes (`typecheck.txt`).
- Pinned OpenSpec 1.12.0 strict validation for this change: **1 passed, 0 failed**,
  no issues (`openspec.txt`).
- Prettier write completed successfully (`format.txt`); normal pre-commit checks
  also check staged formatting. Final commit-hook transcript is retained outside
  the commit at `/tmp/step-parallel-accessor-commit.txt` to avoid a self-referential
  receipt amendment.

This is a successor commit to the reviewed prerequisite, with no amended reviewed
commit. Existing unrun full-gate/build/all-OpenSpec limitations and the inactive
Tool Wiki boundary remain as recorded above. No live consumers or writers changed.

## Saved-plan preservation prerequisite — 2026-10-17

Unpublished working candidate based exactly on reviewed
`1872c02f2e5621865011db16d73c50682e8c0366`, isolated in
`/tmp/puni-step-parallel-saved-plan-20261017`. Scope is saved-plan input schema 8,
source capture, authored fold and pair-keyed capacity comparisons only. Document v10,
public writes, live resource resolution, scheduling, lifecycle, deployment and WBS
status changes are outside this candidate. The missing `1b4b9e3` integration was
not recovered. Existing `node_modules` is linked from the reviewed clone; no fresh
frozen install is claimed. External Tool Wiki activation is inactive and is not
claimed as certification.

Evidence is under `evidence/saved-plan-2026-10-17/`. Every test/static command uses
its retained `rss-guard.py`; it samples process-tree RSS every 20 ms and kills the
process group above its configured ceiling. It is a sampled watchdog, not a kernel
memory limit. Initial commands use 768 MiB. The coordinator explicitly authorized
one final native typecheck and per-file lint at the global 900 MiB ceiling after
bounded failures; those transcripts state the changed ceiling.

TDD `tdd-red.txt` records 36 real missing-behavior failures before production edits;
`first-green.txt` records 36 passing tests/56 assertions. `regression-first.txt`
exposed the missing schema8 reader admission, a stale current-version assertion and
the inherited memory store-inventory omission. The inventory now includes the real
sparse store and tests its detached values. `regression-green.txt` records 230 tests,
885 assertions and zero failures before the tuple review correction.

Independent review found a P2: the existing generic colon-joined row key could merge
`('a', 'b:c')` with `('a:b', 'c')` and hide an override difference. `tuple-red.txt`
records that real capture-to-diff failure, and `tuple-green.txt` its corrected run.
Only the new sparse family escapes percent and colon characters; ordinary ID paths
remain readable. The regression also covers a literal `%3A` identifier.

Native typecheck is **unavailable within the authorized memory ceiling**, not passing:
`bunx tsc --build --force libs/wbs/adapters/store-memory/tsconfig.json
libs/wbs/adapters/store-sqlite/tsconfig.json` was watchdog-killed before diagnostics.
`typecheck-first.txt` sampled 810352640 B; `typecheck-bounded.txt` with V8 heap384
sampled 820764672 B. Inspection then identified `tsc` as `@typescript/native`, so V8
settings do not constrain its Go child. The authorized native-GC retry with
`GOMEMLIMIT=512MiB GOGC=20` sampled 814514176 B and was killed. The final authorized
`RUNTIME_CLOSURE_RSS_MIB=900 GOMEMLIMIT=640MiB GOGC=20` attempt sampled 945491968 B
and was killed (`typecheck-900.txt`). No further typecheck attempts were made.

The initial all-files lint exceeded the 768 MiB ceiling and lacked an Nx graph
(`lint-first.txt`); it is not accepted as verification. A fresh
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx show projects --json` generated
the graph successfully at 275693568 B (`nx-graph.txt`). Subsequent graph-backed
changed-file lint is split by project/file. Domain and conformance pass at 768 MiB;
core's heap384 and heap416 attempts exhausted V8 heap and are retained as failed
experiments. Per-file core checks at heap512 and 900 MiB passed, with maximum
sampled RSS 776278016 B. Final adapter/static receipts and restored regression
checks are recorded below.

No full repository gate, host gate, browser test, full source suite, hosted CI,
publication, merge, deployment or live acceptance was run. Normal hooks were installed successfully (`hooks-install.txt`). A local ignored
`lefthook-local.yml` makes pre-commit sequential and invokes the same ESLint rules
once per staged TypeScript file; no required command is removed. The first manual
normal pre-commit at heap576 failed on required lint's V8 heap exhaustion, peak
935485440 B under its 900 MiB watchdog (`pre-commit-first.txt`). Format, plaintext
secrets, private nesting and the Tool Wiki check passed; migration/doc-cap checks
correctly had no applicable changed files. Tool Wiki explicitly reported inactive
and uncertified. The coordinator authorized one final heap640 attempt through the
normal git commit hook with the same 900 MiB watchdog; its outcome is recorded
below. No commit success is inferred.

Final restored evidence:

- `regression-final.txt`: the 14-file saved-plan/domain/core/memory/SQLite suite
  passed **231 tests, 888 assertions**, zero failures; sampled peak 589398016 B.
  Command: `bun test libs/wbs/domain/domain/src/saved-plan
libs/wbs/adapters/store-memory/src/memory-source.test.ts
libs/wbs/adapters/store-sqlite/src/saved-plan-capture.db.test.ts
libs/wbs/application/core/src/service/saved-plan-input.test.ts
libs/wbs/application/core/src/module/saved-plans/module.test.ts
libs/wbs/application/core/src/module/saved-plans/saved-plan-integrity.test.ts
libs/wbs/application/core/src/service/shared-people.test.ts
libs/wbs/application/core/src/ports/store-boundaries.test.ts --timeout=30000`.
- `source-capture-final-corrected.txt`: both source conformance files with
  `--test-name-pattern 'Task 6.3|Task 6.4' --timeout=30000` passed **18 tests,
  2310 assertions**, 132 filtered, zero failures; peak 575705088 B. An earlier
  `savedPlanCapture` filter matched zero tests and exited 1; its failed transcript
  is retained in `source-capture-final.txt` and is not counted as verification.
- `mutate.py` reran **20 independent restored production faults** against the final
  expanded three-pair collision regression. Every trial exited 1 with its named
  negative failing; `receipts.json` and matching transcripts record each. This
  includes separate old-colon-key and missing-percent-escape faults, capture/read
  validation, collection/reference/fact shape, owner/leaf/step/pair/range checks,
  historical empty upgrade, both source snapshot reads, authored fold and scalar
  accessor reread. `tuple-red.txt` and `tuple-green.txt` retain the earlier one-
  assertion review regression; final tuple fault transcripts and restored suite
  use the expanded three-assertion regression. All edited production files were
  restored in `finally` before the final passing suite.
- Graph-backed changed-file lint passed for the domain (`lint-domain.txt` plus
  final tuple source/test check `lint-domain-final.txt`), conformance
  (`lint-conformance.txt`), all five core files (`lint-core-file-0.txt` through
  `lint-core-file-4.txt`), and all three memory files
  (`lint-adapter-file-0.txt` through `lint-adapter-file-2.txt`). The SQLite capture
  test passed with heap576 and a 900 MiB watchdog, peak 856260608 B
  (`lint-sqlite-file-0.txt`); production capture passed after import ordering was
  fixed, peak 768864256 B (`lint-sqlite-source-final.txt`). These final lint runs
  used the generated Nx graph and emitted no skipped-boundary-rule warning.
- **SQLite source-conformance fixture lint remains unverified**: its independent
  heap576 run exhausted V8 heap before diagnostics, peak 861331456 B
  (`lint-sqlite-conformance-final.txt`). Only its required empty capture field
  changed; no lint success is inferred from that small diff or from tests.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run
wbs-core:build:portable --skip-nx-cache` passed, **571 modules**, cache skipped;
  peak 272502784 B (`portable-build.txt`).
- Pinned OpenSpec 1.12.0 `validate set-step-node-parallelism --strict --json`
  passed **1/1**, zero failures; peak 71749632 B (`openspec-strict.txt`).

Tasks 3.3.1 and 3.3.2 describe only this saved-plan prerequisite and are checked.
The broader lifecycle/transport tasks remain unchecked. Typecheck and the one
SQLite fixture lint are unresolved resource limits, and the host gate/release
checks remain outstanding. Changed-file Prettier formatting passed (`format-final.txt`), and the staged
base-to-candidate `git diff --cached --check 1872c02f2e5621865011db16d73c50682e8c0366`
passed before the final normal commit attempt. Documentation formatting and the
staged whitespace check are repeated after this verification appendix is updated. Evidence
transcripts are normalized to LF with trailing output whitespace removed before
staging; command output and failures are otherwise preserved.

## Normal commit blocked by the RAM ceiling

The final normal `git commit -m "feat(wbs): preserve sparse parallelism in saved
plans"` attempt ran with `NODE_OPTIONS=--max-old-space-size=640`,
`RUNTIME_CLOSURE_RSS_MIB=900` and the installed native `LEFTHOOK_BIN`. The local
ignored serial configuration retained every required check and each ESLint rule.
The watchdog stopped the process group with exit **137**, sampled peak
**945192960 B**, above its **943718400 B** ceiling (`commit-blocked.txt`). Format
passed before required lint exhausted the remaining process budget. No hook was
bypassed, and no further heavy check or heap increase was attempted.

HEAD remains exactly `1872c02f2e5621865011db16d73c50682e8c0366`; no commit was
created and no Git index lock remains. The final attempted staged tree was
`d1444b14a8a73357d2fc9012882d1305b4f04786`. After adding this failure receipt, the
final staged tree and a complete mode0600 staged patch are reported to the
coordinator outside the tree to avoid a self-referential tree hash. The final
status appendix was followed only by lightweight staged whitespace/status checks;
formatting, lint and typecheck were not rerun after the required stop. WBS remains
in progress and no push, publication, merge or deployment occurred.

The coordinator subsequently confirmed that 900 MiB was a conservative worker
budget rather than a user hard limit, observed 20.4 GiB available host memory,
and explicitly authorized exactly one normal commit retry at 1100 MiB after the
other worker stopped. This retry retains heap640, the same installed native
lefthook and every required serial check. Its receipt and resulting commit, if
any, are reported separately; the prior blocked state is preserved in the
mode0600 staged patch reported to the coordinator. No typecheck retry is included.

## Authoritative step-removal prerequisite (2026-10-17)

Bounded tasks 3.1.1 and 3.2.1 build on reviewed saved-plan commit
`50db6da82c2a93a804226763d1f46dbd8a3aef24`. Work lives in isolated clone
`/tmp/step-removal-20261017`; its untracked dependency symlink reuses the existing
workspace installation. No fresh frozen-install claim is made.

Every test command below ran serially through the existing resolver
`rss-guard.py` with `RUNTIME_CLOSURE_RSS_MIB=900` (943718400 B). Transcripts live
in `evidence/removal-2026-10-17/`.

- TDD RED: memory removal **2 failed** by deleting the referenced step
  (`memory-red.txt`, peak 508522496 B); SQLite direct removal **2 failed** on the
  restrictive FK (`sqlite-red.txt`, peak 541171712 B); mounted HTTP **2 failed**
  with expected 409 / received 500 (`http-red.txt`, peak 638873600 B). The HTTP
  fixture's initial undefined connection variable was corrected before recording
  the final behavior RED.
- Restored `bun test libs/wbs/adapters/store-memory/src/step-parallel-fixture.test.ts`:
  **18 passed**, peak 499257344 B (`memory-restored.txt`). Covers both cascade
  flags, explicit equality, clearing the final target fact, retained foreign
  facts, detached sorted colon-containing references and all memory corruption guards.
- Restored `bun test libs/wbs/adapters/store-memory/src/memory-source.test.ts`:
  **19 passed**, peak 495022080 B (`source-restored.txt`). Both public and staged
  bindings refuse references; mixed rollback restores step name, presence and policy.
- Restored `bun test libs/wbs/adapters/store-sqlite/src/step-parallel.db.test.ts`:
  **28 passed**, peak 589434880 B (`sql-corruption-restored.txt`). Includes missing/
  foreign/parent owner and invalid maximum, exact full-state refusal, retained
  foreign facts, and mixed rollback across project, work-item, step, sparse facts,
  journal and event tables.
- Restored `bun test apps/wbs/be-01/src/service/step.service.db.test.ts`:
  **30 passed**, peak 605990912 B (`service-restored.txt`). Direct and service
  outcomes match, references name only the target step, sibling facts survive,
  missing/foreign target stays not-found, late insertion is refused, authorization
  precedes authoritative lookup, and refusal publishes no event.
- Restored `bun test apps/wbs/be-01/src/controller/step.controller.db.test.ts`:
  **54 passed**, peak 640167936 B (`http-restored.txt`). Includes mounted 409 with
  both cascade flags and outsider/wrong-project responses without references.
- Restored `bun test apps/wbs/be-01/src/controller/step-marker-organization.controller.db.test.ts`:
  **19 passed**, peak 642277376 B (`organization-restored.txt`). Includes viewer403,
  foreign-organization404 and authorized409 over the same retained fact, both flags.

The six complete restored files total **168 passing tests**. Every watched fault
in `mutations.py` was restored byte-for-byte in `finally`; **31 injected faults**
caused real focused test failures, with no false green and no watchdog kill.
Machine receipts are the six `mutation-receipts-*.json` files. Individual fault
transcripts name SQLite refusal/cascade/target scoping/left join/owner/project/leaf/
range/order/copy, memory refusal/cascade/target/owner/project/leaf/range/duplicate/
order/copy, both factory bindings, late insertion, authorization, service mapping,
route payload and shared response shape. Maximum observed fault RSS was
641257472 B. Adjacent `Proof:` comments name observed production-path failures.

The early review found a stale memory array index across the new owner awaits.
Deterministic delayed owner-read concurrency RED failed both different-step and
same-step cases (`concurrency-red.txt`, peak 490463232 B). Re-finding the exact
project/step immediately before splice fixes both; restoring the old index failed
both tests, and omitting the new not-found guard failed the same-step loser test.
The final complete memory file includes both controls.

The cascade-preservation test seeds real estimate, assignment, actual and progress
rows alongside the sparse fact. All ten retained tables remain byte-value equal
on direct cascade refusal. Moving only the refusal block after `DELETE estimate`
still returned the typed refusal but committed a missing estimate, failing the
exact preservation assertion (`sqlite-mutation-order.txt`, peak 543002624 B).
The repaired/restored full SQL file includes this ordering control.

Pinned OpenSpec 1.12.0 status and apply instructions report schema `spec-driven`,
13/28 complete and 15 remaining tasks; strict validation passed 1/1 with zero
failures (`openspec-strict.txt`, peak 116334592 B).

Nx graph generation passed (`nx-graph.txt`, peak 277684224 B). The smallest
step-module typecheck initially failed TS2345 at `removeStep` because this slice
omitted its error from the closed `RefusalDetail` registry
(`step-module-typecheck.txt`, peak 926937088 B). The identical command in a clean
exact-50db6da clone passed (`step-module-typecheck-base.txt`, peak 914436096 B),
confirming a real candidate defect. Adding the precise registry entry repaired it:
`NODE_OPTIONS=--max-old-space-size=576 bunx --no-install tsc --noEmit -p
libs/wbs/application/core/src/module/step/tsconfig.json` passed under the same
900 MiB watchdog (`step-module-typecheck-fixed.txt`, peak 933294080 B).

The organization controller test's first per-file ESLint exhausted heap576
(`lint-00.txt`, peak 853504000 B). One authorized heap640 attempt reached concrete
boolean-template diagnostics (`lint-00-heap640.txt`, peak 906489856 B). Explicit
`String` conversions repaired those diagnostics, and that file then passed
(`lint-00-fixed.txt`, peak 894709760 B), with the generated graph and no skipped
boundary warning. All thirteen subsequent independent changed TypeScript files
passed graph-backed per-file ESLint (`lint-02.txt` through `lint-14.txt`), giving
14/15 changed TypeScript files verified; maximum passing lint RSS was 915333120 B.
The sole scoped lint gap is `step.controller.db.test.ts`: heap640 exhausted V8
before diagnostics, exit 1, peak 914812928 B (`lint-01.txt`). That file was not
retried during scoped checks and no lint success is inferred. Core, memory,
SQLite production/test, closed refusal registry and shared step shapes all passed.

Normal lefthook installation passed (`hooks-install.txt`, peak 81244160 B).
The ignored local configuration serializes inherited required checks and runs each
staged TypeScript file through the same ESLint rules individually; no required
hook is disabled. Normal commit hooks remain pending review and the coordinator's
heavy-lane authorization. Final changed-file Prettier and staged whitespace checks
are recorded beside this appendix. Transcripts are normalized to LF and stripped
of trailing output whitespace; their command results and failures are preserved.

Broad native adapter typecheck is intentionally unrun because
the reviewed baseline already exhausted its memory budget; no typecheck success
is inferred from runtime tests. Full host gate, feature completion, rollout,
public sparse writer, push and deploy remain unrun and outside this bounded slice.

## Version 9 export preservation fence (2026-10-17)

This bounded slice refuses JSON export while valid authored sparse parallelism exists. It keeps
writer version 9, import/classifier behavior, scheduling and public sparse writing unchanged.
`PlanDocumentReads` now requires a sparse collection; the shared SQLite export captures it on the
same read connection and transaction as project/tree/catalog/marker evidence. Isolated export
requires the real `listByProject` capability through service, DI module, routes and AppOptions.
Both serializer entry points validate trusted evidence and return the bare modeled refusal;
the shared response 409 union and closed refusal registry retain that shape.

Evidence is in `evidence/export-fence-2026-10-17/`. Bun, Nx and static commands ran serially under the existing Python watchdog, except for
separately named authorized ceilings, with `RUNTIME_CLOSURE_RSS_MIB=900` (943718400 B).
This is scoped evidence; the complete host gate, publication, rollout and feature closure remain
unrun in this worker.

- `service-red.txt`: 19 new service negatives failed against the original writer, peak 508964864 B.
- `core-green.txt`: 83 tests passed across service/module/direct-route/shared-shape files,
  peak 554586112 B.
- `mounted-green.txt`: 8 focused tests passed across actual composed isolated/shared JSON routes,
  authorization/unreadable state, shared concurrent clear/insert, detached rows and owned connection
  closure; peak 586412032 B. Expected 500 cases emit the production failure report.
- `mutation-receipts.json` plus 22 named transcripts: every independent injection failed a selected
  assertion (max 642756608 B), then the original production file was restored in `finally`.
  Omitting the refusal, actual isolated read, correct isolated project, shared capture, capture
  field, row copying, or same-snapshot authority each failed production-path tests. Collection,
  row/ID/maximum, owner/step existence/project, leaf and structured-pair guards were independently
  removed. Both route mappings, shared response schema and closed registry were also independently
  broken. The registry omission produced TS2345 at the new bare refusal case.
- `uncoded-shared.txt`: valid nonempty shared evidence plus an uncoded step retains 409
  `uncoded_steps`; unreadable trusted shared evidence plus that uncoded step yields 500 under R5.
  The direct service still short-circuits uncoded steps before reading its isolated sparse store.
  The modeled precedence guarantee concerns valid sparse evidence; it does not hide failed reads.
- `plan-module-typecheck.txt`: focused Plan document module tsc passed at heap576,
  peak 939634688 B; `nx-graph.txt` passed, peak 280334336 B.

The fixed-clock zero-fact oracle was obtained from the reviewed local parent
`bcfebf26e48ddfd77cd54cc55db45d6f6db3e93c`, with the pre-existing `PROJECT`, `TREE`, directory,
markers and clock fixture. `zero-fact-baseline.txt` records the original discovery run.
`zero-fact-parent-green.txt` then records both `git rev-parse <parent>:<resource>` and
`git hash-object <executed-resource>` as identical blob
`7c6df4c1856903a452d9e7a70a8e28b6612a91c6`, before running the fixed golden test successfully.
The command temporarily installed `git show <parent>:libs/wbs/application/core/src/module/plan-document/plan-document.resource.ts`
and restored the candidate afterward. Both original and candidate writer produced SHA256
`61243efaf10088375accb4ab8c3e449255c2fd3483558282dfc6f8e0e793f6a2` for
`JSON.stringify(await exportDocument())`. No expected bytes were generated by the candidate.

The first combined 5-file ESLint attempt at heap576 exhausted V8 (`lint-production.txt`,
peak 864755712 B). A one-file heap640 run then reached the required-reader diagnostic
(`lint-resource.txt`, peak 905474048 B): checking a required TypeScript property directly was
reported as an unnecessary condition. The constructor now reads that untyped composition
boundary through `unknown`; the required capability remains mandatory and has no empty fallback.

Final focused runtime checks passed 85/85 across five core files (`core-final.txt`,
peak 551989248 B) and 9/9 selected mounted/snapshot cases (`mounted-final.txt`,
peak 642658304 B; 131 cases intentionally filtered). The final constructor implementation was
independently re-faulted after its lint fix (`mutation-required-reader-final.txt`) and restored.
The corresponding service-test lint passed (`lint-05-final.txt`, peak 774909952 B). Earlier test
lint diagnostics about unused async and Bun's void-returning rejection matcher were repaired by
awaiting the exported Promise and asserting the captured failure directly.

Graph-backed per-file ESLint passed the production service/routes/snapshot/shared shapes/closed
registry and snapshot test, shared schedule test, boot and organization harness (`lint-00.txt`
through `lint-11.txt`). AppOptions composition (`lint-09.txt`) and the mounted import/export
organization file (`lint-07.txt`) exhausted heap640 (peaks 889110528 B and 901799936 B); these
checks remain unverified at this stage. Other changed fixture wiring has only formatting evidence
pending normal commit hooks. The lightweight import-sort pass had no type services; its first
attempt reported missing rules for existing inline comments (`import-format.txt`). The successful
replacement explicitly treated all inputs as formatting and did not evaluate those inline rule
comments (`import-format-final.txt`). This is no substitute for graph-backed repository lint.

The final focused module tsc rerun hit the hard watchdog at 944611328 B
(`plan-module-typecheck-final.txt`, exit 137), after the earlier passing run at 939634688 B.
The coordinator then authorized exactly one larger process-tree ceiling after checking host
memory. With heap576 unchanged and `RUNTIME_CLOSURE_RSS_MIB=1300`, the final focused module
typecheck passed at 981934080 B (`plan-module-typecheck-authorized.txt`, exit 0). Both earlier
attempts remain recorded; no broad adapter/backend typecheck was run. Strict OpenSpec 1.12.0 validation passed 1/1 (`openspec-final.txt`, peak 116441088 B).
Pinned status/apply instructions were also obtained (`openspec-status.txt`, `openspec-apply.txt`)
and identify the intended local change, schema and four context artifacts. Normal hooks,
commit/review and full host gate remain pending.

The original 22-fault runner is retained verbatim as `mutation-runner-original.py` (historical
absolute workspace and pre-comment constructor anchor). `mutation-runner.py` resolves the repo
from its checked-in location, updates the final constructor anchor and writes replay transcripts
under `replayed/` without overwriting historical receipts. `FAULTS=refusal,registry` can select
independent faults. Its target uniqueness is checked before each mutation and every mutation
restores its file in `finally`. The original ledger has 22 runs plus one separately watched final
constructor run. Shape/ID/reference-existence removals prove the named diagnostic boundary:
some missing checks still lead to another guard or a native TypeError. Those receipts do not
claim malformed evidence was accepted. Refusal, nonempty capture, range, project/leaf, duplicate,
alias, snapshot authority, route/schema and registry faults prove their respective observable
contract violations.

The coordinator authorized one original normal-hook commit attempt with
`RUNTIME_CLOSURE_RSS_MIB=1300 NODE_OPTIONS=--max-old-space-size=896` after fresh host memory
showed about 19.8 GiB available. `bun run tools/tool-git-hooks/src/install.ts` installed the
repository wrappers successfully (`hooks-install.txt`, peak 80924672 B); final changed-file
Prettier passed (`final-format.txt`, peak 491896832 B). The original unmodified hook commands
then passed tool-wiki, private-nesting, plaintext-secrets and format, but the combined 46-file
ESLint process exhausted V8 heap 896. No commit was created. Guard peak 1182654464 B stayed below
the authorized ceiling (`hooks-first-attempt.txt`, exit 1). No hook was skipped or substituted;
normal lint and commit remain pending. No retry was launched without renewed authorization.

A separately authorized second original-hook attempt used V8 heap 1536 with a hard 2200 MiB
process-tree ceiling after the coordinator reviewed the first failure and fresh host memory.
The same combined 46-file ESLint command exhausted V8 again; peak 1913868288 B stayed below the
hard ceiling (`hooks-second-attempt.txt`, exit 1). No commit was created. Other hooks passed
again; tool-wiki explicitly reported inactive/certified:false because external activation is
not provisioned, and migration hooks skipped because this slice stages no SQL. No additional
retry or hook reconfiguration was attempted without coordinator authorization.

After both combined-lint failures, the coordinator requested a reviewed serial execution shape
before any new commit authorization. The ignored root `lefthook-local.yml` changes only
`pre-commit.commands.lint.run` from `bunx eslint {staged_files}` to a shell loop over those same
arguments, calling `bunx eslint "$path"` once per path with `set -eu`. The inherited glob, rules,
repository config and every other hook are unchanged. The original and merged CLI dumps
(`hook-original-config.txt`, `hook-serial-config.txt`) differ only in that run string.
The reviewed config and exact wrapper are retained as evidence (`lefthook-local.yml`,
`lint-staged.sh`); no hook has been bypassed.

`serial-hook-expected.json`, `serial-hook-coverage-argv.json` and
`serial-hook-proof-receipts.json` retain actual Lefthook argument expansion: 46 expected paths,
46 observed and 46 unique. Child-process protocol tests replace only `bunx` with a recording
process shim, without claiming real lint success. First/middle/last nonzero child exits stop
the hook after 1/24/46 calls with nonzero exit. Removing `set -e` causes the first injected child
failure to produce a false-green hook and 46 calls, proving the propagation assertion can fail.
The corrected helper flushes receipts before checking later assertions (`serial-hook-proof.py`).

A real staged unused binding then fails the real graph-backed repository ESLint through the
serial Lefthook lint job (`serial-hook-real-lint-fault.txt`, exit 1, peak 800477184 B). The source
and index are restored in `finally`. Earlier injections were unstaged in an already staged
file, and Lefthook hid them while linting; their successful exits are explicitly nonproof
(`serial-hook-unstaged-debugger-hidden.txt`, `serial-hook-unstaged-fault-hidden.txt`). No
conclusion about those unstaged faults reaching ESLint is drawn. The initial unsupported CLI
flag attempt is retained as `serial-hook-cli-usage.txt`. Real lint across all 46 staged files
and the final normal-hook commit remain pending coordinator/Astra review and authorization.

After the coordinator and Astra approved equivalence, one authorized serial normal-hook attempt
used heap 896 per child and a hard 1800 MiB tree ceiling. It stopped on the first file,
`apps/wbs/be-01/src/app.routes.test.ts`, which exhausted V8 heap 896; tree peak 1184722944 B
(`hooks-serial-first-attempt.txt`, exit 1). The exact one-path attempted trace is retained as
`hooks-serial-first-paths.txt`. All other hooks passed; no commit was created and no later TS
file was linted. Serialization prevented accumulation but did not reduce this individual
backend program's minimum heap requirement.

The coordinator then authorized diagnostic preflight only: three fresh `bunx eslint <file>`
processes, heap 1536 and hard 2200 MiB tree ceiling, run serially. All passed with the original
repository config: app.routes.test.ts 1373261824 B, app.ts 1354125312 B, and the import/export
organization DB test 1020968960 B (`heavy-lint-preflight-0.txt` through `-2.txt`). These are
per-file lint results, not successful hooks or a commit. A new normal commit remains pending
authorization from this measured evidence.

The next measured serial-hook run reached 15 passing real TS files and stopped at the 16th,
`project.controller.test.ts:118`, on unsafe assignment from `plan.stores.stepParallels`
(`hooks-serial-diagnostic.txt`, peak 1415385088 B; exact paths in the adjacent trace). No commit
was created. The legacy harness return type does not expose that sparse member. Both this
fixture and work-item.controller.test.ts now supply explicit `testStepParallels()` stores,
matching the other empty test compositions. Focused tsc over those two files passed at 1437396992 B
(`fixture-typecheck.txt`, exact temporary config retained as `fixture-tsconfig.json`);
separate original ESLint commands passed at 1029943296 B and 1067814912 B
(`fixture-lint-project.txt`, `fixture-lint-work-item.txt`). These checks used the authorized
heap1536/tree2200 budget; no full backend typecheck is inferred.

Their complete existing runtime suites were also compared against the clean exact reviewed
parent `bcfebf26e48ddfd77cd54cc55db45d6f6db3e93c` (tree
`03e20792edb64bc98c0fec784b3f6d5fb7facf48`) with identical Bun test arguments and dependency
resolution, under the 900 MiB guard. The command is retained in
`fixture-runtime-parent-context.json`: `bun test apps/wbs/be-01/src/controller/project.controller.test.ts apps/wbs/be-01/src/controller/work-item.controller.test.ts`.
Candidate and parent each reported 60 pass/102 fail (peaks 666476544 B/674197504 B).
`fixture-runtime-comparison.json` preserves the complete equal failure-name multisets and
first-stack error counters, with no candidate-only or parent-only failure. Both log 103
counting-unit-of-work failures because unchanged `createWorkingPlan` eagerly reads the dormant
sparse catalog port. Those preexisting runtime failures remain unresolved in this bounded slice;
no passing suite result is claimed from the comparison. Export-fence-specific focused service,
mounted/snapshot and byte-oracle checks remain the passing scoped acceptance evidence.

## First-child create preservation prerequisite — 2026-10-17

Scope: `3.1.2` / `3.2.2` only. Required `listByWorkItems` evidence comes from the
current admitted command scope after project/admission/parent validation and before
stamp, ID allocation or writes. Retained equal-default facts refuse with detached
structured nodes. No public sparse writer, hand-down/remap, schema/version, scheduler
or UI change is admitted. The atomicity claim is the existing command UoW's terminal
rollback; standalone cross-call isolation is not claimed. Public HTTP coverage is
single-command and multi-command `POST /api/projects/:id/commands`; no separate HTTP
create alias exists in this source contract. Direct `installWorkItem(...).create`
is covered independently.

Evidence directory: `evidence/first-child-2026-10-17/`.

- RED: `bun test libs/wbs/application/core/src/module/work-item/first-child-step-parallel.test.ts`
  observed one/two equal-default policies accepting create and the authorized poisoned
  reader being skipped: 1 pass / 3 fail, peak 502,980,608 bytes (`tdd-red.txt`).
- Focused controls: the same service file plus
  `apps/wbs/be-01/src/controller/first-child-step-parallel.controller.db.test.ts` and
  `libs/wbs/domain/contracts/src/http/refusal.test.ts`; final counts are recorded below
  after scoped checks. Fixtures cover no-write snapshots, statement/estimate/blockage
  preservation, one/two node details, missing/foreign parents, authorization before a
  poisoned reader, missing/read-failing sparse capability, real invalid maxima/missing
  steps/cross-project/parent/duplicate facts, empty selected policies, clearing the last
  fact, and first-child undo/redo. The admitted memory UoW inserts a fact while the
  outside source remains empty and rolls back a preceding patch/journal/events.
- Prototype RED: real `StepParallelRepository` borrowed through `createWorkingPlan`
  failed with `sparse.listByProject is not a function` (0 pass / 2 fail,
  `prototype-red.txt`). Full explicit forwarding preserves adapter receivers and
  validates read project/lifetime and write owner/lifetime; warm retained row reads
  compare revision changes to the authoritative SQLite store after set and remove.
- `mutation-receipts.json` records 12 watched failures with substitutions and outputs
  in `mutation-*.txt`: omitted guard; wrong parent; wrong project; project-wide read;
  unconditional refusal; aliased node objects; guard moved after statement apply;
  empty command node detail; missing HTTP node detail; removed HTTP 409 schema arm;
  stale empty working-scope evidence; omitted targeted-read project/lifetime guard.
  Each failed its production assertion; none hit the resource cap.
- The forwarding/registry fault transcript and exact substitutions are kept beside
  these receipts. Every new guard's adjacent `Proof:` comment names its observed fault.
- Every Bun/type/lint process is serial and process-tree RSS monitored. The default
  cap is 900 MiB. Scoped module typecheck first hit that cap at 944,939,008 bytes
  (`type-work-item.txt`, exit137); the one-shot approved 1,280 MiB retry passed at
  959,074,304 bytes (`type-work-item-authorized.txt`). The first changed-path ESLint
  attempt likewise hit 900 MiB (`lint-00.txt`); approved retries use 1,280 MiB per path.
- Fresh global h2puni gate, broad Nx suites, build, migration lint and deployment are
  not run in this laptop slice; final integration must gate the exact commit on h2puni.

Forwarding proof completion: `first-child-forwarding-mutations.py` independently
removed the list-by-project project predicate, its lifetime predicate, set owner
check, remove owner check, set row refresh, remove row refresh, closed command code,
and required command nodes. All eight failed (`forwarding-mutation-receipts.json`).
The first set-refresh attempt was disqualified: `findById` reads the source directly
and let the mutant survive. `disqualified-set-refresh-fresh-findById.txt` preserves
that exit0; revised controls warm and compare the cached `listByProject`, after which
each refresh omission failed independently. The script restores each production file
in `finally`; each successful control/fault is RSS monitored under 900 MiB.

Nx graph: `NX_DAEMON=false bunx nx show project wbs-core --json` exited0 at
422,240,256 bytes and wrote this checkout's `.nx/workspace-data/project-graph.json`.
The unavailable socket path was reported and Nx used its supported in-process
fallback. Earlier direct ESLint receipts explicitly skipped the module-boundary rule
without that graph; they are not claimed as complete lint. A fresh graph-boundary
negative and grouped changed-path lint follow below.

Final graph-aware ESLint: `lint-final-receipts.json` records exact argv and coverage
for all 36 changed TypeScript paths. Twenty-five successful invocations cover each
path, without a skipped module-boundary warning; maximum passing RSS is 1,058,594,816
bytes. One 20-file app group hit the approved 1,280 MiB limit at 1,342,271,488 bytes
(exit137), then immediately split into 20 passing per-file invocations. The other
five groups passed. The production import of `@wbs/store-sqlite` into the application
resource was independently rejected by `@nx/enforce-module-boundaries` (exit1,
882,782,208 bytes, `mutation-nx-boundary.txt`); source was restored. These receipts
supersede the earlier lint runs that lacked a graph.

Pinned hook installation: `bun run tools/tool-git-hooks/src/install.ts` succeeded
(`hooks-install.txt`). The ignored local override changes only pre-commit concurrency
and lint process granularity; all eight original groups, globs and trailer hooks
remain. Actual Lefthook selected 36 staged lint paths exactly once, compared as a
multiset to the original staged lint glob (`hook-selected-lint-paths.json`). Split
per-file argv are intentional, not byte-identical to aggregate argv. Mocked first,
middle and last failures stop after 1, 19 and 36 calls. Removing `set -e` incorrectly
exits0; removing the empty-argv guard incorrectly exits0 instead of64. All are
watched via `hooks/proof.py` and `hook-proof-receipts.json`. The real staged unused
variable was rejected through Lefthook with `@typescript-eslint/no-unused-vars`,
loaded graph and no skipped-rule warning (exit1, 716,513,280 bytes). Restoring and
restaging the source preserves its exact SHA256 (`hook-real-restoration.json`). The
final full hooked commit is recorded separately after final checks and review.

Final scoped controls (`final-check-receipts.json`): focused service/mounted/refusal
compiler tests **17 pass / 0 fail, 97 assertions**, peak 710,926,336 bytes; work-item
module typecheck **exit0**, 946,946,048 bytes; plan-commands module typecheck **exit0**,
957,476,864 bytes. Changed-path Prettier write **exit0**, 556,683,264 bytes. Selected
change strict OpenSpec **valid**, 74,477,568 bytes. Required `validate --all --json`
**212 passed / 0 failed**, 129,335,296 bytes. All run serially with the documented caps.

Additional `validate --all --strict --json` **exits1**, 206 passed / 6 failed:
`dev-deploy`, `live-plan-snapshot`, `plan-command-registry`, `plan-import`,
`saved-plans`, `scheduler-optimization` retain placeholder Purpose warnings. This is
inherited: rerunning the identical pinned strict command in the clean exact parent
`79c0bcfc3ac1169fb080627a497030053a5e5197` exits1 with identical issue objects; all six
main-spec blobs match byte-for-byte (`strict-parent-comparison.json`,
`openspec-parent-all-strict.txt`, peak 133,853,184 bytes). No unrelated main specs
were changed. All 194 change artifacts pass even in that global strict run.

Tasks `3.1.2` and `3.2.2` are complete for this bounded preservation prerequisite;
parents `3.1` and `3.2` remain open for the broader lifecycle/history implementation.
Normal hooked commit and exact-SHA h2puni integration gate remain separately recorded
steps; no full-feature completion, deployment or release claim is made here.

Hook provenance: `hook-real-restoration.json` proves immediate restoration of the
real lint fault at **06:48:12 local** (SHA256 `0aaca935…`). The later final Prettier
pass (**06:49:43 local**, `format-final.txt`) moved only the conditional-type `:`
before its adjacent Proof comment and indented `C extends 'referenced_by_step_parallel'`.
The final source SHA256 is `ec47725e…`; type tokens and runtime behavior are unchanged.
The exact earlier source is preserved in `hook-proof-refusal-before-prettier.ts.txt`,
recovered from local Git blob `dc15a9d1d0e3d169fbc3c0d2f4d3286be7078f18`;
`hook-proof-final-format-comparison.json` records both full hashes and the exact diff.
The restoration receipt does not claim the later formatted file has the earlier hash.

## Move destination preservation prerequisite (2026-10-17)

Base: `aeb2e33f8313857dd0c388c2244dfea05aa7bfa6`, tree
`ba8d2989c7d10e70ca439749652a470c1fdfeafb`, isolated local clone. The complete-history
bundle SHA256 matched `21f33e5440e4a4cad1deb5c82e713cf9f01768bb0fb1efe7d5595eae090960ef`.
All Bun/Nx work is serialized through the PM heavy lane and monitored by
`/tmp/runtime-rss-guard.py` with `RUNTIME_CLOSURE_RSS_MIB=900` unless a measured
cap refusal and explicit PM authorization are recorded below.

Evidence: `evidence/move-2026-10-17/`. Initial forward memory RED: **1 pass / 11 fail**,
peak **504,872,960 bytes**; mounted one/multi-command RED: **0 pass / 2 fail**,
peak **581,603,328 bytes**, both returned 200 instead of exact 409. Initial forward
GREEN: **15 pass / 0 fail / 50 assertions**, peak **500,310,016 bytes**.

The first replay fixture run (`red-replay-forward-green.txt`) is disqualified as
replay evidence: missing normal blockage activation caused `step_blockage_inactive`
before replay. After `activateTestStepBlockages`, `red-replay.txt` independently
observed undo and redo with destination policy return **200 rather than 409**;
forward mounted and unrelated-policy controls passed. A redo revision-control
assertion also failed because the destination was not necessarily in the touched
revision set. That control now mutates the known touched moving row. The SQL
policy injection preserves owner revision to ensure the new applyMove guard is
actually reached rather than hidden by ordinary revision staleness. Replay
refusal assertions intentionally exclude the command journal: existing policy
rolls back replay then discards the stale history entry.

Final focused checks, mutations, review and hook receipts are recorded below once
observed. Full feature/public writer/lifecycle parent tasks remain open.

Expanded final focused service/mounted controls: **28 pass / 0 fail / 161 assertions**,
peak **580,468,736 bytes** (`green-replay-controls.txt`); after all supplemental
faults restored **28/0**, peak **587,341,824 bytes** (`restored-green.txt`).
Undo and redo now journal mixed batches ordered to apply a real unrelated-row patch
before the guarded move. A call-through observer records the actual adapter's written
name, then table snapshots prove rollback. Valid retained policy returns stale_undo
and removes the journal entry; unreadable or corrupt selected facts return 500 and
preserve the entire exact journal. Corrupt selected policy uses persisted maximum 1001
with SQL CHECK temporarily disabled only for fixture injection, then restored.

Eleven initial watched production faults are recorded in `fault-receipts.json`:
omitted forward guard, wrong moving owner, project-wide selection, early membership
and actor lookup, swallowed reader, existing-parent skip, lost node details, stale
empty admitted reader, omitted replay guard and project-wide replay selection.
Each caused the named production test to fail (maximum peak **641,351,680 bytes**).
Access-order negatives throw from the poisoned reader before the expected modeled
refusal; they are recorded as boundary rejection, not assertion failures. A first
swallow probe used `.catch` on a synchronous throw and was ineffective; the final
probe wraps the call in Promise.then so both synchronous and asynchronous failures
are swallowed, and the required-throw negative fails. All final faults are restored
with SHA256 receipts; no ineffective probe is claimed as proof.

Supplemental faults (`replay-fault-receipts.json`): moving the forward guard below
stamp allocation failed both retained-pair negatives on stamps **1 vs 0**, peak
**510,001,152 bytes**. Converting replay reader/corruption exceptions into stale
outcomes failed four undo/redo controls on **409 vs 500**, peak **588,611,584 bytes**.
Restoration receipts and the subsequent restored full GREEN confirm the production
source was restored. Adjacent Proof comments name these observed production paths.
Astra reviewed the implementation with no P0–P3 defect; the identified proof gaps
(late stamp, replay exception propagation, preceding replay write rollback) are now
covered by the supplemental evidence above. Final static checks/hooks remain pending.

Final scoped static checks (`checks-*.json` and named logs): formatter **exit0**,
peak **350,744,576 bytes**. Work-item scoped tsc **exit0**, peak **964,763,648 bytes**;
plan-commands scoped tsc **exit0**, peak **942,477,312 bytes**. PM approved these two
one-shot 1280MiB caps from earlier measured 946–957MB peaks and fresh available
memory; all commands ran serially. No higher cap was used implicitly.

Initial service/memory lint exit0 receipts are **disqualified** because Nx explicitly
skipped boundary rules without a cached graph. The first mounted lint hit the 900MiB
cap at **947,871,744 bytes**; no success is claimed. Fresh Nx graph generation
**exit0**, peak **412,594,176 bytes**, produced a graph despite the documented socket
sandbox fallback to main-process plugins. Real graph-backed lint then found two
mounted test issues (import order and intentionally captured prototype method).
Imports were sorted; the test-only unbound-method exception names the receiver
boundary at its call-through observer. The measured mounted lint peak
**992,415,744 bytes** plus fresh available memory justified explicit PM approval for
one renewed 1280MiB run. Final graph-backed ESLint: service **exit0**,
**821,174,272 bytes**; memory test **exit0**, **751,710,208 bytes** (both 900MiB);
mounted test **exit0**, **993,779,712 bytes** (1280MiB). No rule-skipped warning.

Injected actual core→SQLite adapter import failed **@nx/enforce-module-boundaries**
with exit1, peak **872,624,128 bytes** (`lint-boundary-negative.txt`); byte restoration
was recorded and restored service lint exited0. Pinned OpenSpec 1.12.0 selected strict
validation **valid/exit0**, peak **72,888,320 bytes**; required `validate --all --json`
**212 passed / 0 failed / exit0**, peak **136,171,520 bytes**. Status/apply instructions
were read for the existing spec-driven change; broader tasks remain unchecked.

Tasks 3.1.3 and 3.2.3 cover this bounded move prerequisite only. WBS leaf completion,
public writer, lifecycle parent, full Nx/build checks and exact-SHA h2puni gate are
not claimed. Final formatting-after-evidence, focused rerun, staging review and
normal hook commit remain separately recorded steps. Restoration hashes describe
immediate injected-fault restoration before later Proof comments and formatting;
they do not claim those later source bytes have the earlier hash.

Final formatting including evidence JSON **exit0**, peak **362,680,320 bytes**;
formatted candidate focused rerun **28 pass / 0 fail / 161 assertions**, peak
**584,904,704 bytes** (`focused-final.txt`). Normal `bun run
tools/tool-git-hooks/src/install.ts` installed Lefthook without bypass. The ignored
local serial override changes only pre-commit parallelism; effective dump comparison
proves all eight groups, globs and both trailer stages are identical. Actual
aggregate Lefthook lint at 900MiB was **killed at 948,994,048 bytes** before a success
claim. Per-file lint and wrapper proof/full-hook receipts follow after explicit PM
approval based on this measured bound. No commit has been made at this point.

Per-file hook override was authorized after the measured aggregate bound. Its effective
JSON changes only serial pre-commit plus the lint run command; all original groups,
globs, exclusions and both trailer stages remain equal (`hooks/per-file-equivalence.json`).
Actual Lefthook argv proof selects exactly the three staged TS paths, once each.
First/middle/last injected lint failures stop after1/2/3 calls; removing `set -e`
incorrectly exits0 after all three. Empty selected argv exits64, and removing the
empty guard incorrectly exits0 (`hook-proof-receipts.json`). A real staged unused
variable in the new memory test fails `@typescript-eslint/no-unused-vars` through
Lefthook with the Nx graph active, exit1 and **813,608,960 bytes**, under900MiB.
Working tree and staged index bytes restore to SHA256 `02129f2dfeff09957c1446237e67499db6138a885527d27b296c8b6a551a208b`
(`hook-real-restoration.json`, `hook-index-restoration.json`).

Raw tool output with trailing whitespace is retained exactly as SHA256 plus base64
in adjacent `.raw.json` files; corresponding display logs trim trailing whitespace
so cached diff checks stay meaningful. No fault or output is silently discarded.
Full positive hooks and a normal commit await exact wrapper review and authorization.

Restored full normal Lefthook pre-commit **exit0**, peak **1,056,579,584 bytes** under
PM's fresh-memory-approved one-shot1280MiB envelope (`hooks-full-positive.json`).
Format, graph-backed lint, plaintext-secrets, private-nesting and tool-wiki ran.
Actual lint invocation multiset equals the three staged TS paths exactly once;
there is no skipped Nx rule warning. Doc-caps and both migration groups visibly
had no matching staged paths. Tool-wiki visibly reports `inactive`, `certified:false`,
reason external activation root not provisioned; no active certification is claimed.
Both trailer stages remain in the effective config for the subsequent normal commit.
Raw output and SHA256 are retained beside the display log. Final receipt staging and
normal local commit remain pending root authorization; no public push or deployment.

## Work-item deletion preservation prerequisite (2026-10-17)

Base: `a990d0695b35e711d5fe93da22b66708e3bbe43e`, tree
`63d624e2783ffcb1e651ce27edc4ebf60fb493c9`, isolated clone
`/tmp/puni-delete-owner-20261017`. Complete-history bundle SHA256 matched
`71de3471ba47dd5c83ab61cad0fce2a6c0eda955dfc3ed34b8bc7a46756a3ca9`.
The predecessor dependency binding was reused only after both `bun.lock` hashes matched
`15651c976776d7c1ab3a87935b53dae67e73939c6f7d06dec12ed10598cfe80c`.
Every Bun/Nx process is serialized through the PM lane and monitored by
`/tmp/runtime-rss-guard.py` under a 900MiB process-tree ceiling unless a measured
refusal and explicit one-shot authorization are recorded.

Evidence: `evidence/delete-2026-10-17/`. Initial memory RED was **0 pass / 12 fail**,
peak **499,265,536 bytes**. Retained forward policy returned success; poisoned,
missing and corrupt trusted reads resolved without consultation. Initial mounted RED
was **13 pass / 14 fail**, peak **594,288,640 bytes**. Single/mixed command refusals
returned 200 instead of exact 409; redo-leaf, redo-cascade, undo-create and undo-duplicate
each returned 200 instead of 409 for retained policy or 500 for throw/corruption.
Unrelated, empty and ordinary revision-stale controls passed, as did promote forward/redo.
No fixture failures were disqualified from these RED receipts.

After the two guards, memory GREEN was **12 pass / 0 fail / 46 assertions**,
peak **504,459,264 bytes**; mounted GREEN was **27 pass / 0 fail / 235 assertions**,
peak **638,824,448 bytes**. The replay fixtures inject sparse facts using raw SQL and
assert owner revision is unchanged, then observe the real repository's preceding
patch before policy refusal or trusted-state failure. Valid policy rolls back every
captured table and discards the stale entry; thrown/corrupt evidence rolls back those
tables and preserves the complete journal bytes. Promote and unrelated sparse owners
survive forward removal and replay. No public writer or sparse snapshot/remapping ships.

Pinned OpenSpec 1.12.0 status, apply instructions and selected strict validation each
exited0 under900MiB, peaks **76,955,648**, **77,860,864** and **71,593,984 bytes**.
The artifact schema is spec-driven; broader lifecycle, transfer, public writer and
release tasks stay open. Full host gate, broader Nx suites, build and deployment have
not been run in this laptop slice; final integration must gate the exact commit on h2puni.

R5 faults: `prove.py` and `mutation-receipts-all.json` record **20 independent
watched production-path failures**, each exit1 under900MiB. Maximum peak was
**642,695,168 bytes** for overbroad replay selection. Forward probes omit the guard,
select only the root, name the wrong owner/project, broaden to the project, read before
context/authorization or required strategy, move lookup after statement removal,
swallow trusted errors, refuse empty policy, lose details, or return getter aliases
bound to mutable supplied facts. Other probes bypass the admitted sparse reader or
strip shared command HTTP details. Replay probes omit the guard, select only the root,
restrict it to delete metadata (missing undo-create/undo-duplicate), broaden to surviving
owners, convert exceptions to stale policy, or move lookup after owner deletion.
Every probe failed its named production test; no runtime attempt survived, hit the
cap, or was disqualified. A static ambiguous method-name anchor was corrected before
running the harness because blockage reads share `listByWorkItems`.

Each receipt records original, mutated and restored SHA256. Service restoration was
`fa7436753ea16ab47b2a3d8a2bf8e715e06767adc4e5d1bfeecb8d08313178e9` before
adding observed adjacent Proof comments; the working-plan and command-binding files
also restored exactly. The added comments describe observed faults, not planned tests.

Final scoped checks and review: PM-reported Astra-high review verified the seven
static candidate hashes and all 20 fault receipts, with no P0–P3 findings. Subsequent
changes are formatting, verification/task bookkeeping and one test expected literal
made `as const` for Bun's typed equality matcher. Initial WorkItem tsc at900MiB was
killed137 at **945,676,288 bytes**; this is a resource refusal, not type evidence.
The first explicitly authorized1280MiB retry produced two TS2769 matcher diagnostics
at **942,739,456 bytes**. After the test-only literal fix, the separately authorized
retry exited0 at **932,929,536 bytes**. PlanCommand tsc similarly hit900MiB at
**944,275,456 bytes**, then its authorized1280MiB retry exited0 at **959,811,584 bytes**.
Each increase followed fresh available-memory output and explicit PM authorization.

Fresh Nx graph generation exited0 at **408,006,656 bytes**, using the supported
main-process plugin fallback after the sandbox socket refusal. Graph-backed ESLint
exited0 for the service at **825,098,240 bytes** and memory test at **757,030,912 bytes**.
Mounted test lint hit900MiB at **944,992,256 bytes** before its separately authorized
1280MiB retry passed at **985,821,184 bytes**. There were no skipped module-boundary
warnings. Injecting an actual core import of the SQLite adapter failed the active
`@nx/enforce-module-boundaries` rule (exit1, **877,199,360 bytes**); bytes restored exactly.

Final focused memory suites (delete, first-child, move and WorkItem resource) passed
**170 tests / 495 assertions**, peak **533,966,848 bytes**. The three mounted sparse
preservation suites passed **41 tests / 382 assertions**, peak **597,417,984 bytes**.
Pinned selected strict validation and required `validate --all --json` exited0;
all validation reported **212 passed / 0 failed**, peak **135,729,152 bytes**.

Normal hook installation exited0. Ignored local Lefthook configuration serializes
all required commands and per-file real ESLint without disabling any rule. The seven
`hook-proof-receipts.json` cases establish exact three-path coverage and refusal of
first/middle/last failures; omitting `-e` wrongly exits0, and empty selection exits64
while removing its guard wrongly exits0. A real staged unused declaration independently
failed normal Lefthook lint via `@typescript-eslint/no-unused-vars` (exit1,
**890,683,392 bytes**); both bytes and index restored. Full normal pre-commit under900MiB
was killed137 at **955,985,920 bytes**, so that attempt proves no complete hook success.
After fresh memory and explicit PM authorization, all eight normal required commands
passed serially under1280MiB (exit0, **1,075,503,104 bytes**). Tool Wiki's observed
status was inactive/not-certified because the external activation root is not provisioned;
this run does not certify Tool Wiki activation. Normal commit hooks execute again;
the commit receipt is retained externally to avoid changing the committed tree afterward.

## Forward duplication preservation prerequisite (2026-10-17)

Base: `09f484ce5197fd59dcb3c6a4056b1eeeb8d345fe`; isolated clone
`/tmp/puni-duplicate-owner-20261017`. Only forward duplication ships here. Restore
destination admission, sparse remapping/history ownership, public writing and all
unchecked parent tasks remain outstanding.

Dependencies: the initially inspected root donor lock differed, and its briefly
created link was removed. The deletion donor's matching lock concealed a transitive
link to that same physical root tree. Its early `red-memory.txt`, `red-mounted.txt`
and first `red-matched.txt` runs are disqualified for dependency provenance; the last
also exposed two invalid fixture parent blockage snapshots, fixed before qualifying
RED. The physical donor now is
`/home/df/wd/puni/puni-00/.worktrees/shared-restore-activation-sol/node_modules`; its
parent's and this clone's `bun.lock` SHA256 both equal
`15651c976776d7c1ab3a87935b53dae67e73939c6f7d06dec12ed10598cfe80c`. No install
or network action ran. Plain `openspec` was unavailable; the local cached pinned
CLI executable reported version **1.12.0**, then status/apply reported ready,
38 tasks / 21 complete before this slice.

Evidence: `evidence/duplicate-2026-10-17/`. Terminal trailing whitespace was
normalized in text transcripts for clean diff checks. Every runtime command was serialized
under the PM's heavy lane and `/tmp/runtime-rss-guard.py`, default900MiB. Historical
`red-matched-fixed.txt`: **1 pass / 13 fail**, peak **579,809,280 bytes**; its two
parent-status fixture branches were subsequently disqualified by review. Final
`red-corrected-fixtures.txt` replays the omitted guard against the corrected fixtures
and is the qualifying final RED evidence. Retained
source policy returned success; absent, unreadable and malformed evidence was never
read. Empty selected policy with unrelated and foreign owners passed as control.
After the minimal required admitted reader and widened return union, focused tests
passed **14 / 14**, peak **584,212,480 bytes**. Final regression memory suites
(duplicate, deletion, first-child, move, WorkItem resource) passed **182 tests /
538 assertions**, peak **553,394,176 bytes**. Four mounted preservation suites
passed **43 tests / 404 assertions**, peak **608,305,152 bytes**.

Astra review found that the original nested/parent-corrupt fixture retained
leaf readiness/hold after adding children. Its root-only and leaves-only fault
failures reached the parent-status invariant, so those receipts are explicitly
disqualified as confounded (`disqualified-confounded-*.txt`). Corrected fixtures
clear readiness, hold and the original estimate before adding children. Two new
positive controls prove duplication succeeds after clearing policy from the nested
source or the injected corrupt-parent table. Corrected focused baseline passes
**14 tests / 67 assertions**, peak **583,974,912 bytes**. All17 final qualifying mutations
were rerun against these corrected fixtures.

`mutation-receipts.json` records **17 independent qualifying production-path
faults**, each exit1 with actual assertion failures; maximum peak **638,550,016
bytes**. Faults omit the read, select root only, wrong project, every project row
or leaves only; swallow a reader throw or default an absent reader; lose, reverse
or alias nodes; drop shared HTTP details; read before authorization/size refusal;
allocate IDs/stamps or write before refusal. The admitted-scope fault retains
transaction rows and writes but substitutes the stale public sparse reader through
composition: it returns successful mixed patch+duplicate instead of exact refusal.
An earlier whole-public-graph substitution timed out and is explicitly disqualified
(`disqualified-public-graph-timeout.txt`); it is not an atomicity proof. All changed
production files restored after each fault, then observed adjacent Proof comments
were added. `prove-corrected.py`, `prove-extra.py` and `prove-public-reader.py` retain
the qualifying executed fault recipes. The earlier recipe and disqualified logs
remain as historical evidence.

Prettier write exited0, peak **370,180,096 bytes**. Fresh Nx graph generation
exited0, peak **261,832,704 bytes**, using the supported main-process plugin mode.
The first guessed compiler path `typescript/bin/tsc` was absent and proves no type
check. The locked `.bin/tsc` points to `@typescript/native/bin/tsc`. WorkItem scoped
typecheck at900MiB was killed137 at **946,667,520 bytes**, a resource refusal. After
fresh available memory (**18,894MiB**) and explicit PM authorization, the one-shot
1280MiB retry exited0 at **948,211,712 bytes**. Later commands return to900MiB.

The initial queued per-file graph-backed lint shell sequence lacked fail-fast:
service, memory and mounted attempts each hit900MiB, at **949,559,296**,
**960,262,144** and **950,927,360 bytes**. These resource refusals prove no lint
success. Fresh available memory was **19,025MiB**; PM authorized one-shot1280MiB
retries for each exact path, to run and inspect separately.

All three authorized graph-backed ESLint retries exited0: service at
**1,173,635,072 bytes**, corrected memory test at **1,105,309,696 bytes**, mounted
test at **1,160,802,304 bytes**. No skipped boundary-rule warnings appeared.
Corrected fixture WorkItem scoped tsc hit900MiB at **946,843,648 bytes**; after
fresh **18,999MiB** available and explicit PM authorization, its one-shot1280MiB
retry exited0 at **947,826,688 bytes**. The scoped program includes imported
composition/command binding callers through the new batch test.

Pinned OpenSpec selected strict validation exited0 (peak **70,307,840 bytes**);
required `validate --all --json` exited0 (peak **133,038,080 bytes**). Final Prettier write exited0, peak **132,259,840 bytes**.

Canonical hook installation exited0 (peak **87,920,640 bytes**). Effective
configuration preserves all original groups and rules, serializes pre-commit and
uses per-file real ESLint over exactly the original staged lint selection. All
seven wrapper proofs passed: exact three-path multiset, first/middle/last faults
stop after1/2/3 calls; removing `set -e` wrongly exits0; empty argv exits64 and
removing that guard wrongly exits0. Real staged `duplicationLintFault` was refused
by active `@typescript-eslint/no-unused-vars` through normal Lefthook lint, exit1
with named diagnostic (peak **872,235,008 bytes** under explicit1280MiB cap).
Source and index restored exactly before the full positive hook.

Restored normal pre-commit exited0 under the authorized1280MiB cap, peak
**1,031,573,504 bytes**. Format, graph-backed lint, plaintext-secrets,
private-nesting and Tool Wiki ran; doc-caps and both migration lint groups skipped
because no matching paths changed. Real lint invocation multiset equals the
three selected TypeScript paths exactly once (`normal-hook-selected-lint.json`).
Tool Wiki reports inactive/not-certified because its external activation root is
not provisioned; this receipt does not certify activation. Normal commit hooks
will run again after PM clearance, with the receipt retained outside the tree.

Full host gate, broad Nx
test/lint/typecheck/build and deployment have not run in this bounded slice; final
integration must gate the exact commit through `bin/h2puni-gate.sh` on h2puni.

## Restore destination preparation (2026-10-17)

Isolated `/tmp/puni-restore-destination-20261017` starts at exact local prerequisite
`2cc9984ac9040adb2c6415e319bb6416df75bc8f`. Physical dependency donor
`/home/df/wd/puni/puni-00/.worktrees/shared-restore-activation-sol` has byte-identical
`bun.lock` (SHA-256 `15651c976776d7c1ab3a87935b53dae67e73939c6f7d06dec12ed10598cfe80c`);
its existing node_modules is linked without network installation.

Static preparation only: mounted redo-create/undo-delete matrix, destination
retention, reader throw, corrupt maximum, corrupt existing parent, unrelated,
empty/null destination and authorization/revision/typed-shape/deletion-state
precedence cases. No production change yet. RED, focused checks, R5 fault
injections, formatting and OpenSpec CLI validation remain unrun pending the PM's
serial heavy lane grant. Default monitored cap is 900 MiB. Public writer,
version 10, lifecycle parent tasks and UI remain open.

### Restore implementation and watched proofs

The corrected initial scaffold ran 20 mounted cases: 12 pass, 8 fail,
peak **583,872,512 bytes**. Only destination-retention, throw, corrupt-maximum
and corrupt existing-parent cases failed across redo-create and undo-delete.
An earlier scaffold incorrectly assumed create restoration carried deletionState
and expected root revision to be a create replay precondition; those fixture
assumptions were corrected before production edits and are not production RED
proofs. The final scaffold adds captured-blockage timing and two nested duplicate
controls, totaling 23 cases: **23 pass, 0 fail, 209 assertions**, peak
**641,708,032 bytes**. Prettier write exited0, peak **360,259,584 bytes**.

All runtime test and mutation commands use the PM's serial lane and
`RUNTIME_CLOSURE_RSS_MIB=900 python3 /tmp/runtime-rss-guard.py ...`; no higher cap was used
for those tests or mutations; later compiler and hook checks use separately approved caps. No network install was used. Raw receipts and reproducible isolated source
mutations are retained in `evidence/restore-2026-10-17/`. Each mutation restored
the source in `finally`; every listed run exited1 with named behavioral failures:

| Injected fault                            | Observed failure                                              |  Peak bytes |
| ----------------------------------------- | ------------------------------------------------------------- | ----------: |
| Omit destination guard                    | redo-create and undo-delete return200 instead of409           | 583,757,824 |
| Select project-wide policy                | two unrelated-policy controls return409 instead of200         | 582,672,384 |
| Catch trusted failures as stale           | four throw/corrupt cases return409 instead of500              | 639,520,768 |
| Skip destinations already parented        | two corrupt parent cases return200 instead of500              | 638,844,928 |
| Read null destinations                    | two root controls return500 instead of200                     | 643,686,400 |
| Read before deletionRefusal               | undo-delete blockage loses its existing refusal detail        | 582,037,504 |
| Read after subtree insertion              | two destination cases no longer return stale_undo             | 583,102,464 |
| Read after captured parent blockage clear | real parent remove observed before refusal, expected no clear | 583,241,728 |
| Omit nested duplicate destination check   | nested duplicate destination returns200 instead of409         | 581,242,880 |
| Reread historical original source         | nested duplicate source control returns500 instead of200      | 576,929,792 |

The nonempty captured parent blockage comes from deleting the blocked child;
its real repository removal is observed independently of final rollback. The
nested duplicate controls move its original source away using raw SQL without
revision changes, leaving a valid surviving destination leaf. Newly authored
source policy permits historical replay; destination policy refuses it. Both
cases retain exact sparse owners. These controls preserve public writer,
version10 and UI tasks as open.

Restored-source regression passed **291 tests / 1,257 assertions** across five
files: mounted restore/deletion/typed-dependency lifecycle, SQLite undo and core
WorkItem resource. Peak **777,445,376 bytes**. Final Astra-high exact-candidate
review reported no P0–P3 findings and qualified the ten intended mutation failures.

WorkItem scoped native `tsc --project
libs/wbs/application/core/src/module/work-item/tsconfig.json --noEmit` hit900MiB
at **949,764,096 bytes** (exit137, resource-disqualified). Fresh available memory
was18,900MiB; PM approved an exact one-shot1280MiB retry, which exited0 without
diagnostics at **961,105,920 bytes**. This proves the scoped module program only.

Mounted-test compiler config `/tmp/restore-controller-tsconfig-20261017.json`
extends the app spec config, includes only the new mounted test, removes project
references and explicitly resolves bun-types through the linked donor. Its imported
OrganizationHarness reaches the composed application graph. Native scoped tsc
hit900MiB at **944,697,344 bytes**; fresh available18,803MiB preceded the PM-approved
one-shot1280MiB retry, which also hit its cap at **1,348,689,920 bytes**. Both
exit137 receipts are resource-disqualified; mounted typecheck was unresolved at that checkpoint and is proven by the later restored-source receipts.
Fresh available18,850MiB and the second refusal were reported before further work.

Fresh Nx graph generation used supported main-process plugins and exited0, peak
**364,834,816 bytes**. Graph-backed production ESLint passed at **816,246,784
bytes**. Mounted ESLint hit900MiB at **947,228,672 bytes**; after fresh available
18,659MiB and explicit PM authorization its one-shot1280MiB retry exited0 at
**974,909,440 bytes**. Neither passing lint receipt skipped Nx boundary rules.
Pinned OpenSpec1.12.0 selected strict and all-change JSON validation exited0 at
**72,990,720** and **130,617,344 bytes** respectively.

The final authorized1700MiB mounted compiler run completed (exit1, peak
**1,497,219,072 bytes**) with TS2322 in unchanged
`libs/wbs/application/core/src/http/work-item.routes.ts:269`: grouped refusal
mapping loses the correlation between `referenced_by_step_parallel`/nodes and
shape errors/dependencyIds. This is a real compiler diagnostic, not a cap refusal;
that checkpoint did not prove mounted typecheck. The later PM/Astra diagnosis and restored passing compiler receipts below resolve it.

The PM/Astra diagnosis confirmed the grouped HTTP refusal type error is inherited
from the exact prerequisite base. The route now returns the sparse refusal in its
own case, preserving exact runtime bytes and keeping the two relationship cases
grouped. No cast, default or widened response type was introduced. The same scoped
mounted compiler then passed at **1,467,781,120 bytes** under the expressly approved
1700MiB cap after fresh available18,726MiB. Independently remerging the cases
reproduced TS2322 (exit1, **1,497,800,704 bytes**); source SHA-256 restoration was
checked exactly in `restore-route-restoration-20261017.json`. Restored compiler
passed again at **1,475,657,728 bytes**. This is a compiler proof; mounted duplicate
single/batch exact409-node assertions supply the runtime control. Restore plus
those exact-node controls passed **25 tests / 231 assertions**, peak
**592,654,336 bytes**. These scoped compiler receipts do not claim a full app gate.

Duplicate exact409 plus typed relationship lifecycle controls passed **15 tests /
138 assertions**, peak **595,521,536 bytes** after the route correlation repair.

Canonical Lefthook installation passed. Local configuration keeps every original
hook group, command and selection, runs pre-commit serially and feeds each selected
TS path separately to real graph-backed ESLint. Effective configuration comparison
and seven wrapper proofs passed: positive exact ordering; first/middle/last failures
stop after1/2/3 calls; empty argv exits64; removing fail-fast or the empty guard
incorrectly exits0. Missing Python YAML parser made an initial comparison unavailable;
the executed comparison uses the installed YAML library through Bun and validates
all original commands/globs/exclusions. Lefthook omits false parallel in its dump;
the proof checks both explicit local false and absence of effective true.

Normal pre-commit at900MiB was killed137 at **946,872,320 bytes**; that receipt is
resource-disqualified. After fresh available18,600MiB and PM authorization, the
1280MiB retry passed, peak **1,046,458,368 bytes**. A real staged unused constant
`restoreHookLintFault` was then refused by normal Lefthook lint with active
`@typescript-eslint/no-unused-vars` (exit1, **1,049,587,712 bytes**). Both source and
index SHA-256 were restored exactly before the final positive hook. No hook was
bypassed. Tool Wiki reports inactive/not-certified because its external activation
root is unprovisioned; these receipts do not certify activation. Doc-caps and the
two migration lint groups have no matching staged files.

Full host gate, broad Nx test/lint/typecheck/build, push and deployment remain
unrun. Final integration requires `bin/h2puni-gate.sh <exact-sha>` on h2puni;
public sparse writing, version10 and UI remain open.

Restored normal pre-commit passed at **1,046,327,296 bytes**. Its lint invocation
multiset equals all three staged TS paths exactly once, including both production
paths and the mounted test. The final receipt and selection proof are retained in
the evidence directory; trailing whitespace in text receipts is normalized only.

## Terminal project drain static preparation (2026-10-17)

New isolated clone `/tmp/puni-project-drain-parallel-20261017` starts at exact
committed restore prerequisite `aa88509a384564711321cfccdac84d4a8cfcb48c`;
the original restore clone and mode0600 complete-history bundle remain intact.
Static preparation adds a focused raw drain test file with finish/release/reclaim
valid-policy controls; both cross-project incident directions; missing owner/step,
parent ownership, invalid maxima and absent/unreadable storage negatives; and
absent/open/waiting/contract/dependency precedence controls. Installed-services
scaffolds cover finish and last-slot release with after-capture/event insertion
faults, exact sparse facts and graph/journal restoration, followed by clean retry.

Tasks3.1.7/3.2.7 remain unchecked. No production edit has been made. No Bun, Nx,
tests, hooks, formatter or OpenSpec CLI has run in this new clone pending the PM's
serial heavy lane grant. RED failures, minimum implementation, GREEN and watched
independent guard/scope/timing/transaction faults remain unverified. Existing
public writer, transfer, version10, scheduler, UI and release tasks remain open.

Astra static scaffold corrections: reference-corruption setup captures, drops and
restores only `step_parallel_owner_insert` around injected reference rows; turning
off foreign keys and checks does not disable that trigger. The owner/step/project,
parent and range negatives assert distinct sparse validation diagnostics, so an
independent SQLite foreign-key error cannot count as guard proof. No runtime
result is claimed for these corrected fixtures before the heavy lane grant.

Additional static review coverage: typed-dependency precedence has its own case;
a populated estimate carries a first-cleanup abort witness and requires the sparse
range diagnostic instead of that trigger's error. A corrupt nonincident bystander
maximum must remain byte-equal while target deletion succeeds on each raw path.
Raw snapshots now include populated project_access and optimized_schedule_cache;
slot paths seed cache and generation so rollback must restore preceding retirement
as well as the token. The bounded scaffold now contains45 raw cases and4 installed
rollback/retry cases. All remain unrun, with no production edits.

Spec-fixture alignment: each installed rollback fixture now seeds a second target
step `A-policy-step` and target pair maximum4 alongside `A/A-step` maximum1.
Bystander `B/B-step` remains maximum4. Both equal-default and unequal target facts
are therefore present in the rollback/retry snapshots described by the delta.
This is a static fixture correction; runtime remains unverified.

### Terminal drain RED, implementation and proofs

The corrected raw scaffold ran45 cases before production edits: **12 pass /
33 fail / 69 assertions**, peak **176,758,784 bytes**. All eleven fault categories
failed on each of raw finish, last-slot release and expired reclaim. Distinct
sparse diagnostics excluded incidental SQLite FK failures from the owner/step
proofs. Installed capture/event rollback fixtures already passed as baseline
controls: **4 pass / 36 assertions**, peak **623,271,936 bytes**.

The minimal project-arm guard performs synchronous transaction-local left owner
and step joins, selects owner-OR-step incident facts, validates missing references,
both project identities, leaf ownership and the existing integer maximum rule.
It runs after all existing drain and legacy/typed checks and before estimate or
other graph cleanup. Required query failure propagates. Raw GREEN passed **45 /
45 tests,102 assertions**, peak **166,707,200 bytes**. Prettier passed at
**353,517,568 bytes**.

`evidence/project-drain-2026-10-17/mutation-receipts.json` records **19 independently
watched production-path faults**, each exit1 with named behavioral assertion
failures and no cap kill. `prove-project-drain.py` restores both production files
in `finally` and checks restoration. Omit/direction/inner-join/null/project/leaf/
range/read-default faults each catch their specific sparse boundary. A first
estimate-cleanup trigger witnesses a read moved too late; unavailable storage
witnesses reads moved before waiting or typed-dependency precedence. A corrupt
nonincident bystander catches an overbroad read. Release committed before finish
loses generation/slot/cache; reclaim committed immediately after deleting expired
slots loses its slot. A COMMIT substituted for installed unit-of-work error
rollback fails all four graph/journal/event assertions. Those faults stop before
the later sparse assertion; restored passing controls separately check exact sparse
state.
That last proof breaks the rollback dependency; it introduces no UOW production
change. Highest mutation peak is **604,082,176 bytes**. All runtime test and fault
runs use the default900MiB monitored process-tree cap; no higher cap or install
has been used in this slice at this checkpoint.

Restored raw regression passed **123 tests / 317 assertions** across the new
sparse drain suite, existing optimization drain and sparse repository suite,
peak **642,461,696 bytes**. Installed regression and scoped checks were pending at that checkpoint; final
passing receipts are recorded below. No host gate completion is claimed.

Astra review qualified all19 mutation receipts with no P0–P2 production defect.
Historical restoration hashes are retained in
`historical-restored-source-hashes.json`; later edits add only observed Proof
comments and formatting. Final source hashes are recorded separately after final formatting and tied to
restored regression receipts below. The outer-UOW fault
claim is limited to the graph/journal/event assertion actually reached; it does
not claim a later sparse assertion executed on that failing path.

### Final scoped checks and exact candidate

Installed restored regression passed **17 tests / 140 assertions**, peak
**687,079,424 bytes**. After final Proof comments/formatting, exact unchanged source
bytes passed raw **45 tests / 102 assertions** at **159,137,792 bytes** and installed
**4 tests / 36 assertions** at **596,668,416 bytes**. Both named receipts are retained
beside `final-candidate-hashes.json`; its before/after hashes were compared across
those runs. Historical hashes remain distinct. Astra cleared code and all19
mutation receipts; no further behavioral test was requested.

Both compiler configs are retained as scoped provenance, with explicit paths,
Bun types and no project references; their imported dependency programs exceed the
selected entry files. These are scoped results, not a full repository typecheck.
Store native tsc hit900MiB at **944,123,904 bytes**, then the PM-approved1280MiB
retry hit **1,342,750,720 bytes**. Fresh available memory was16,393MiB and14,439MiB
before the separate authorized retries. The approved1800MiB store retry passed
without diagnostics at **1,730,093,056 bytes**. Installed-services tsc hit900MiB
at **947,826,688 bytes**; after fresh available17,855MiB, the approved1800MiB
retry passed at **1,189,007,360 bytes**. Every cap kill is resource-disqualified.

Fresh Nx graph passed at **362,278,912 bytes**. Real graph-backed production and
raw-test ESLint passed at **769,298,432** and **844,931,072 bytes**. Installed
ESLint hit900MiB at **950,931,456 bytes**; after fresh available16,186MiB its
approved1280MiB retry passed at **1,129,791,488 bytes**. No boundary rule was
skipped. Pinned OpenSpec1.12.0 selected strict and required all-change validation
passed at **78,278,656** and **133,922,816 bytes**. Required scoped checks are complete. Final normal hook proof and packaging
receipts follow below.

Canonical Lefthook installation and effective-config comparison passed. Local
configuration preserves every original group, command and selection, serializes
pre-commit and runs real graph-backed ESLint once per selected TS path. Seven
wrapper proofs passed: exact positive ordering, first/middle/last nonzero stop,
empty argv exit64, and watched failure of the fail-fast/empty guards when removed.
The first comparison attempt named a nonexistent receipt extension; the corrected
comparison uses the installed YAML parser and passed. Normal-hook900 was killed
at **947,060,736 bytes**, a resource-disqualified receipt. After fresh available
17,494MiB and PM authorization, normal-hook1280 passed at **1,214,459,904 bytes**.
A real staged `projectDrainHookLintFault` was refused by active
`@typescript-eslint/no-unused-vars` in normal Lefthook lint (exit1,
**1,218,572,288 bytes**); exact source/index restoration is recorded separately.

Tool Wiki remains inactive/not-certified because no external activation root is
provisioned. Doc-caps and migration lint groups have no matching paths. Full host
and broad Nx gates, push, merge and deploy remain unrun; integration must use the
exact-SHA h2puni gate. No public writer, version10, scheduler or UI task is closed.

Restored normal pre-commit passed at **1,208,438,784 bytes**. Actual
lint selection equals exactly the three staged TS paths once each. Final candidate
hashes still match source bytes after the real hook fault and restoration. Normal
commit hooks will run again; no hook was bypassed.

### Browser refusal compatibility found during current-main integration (2026-10-17)

The Step history had already added `referenced_by_step_parallel` to shared HTTP
refusals at the previous local integration tip `f5a53f72`; its existing browser
consumers were missed. The clean merge of pinned main `e8894d0145` did not change
`plan-refusal.ts`. A scoped frontend typecheck of that combined tree exposed two
TS2345 exhaustive-union failures in step removal and project commands. This was
a pre-existing Step consumer gap, not a regression introduced by the main merge.

The bounded fix adds explicit decoder cases and a readable preservation sentence,
retaining unknown-variant failure, shared response nodes and existing writer
refresh policy. New real PlanWriter tests cover both typed WbsRequestError
responses plus a completed request before a command refusal. They assert refused
outcome, one announcement, no retry, settled busy state, no refresh obligation
from the refused request and preservation of the completed prefix's refresh.
No public sparse editor or writer is enabled.

RED observed 3 new failures and 11 existing passes, each new failure reaching
`Unexpected response variant: object`. GREEN and the exact post-restoration
control passed all 14 cases. Independent production mutations removed the step
decoder case, command decoder case and sentence: respectively 1, 2 and 3 tests
failed for their expected boundary/wording diagnostic. The runner restored exact
pre-comment source bytes; final Proof comments and source hashes are recorded
separately. Both the 27-entry production frontend typecheck and the plan-writer
module typecheck, including the new tests, passed afterward.

Full current-main composition receipts, exact commands, resource-disqualified
attempts and verification limits are in `integration-main-e8894d0-verify-2026-10-17.md`
and its evidence packet. The full host gate and browser checks remain outside
this bounded compatibility follow-up.

## Integration gate corrections (2026-10-17)

PR565 exposed four incomplete validation updates in the imported Step work:
retained evidence scripts incorrectly carried executable bits; the exact step
409 schema assertion omitted the sparse variant; a memory refusal fixture widened
its literal types; and the source conformance opener plus both independently
maintained inventories omitted the implemented sparse case.

The two archived scripts now have mode0644 and identical Git blobs. Historical
configs executed separate `/tmp` or `.git` wrappers; the retained copies have no
current execution caller. No fleet baseline or shellcheck ownership was weakened.
The focused production executable judge reproduced exactly two failures before
the mode correction and zero afterward; eight inventory/ownership tests passed.
This is a focused executable-family verdict, not the full fleet check.

The step contract itself was already correct. Its test now retains exact ordered
six-variant equality and asserts the sparse discriminator, required nodes and both
required string IDs. Removing the production refusal and independently removing
node workItemId each failed the intended assertion; source bytes were restored.
The full contracts suite passed475/475 across49 files. The memory fixture now
`satisfies StepRemoved` without a cast: the scoped spec-project typecheck changed
from the two observed TS2769 failures to exit0; both mixed-rollback cases passed.

Conformance now supplies the required sparse opener, asserts the exact registration
ID, and independently enumerates it in `SOURCE_CONFORMANCE_CASES`. Removing the
production registration and independently removing the implemented inventory ID
each failed its intended exact equality. The restored suite passed35/35 across
nine files and its scoped spec-project typecheck exited0. These repair the existing
conformance contract; no scheduling, HTTP or persistence behavior changed.

Receipts and exact command scope are retained in
`evidence/integration-gate-corrections-2026-10-17/manifest.json`. The intermediate
`integration-conformance-green.log` is RED at the second equality, despite its
filename. The900MiB memory typecheck attempt was resource-killed at946094080 bytes
and is disqualified; an authorized1400MiB retry captured the actual diagnostic and
the corrected check passed at997/994MB respectively. No full h2 gate, browser check
or deployment completion is claimed by these local scoped receipts. Normal commit
hooks and containing-commit delivery receipts are recorded externally afterward.
