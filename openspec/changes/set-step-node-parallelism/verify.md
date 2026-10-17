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
