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
The shared store case additionally changes the row default after storing an equal-default
value, proving the explicit fact remains present.

## Final checks

- `bun test libs/wbs/adapters/store-memory/src/step-parallel-conformance.test.ts libs/wbs/adapters/store-memory/src/step-parallel-fixture.test.ts libs/wbs/adapters/store-sqlite/src/step-parallel-conformance.db.test.ts libs/wbs/adapters/store-sqlite/src/step-parallel.db.test.ts libs/wbs/application/conformance/src/case-manifest.test.ts libs/wbs/domain/domain/src/node-resources.test.ts apps/wbs/be-01/src/controller/step-node-resources.controller.db.test.ts --timeout=30000`: **53 passed, 0 failed, 209 assertions**. Includes unchanged Stage 7a domain and mounted reads. Transcript: `evidence/focused-final.txt`.
- `bun test libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts --test-name-pattern 'certifies the sparse step parallelism source inventory' --timeout=30000`: **2 passed, 148 filtered, 0 failed, 32 assertions**. Both source declarations explicitly offer the new family. Transcript: `evidence/source-inventory-final.txt`.
- `bunx tsc --build --force libs/wbs/adapters/store-memory/tsconfig.json libs/wbs/adapters/store-sqlite/tsconfig.json`: **exit 0**, including referenced domain/core/conformance builds and test typings. Early test generic-row typings were corrected before this final build.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-core:build:portable --skip-nx-cache`: **passed**, 571 modules bundled. The adapters have TypeScript build/typecheck targets rather than a separate runtime build. Transcript: `evidence/portable-build-final.txt`.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts apps/wbs/be-01/drizzle/20261015110000_add_step_node_parallelism/migration.sql apps/wbs/be-01/drizzle/20261015110000_add_step_node_parallelism/down.sql`: **exit 0**. Focused SQL tests exercise real empty rollback/forward and retained-fact rollback refusal with table and applied ledger preservation.
- Installed pinned OpenSpec CLI: `bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js --version`: **1.12.0**. `validate set-step-node-parallelism --strict --json`: **1 valid, zero issues**; `validate --all --json`: **212 passed, 0 failed (194 changes, 18 specs)**. JSON transcripts are under `evidence/`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint -p wbs-domain,wbs-core,wbs-conformance,wbs-store-memory,wbs-store-sqlite --skip-nx-cache --parallel=2`: **all 5 passed**, cache skipped. Transcript: `evidence/scoped-lint-final.txt`.
- Changed-file Prettier check and `git diff --check`: **passed** before committing. Normal lefthook hooks are installed; no hook bypass is used.

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
