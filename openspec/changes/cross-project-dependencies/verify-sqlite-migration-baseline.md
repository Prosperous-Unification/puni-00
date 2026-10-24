# SQLite abbreviation migration baseline — 2026-10-23

The configured SQLite-store suite at `129d8727193bac5d42b5d5ec5fe0dfb0a56ed246`
reproduced a deterministic ledger assertion failure in
`project-abbreviation-migration.db.test.ts`:
`backfills every project and rollback preserves old project rows and complete ledger`.
Its baseline preceded two merged compute-provider migrations, while its expected
forward and reverse lists named only the four dependency migrations. The unexpected
rows were `20261022140000_add_resource_provider` and
`20261022140100_widen_organization_audit_compute_providers`.

The baseline now names the latter migration, immediately before abbreviations.
Both provider entries remain in the captured baseline ledger. The explicit four
forward migration hashes, exact four reverse names, and complete restored ledger
comparison are preserved. No production code, migration bytes, or safety check changes.

## Reproduction and negative proof

Commands run on pop-os in an isolated `/tmp/puni-sqlite-diagnosis-20261023`
clone, Bun 1.4.2. `BUN_TMPDIR=/tmp` was required because the sandbox's default
temporary directory was read-only. Frozen dependency installation passed.

- Original configured `NX_DAEMON=false BUN_TMPDIR=/tmp bunx nx run
wbs-store-sqlite:test --outputStyle=stream`: exit 1, 2243 pass, one skip,
  five fail, 2249 tests across 153 files, 490.23 seconds. One failure was the
  reproducible ledger mismatch; four subprocess cases failed at sandbox pipe
  writes with `EPERM`. Browser-generation and both saved-plan-concurrency cases
  passed separately outside the sandbox. Performance measurements completed with
  cached/uncached CPU medians of 878.9185/1748.7565 ms for homogeneous work and
  472.547/738.952 ms for mixed work.
- Scoped red: `BUN_TMPDIR=/tmp bun test
./src/project-abbreviation-migration.db.test.ts
--test-name-pattern='backfills every project' --timeout=30000`, from the
  store project: exit 1, zero pass, one fail. The exact ledger comparison showed
  the two unexpected provider migration rows.
- Baseline fix: the complete abbreviation test file passed 15 tests, zero fail,
  57 assertions.
- Production-path negative: temporarily broadened the ledger deletion in
  `rollbackAppliedRows` to also remove the retained resource-provider migration
  row. The scoped round-trip case failed on reapplication attempting to create
  the existing `compute_provider` table. The mutation was removed; no production
  diff remains. An adjacent `Proof:` comment records the injected fault.

## Final checks

- Restored abbreviation file: 15 pass, zero fail, 57 assertions.
- `bunx eslint libs/wbs/adapters/store-sqlite/src/project-abbreviation-migration.db.test.ts`:
  exit 0.
- `bunx prettier --check` over the changed test and this record: exit 0.
- `bunx openspec validate --all --json`: exit 0, all 273 items passed
  (255 changes, 18 specifications).
- Final configured `NX_DAEMON=false BUN_TMPDIR=/tmp bunx nx run
wbs-store-sqlite:test --outputStyle=stream` outside the sandbox: exit 0,
  **2248 pass, one skip, zero fail**, 19,585 assertions across 153 files,
  634.23 seconds. The existing skip is the memory-store stale-undo case in
  `assignSubtree on the memory store, beyond the batch`. Both performance
  workloads completed, and all four subprocess cases blocked in the sandbox
  passed. Concurrent host TypeScript builds were observed during this run.

The original h2puni stream was truncated before its assertion, so this packet
establishes the local deterministic regression rather than claiming direct access
to that lost assertion. No canonical host gate, CI, integration, push, deployment,
or live migration was performed by this packet.
