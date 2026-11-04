# Root integration receipt

Task2.1 integrated as `8acb32844` and `3fd1d9dce` (reviewed originals `56d1ec814`, `057968a92`). Astra High review approved; its only minor (explicit no duplicate project/mapping assertion) was fixed and scoped re-review approved. Normal root commit hooks passed. Terminal logs retain observed messages with trailing whitespace normalized for the repository whitespace check. Report below distinguishes initial red/regression observations from corrected passing runs. No full feature/gate claim.

# Slice 2.1: additive project abbreviation storage

Worktree `/tmp/puni-cross-storage`, branch `feat/cross-project-abbrev-storage`, base `0490225f0`.

Implemented only storage slice 2.1. No project contracts, core project ports, controllers, UI, `project.ts`, OpenSpec plan, or verify files changed. Parent separately authorized compatibility edits in organization ownership and directly affected migration test fixtures.

## Storage

- Confirmed migration identity `20261022210000_add_project_abbreviations` absent before creation.
- Additive side table with project PK/FK/cascade, explicit `legacy` or `org:<id>` namespace, normalized 1–20-character uppercase ASCII grammar, organization/code uniqueness, and abbreviation-only occupied-code lookup index.
- SQL grammar explicitly rejects NUL: SQLite GLOB/length stop at NUL; a raw `A\0B` update initially succeeded, the migrated production-path test failed, then `instr(abbreviation,char(0))=0` fixed it.
- Global persisted monotonic counter allocates atomic five-letter codes. Recursive candidate view skips occupied codes in every namespace, bounded by 26^5. Counter stores selected ordinal+1 before insertion, so the inserted row encodes `next-1` without rereading a changed candidate view. Exhaustion and absent counter refuse the project statement with explicit errors.
- Backfill uses project-id order and assigns every existing project, with current ownership namespace. Counter initialization refuses an unrepresentable population.
- Mapping INSERT synchronizes namespace in the ownership transaction. Both project trigger creation orders tested: bridge-first transient absence is allowed; allocator reads ownership if bridge has already inserted it. Existing ownership freeze is preserved.
- Down migration removes only new triggers, view and tables. Proof compares full name/hash ledgers before forward, after forward, after down; entire old project rows and ownership rows survive; no abbreviation objects remain; an old insert still succeeds after down.

`project-abbreviation.ts` exports:

- `readProjectAbbreviation(dbOrTx, projectId): StoredProjectAbbreviation | undefined`: undefined only when project absent; existing project with missing, malformed code or mismatched ownership namespace throws.
- `writeProjectAbbreviation(dbOrTx, projectId, normalizedAbbreviation): void`: requires exactly one updated row; SQL rejects invalid codes/collisions. Normalization and modeled HTTP conflict translation belong to slice 2.2. New creation plus ownership plus explicit override must share its caller's write transaction.

Necessary compatibility fix: `OrganizationOwnershipRepository.backfillLegacyOwnership()` previously counted `tx.run(statement).changes`, which Bun 1.4.2 includes namespace-trigger writes in: the unchanged existing 14-root assertion observed 15. The approved `tx.all(sql`${statement} RETURNING resource_id`).length` counts only top-level mappings, retaining the immediate transaction and exact original assertion. JSDoc records that invariant.

Migration fixtures: add newest migration identity to exact ascending/descending lists; add new tables to three exact down-schema removal lists; latest-name CLI fixtures updated. Claim occupancy refusal test first reverses later unrelated migrations to its own migration before recording its unchanged-ledger assertion (rollback intentionally commits each completed down migration).

## Verification receipts

Commands ran on pop-os using Bun 1.4.2; no h1claw execution or full Nx/heavy gates.

