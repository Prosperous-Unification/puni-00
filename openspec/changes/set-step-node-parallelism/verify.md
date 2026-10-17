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
