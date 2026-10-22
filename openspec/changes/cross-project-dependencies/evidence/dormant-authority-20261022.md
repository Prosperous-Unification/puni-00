# Task 10.1 slice A: dormant storage authority

Isolated implementation base: `351ce5d43adf6dd2d5ffd28085ce31800008187d`.
Migration identity was checked against that tree before reserving
`20261022212000_add_cross_project_dependency_activation`.
Task 10.1 remains unchecked. This packet adds no activation mutation/CLI/flag,
startup hook, participant proof, capability advertisement or production active override.

## Behavior and fixture boundaries

The real migration runner creates one constrained DISABLED marker, an empty
constrained receipt table and three external-dependency admission triggers.
Preexisting external rows refuse forward migration atomically, retaining the
complete ledger and existing rows. Local typed-dependency writes remain usable.

`inspectDependencyActivation` checks the migration identity, normalized exact
constrained table definitions, marker, normalized exact trigger definitions and
receipt shape. Missing, closed/unreadable and malformed authority throws.
`readDependencyAuthoring` rereads authority on each access. It is exported for
later composition work; this packet does not connect it to service/startup wiring.

Database triggers refuse dormant external inserts, updates and deletes. Real
repository negatives compare external/local edges, projects, work-item revisions,
journal, event log and event sequencer. The real source UoW negative also proves
rollback of an earlier project mutation. Native SQLite errors remain native or
Drizzle-wrapped here; typed command translation/admission belongs to later wiring.

Down migration refuses ENABLED even with no live external rows. It also refuses
retained rows, malformed/missing marker or receipt authority, and unconstrained
replacement tables. Successful dormant rollback preserves local rows and audit.
There is no supported disable/reset operation.

The historical external-storage suite explicitly reverses only the dormant
authority migration after migration, leaving the storage version it tests.
Connected capture, connected live-read, external fanout and source-conformance
fixtures seed exact synthetic persisted receipts through a helper under `testing/`.
That helper is not barrel-exported and is imported only by tests. These are
storage/reader proofs, never participant-drainage or production activation evidence.
Optimizer-cache fixtures need migration-order/table-inventory updates only.
Explicit migration-order and newest-migration assertions were updated without
replacing them with inferred expectations. The abbreviation migration fixture's
baseline was corrected to its actual immediate predecessor, issuer-audience scope;
its ledger proof still compares every expected name and freshly computed hash.

## Verification

- Initial new-test commands failed on the absent authority and receipt modules.
  Logs: `/tmp/dependency-dormant-red.log`, `/tmp/dependency-receipt-red.log`.
- Focused authority/receipt tests passed after implementation; the expanded
  four-file command also includes organization activation and abbreviation
  migration regressions: **152 passed, 0 failed, 287 assertions**. Command:
  `bun test libs/wbs/domain/contracts/src/dependency-runtime.test.ts libs/wbs/adapters/store-sqlite/src/{cross-project-dependency-activation,organization-activation,project-abbreviation-migration}.db.test.ts`.
- Affected regression: **917 passed, 2 failed, 9752 assertions, 41 files**.
  One failure was the outdated organization-activation newest-migration assertion,
  corrected and passed in the four-file rerun. The other was
  `browser-auth-lifecycle.db.test.ts`, `two Bun processes capturing one generation
publish exactly one successor`: child `stdin.flush()` returned `EPERM` at line 161. That concurrency check requires a host rerun; it was not weakened.
  Log: `/tmp/dependency-dormant-affected-tests.log`.
- The affected run includes successful real source-conformance terminal
  certification, connected capture/live reads, external fanout, migration runners,
  rollback suites and backend migration/person-account CLI suites.
- Changed-file ESLint passed for 48 TypeScript files. Final staged Prettier,
  plaintext-secrets, private-nesting and migration-lint checks all passed (exit 0). The first full store and
  contracts lint-target attempts ran concurrently and exited nonzero without
  diagnostics; those full targets are **not established passing** by this packet.
- Contracts typecheck passed:
  `bunx tsc --build --force libs/wbs/domain/contracts/tsconfig.json`.
- Store typecheck still fails only on preexisting
  `connected-question-identity.test.ts:202`, TS2322 (`SS` assigned to an edge
  requiring `FS`). Root owns that fixture correction; this packet leaves it alone.
- Migration lint passed (exit 0):
  `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts apps/wbs/be-01/drizzle/20261022212000_add_cross_project_dependency_activation/{migration.sql,down.sql}`.
- OpenSpec validation passed **268/268**, zero failures:
  `bun node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json`.
- Dependencies used the existing workspace `node_modules` through an ignored
  symlink. No fresh frozen dependency install is claimed.

## Watched fault evidence

[Machine evidence](dormant-authority-mutations-20261022.json) retains each selected
test, mutation identity, failing exit and observed summary for 56 injections.
Each mutation was restored immediately before continuing. Six initial trigger
predicate injections were repeated for the complete INSERT/UPDATE/DELETE matrix.
The original selected names predate that test-name expansion; the final matrix
records include the action explicitly.

The injections covered ledger, exact table definitions, marker identity/state,
missing/altered trigger inspection, disabled-with-receipt, exact receipt identity,
the dynamic getter, each dormant DML trigger, each action's marker count/state and
receipt count/identity/protocol/version predicates, real forward refusal over
existing edges, enabled-empty and retained-edge rollback, each rollback schema
comparison, receipt field/key validation and SQL authority constraints.
SQLite JSON validation independently rejects NULL receipts; the explicit NULL
constraint proof therefore removes JSON validation and NOT NULL together and
records that dependency rather than claiming an independent NOT NULL proof.
Adjacent production `Proof:` comments name these observed faults.

## Delivery limits

No h2/h4 exact-SHA gate, full build, fresh frozen install, live deployment,
activation, startup admission, gateway/MCP handshake, participant drainage,
semantic downgrade recovery or recovery/removal command was run or implemented.
The final integrated branch still requires its isolated exact-SHA gate and review.