- Initial TDD red: 5 DB cases failed absent side table; extended 7-case red also included missing storage module. Initial migration green 6/7, then storage module green 7/7.
- Final focused `bun test libs/wbs/adapters/store-sqlite/src/project-abbreviation-migration.db.test.ts`: **15 pass, 0 fail, 55 assertions**, `/tmp/puni-storage-final-focused.log`.
- Focused four-file migration runner batch: initially **111 pass, 1 fail** (claim occupancy latest-migration assumption); its corrected standalone file **7 pass, 0 fail**, `/tmp/puni-storage-occupancy.log`.
- Changed migration-fixture regression run (35 files): **676 pass, 5 fail, 2404 assertions**, `/tmp/puni-storage-regressions.log`. Four actual integration regressions were corrected (three down-schema filters and backfill count); fifth was sandbox EPERM on an existing browser subprocess stdin flush.
- Corrected backfill/calendar/organization-records plus abbreviation four-file batch: **113 pass, 0 fail, 259 assertions**, `/tmp/puni-storage-last-regressions.log`.
- Corrected optimizer rollback: **1 pass, 0 fail, 8 assertions**, `/tmp/puni-storage-cache-final.log`.
- Browser subprocess EPERM reproduced on baseline `/home/df/.codex/worktrees/b3b7/puni-00`, `/tmp/puni-storage-browser-baseline.log`; parent root then ran exact browser lifecycle file in storage checkout under sandbox escalation: **14 pass, 0 fail, 67 assertions, 2.75 s**, including the two-process generation test (244 ms). This receipt was executed by root, not this worker.
- `bunx tsc --build --force libs/wbs/adapters/store-sqlite/tsconfig.json`: passed; `/tmp/puni-storage-typecheck-latest.log`.
- Additive migration lint and down presence via production `lintMigration`/`lintDownScriptPresence`: both returned null.
- Focused final ESLint passed; initial direct lint warned Nx graph unavailable; `NX_DAEMON=false bunx nx show projects` subsequently succeeded to build graph before final all-changed-file lint.
- Formatting and `git diff --check` verified separately; normal commit hooks must still run.

## Watched negative proofs

Production mutations were applied one at a time and always restored. Every listed mutation exited 1 with an observed relevant behavioral assertion, not a syntax/import failure. Adjacent Proof comments were added only after observation.

`puni-storage-negatives.log`:

1. Allocator trigger `WHEN 0`: zero persisted rows in actual old inserts and concurrent subprocesses.
2. Namespace trigger `WHEN 0`: mapping retained `legacy` namespace.
3. Unique index made nonunique: duplicate manual update committed.
4. Grammar `CHECK(1)`: invalid manual update committed.
5. Namespace UPDATE guard disabled: forged scope committed.
6. Namespace INSERT guard disabled: forged scope committed.
7. Counter range guard disabled: malformed ordinal committed.
8. Counter singleton guard disabled: singleton 2 committed.
9. Missing-counter RAISE replaced: absence misclassified as exhaustion (explicit diagnostic distinction).
10. Exhaustion RAISE replaced: NOT NULL fault instead of explicit exhaustion (refusal still preserved by lower invariant).
11. Required read missing guard disabled: undefined returned for existing project.
12. Required read grammar guard disabled: malformed `bad.code` returned.
13. Write affected-row guard disabled: missing row silently skipped.

`puni-storage-negatives-extra.log`: independently removed project PK, project FK, delete cascade, backfill selection; corresponding duplicate/orphan/deletion/full-backfill assertions failed.

`puni-storage-concurrent-negatives.log`: allocator trigger, namespace trigger, uniqueness index independently disabled, each failed the actual two-subprocess transaction test. Writers both reach a parent-held SQLite write lock before release; 30 legacy and 30 explicit writes run on separate connections. A duplicate new-writer transaction must refuse and leave no project.

`puni-storage-global-skip-negative.log`: removing the candidate's final occupied-code filter chose globally occupied AAAAB instead of AAAAC.

`puni-storage-down-negative.log`: replacing side-table DROP with SELECT 1 left side objects despite ledger restoration and failed rollback proof.

Additional direct TDD red/green: forged namespace was returned for the wrong owning organization before adding read namespace validation; NUL input was accepted before adding its SQL grammar predicate. More-than-1000 occupied prefix, final free code, occupied final code, exhausted sentinel, missing/malformed counter, manual cross-organization reuse and cascade behavior have explicit migrated DB cases.

## Remaining scope

No slice 2.2 integration. No full repository gate, build, secret scan, or entire store suite claimed. Focused checks and production migration lint establish only this storage slice and the directly affected migration compatibility paths. No architecture blocker remains.

Final status: all changed TS ESLint exit 0 with generated Nx graph; final focused store typecheck exit 0; git diff --check exit 0. Git staging was blocked by read-only worktree index.lock, so there is no worker commit. Root must stage the 40 assigned/authorized files and commit with normal hooks.

Review follow-up (Astra minor): concurrent duplicate refusal now explicitly queries both `project WHERE id='duplicate'` and `project_organization WHERE resource_id='duplicate'` and asserts neither row exists, in addition to abbreviation-row checks. Verification: full focused file **15 pass, 0 fail, 57 assertions**, `/tmp/puni-storage-review-final.log`; after formatting, concurrent case **1 pass, 0 fail, 8 assertions**, `/tmp/puni-storage-review-concurrent.log`; focused Prettier check passed. No production edit or commit. The missing-counter/exhaustion guard mutations remain diagnostic-only proofs: lower invariants already preserve refusal; those mutations prove explicit fault classification, not sole protection from writes.
