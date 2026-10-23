# Verification Report

**Change:** `activate-step-blockage-writers`
**Verified at:** `2026-10-16 22:01 UTC`
**Status:** All implementation slices are complete in the isolated local branch; exact-commit review, canonical host gate and representative-host timing remain pending. No live activation is authorized by this report.

## 1. Structural Validation

`bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json` exited 0:

```json
{ "items": 205, "passed": 205, "failed": 0 }
```

## 2. Task Completion

Tasks 1.1–1.4 and 2.1–2.3 are implemented. Preserve-only admission evidence is in section 8; the attended Compose operation, runbook and timeout/recovery proofs are in section 13. Kubernetes first-start still requires DISABLED. Final acceptance requires exact-commit review and the canonical host gate; no live activation was performed.

The runbook documents the two-window prerequisite, explicit host operation and retained-evidence recovery. No production activation, deployment, push or PR occurred.

## 3. Delta Spec Sync

`step-blockage-writer-activation`: synchronization pending; this change remains active until final acceptance and archive. Section 13 records the explicit fenced deployment implementation.

## 4. Failure Proofs

The receipt DB suite initially failed because the production module did not exist. The CLI suite initially failed because its executable did not exist. Each mutation below ran the real production module or CLI, never a copied validator. Sources were restored after every mutation. The injected inspector uses Bun's test preload boundary; the CLI still opens its real production connection.

| Check                        | Fault injected                                                               | Test that observed failure                                                                               | Observed result                         |
| ---------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Receipt migration ledger     | Omitted ledger count check                                                   | refuses broken authority: missing-receipt-ledger                                                         | Observed negative fail; source restored |
| Disabled receipt exclusion   | Omitted disabled receipt count check                                         | refuses broken authority: disabled-with-receipt (direct inspect assertion)                               | Observed negative fail; source restored |
| Enabled singleton receipt    | Omitted row count check                                                      | refuses malformed receipt rows: duplicate                                                                | Observed negative fail; source restored |
| Enabled receipt identity     | Omitted id=1 check                                                           | refuses malformed receipt rows: wrong-id                                                                 | Observed negative fail; source restored |
| Enabled receipt payload type | Omitted string check                                                         | refuses malformed receipt rows: nonstring (authority diagnostic)                                         | Observed negative fail; source restored |
| Receipt protocol             | Omitted exact protocol comparison                                            | refuses invalid receipt with protocol other                                                              | Observed negative fail; source restored |
| Receipt version              | Omitted version=1 comparison                                                 | refuses invalid receipt with version 2                                                                   | Observed negative fail; source restored |
| Receipt field set            | Omitted exact key set check                                                  | refuses invalid receipt with unexpected field                                                            | Observed negative fail; source restored |
| Activation identity          | Omitted nonempty activationId check                                          | refuses invalid receipt with empty activationId                                                          | Observed negative fail; source restored |
| Candidate digest             | Omitted candidate digest regex                                               | refuses invalid receipt with mutable candidateImage                                                      | Observed negative fail; source restored |
| Rollback digest              | Omitted rollback digest regex                                                | refuses invalid receipt with mutable rollbackImage                                                       | Observed negative fail; source restored |
| Database identity            | Omitted nonempty databaseIdentity check                                      | refuses invalid receipt with empty databaseIdentity                                                      | Observed negative fail; source restored |
| Time integer                 | Omitted safe integer check                                                   | refuses invalid receipt with activatedAt 1.5                                                             | Observed negative fail; source restored |
| Time bound                   | Omitted nonnegative time check                                               | refuses invalid receipt with activatedAt -1                                                              | Observed negative fail; source restored |
| Exact retry                  | Omitted existing receipt equality                                            | inspects DISABLED without a receipt then commits one exact receipt atomically (conflicting activationId) | Observed negative fail; source restored |
| Down singleton               | Omitted singleton predicate                                                  | refuses receipt down over duplicate-marker and preserves ledger                                          | Observed negative fail; source restored |
| Down disabled state          | Omitted DISABLED predicate                                                   | refuses receipt down over enabled-without-receipt and preserves ledger                                   | Observed negative fail; source restored |
| Down no receipt              | Omitted receipt-count predicate                                              | refuses receipt down over disabled-receipt and preserves ledger                                          | Observed negative fail; source restored |
| SQLite receipt id            | Removed id=1 CHECK                                                           | enforces receipt singleton identity, JSON and duplicate constraints in SQLite                            | Observed negative fail; source restored |
| SQLite receipt JSON          | Removed json_valid CHECK                                                     | enforces receipt singleton identity, JSON and duplicate constraints in SQLite                            | Observed negative fail; source restored |
| SQLite receipt uniqueness    | Removed receipt PRIMARY KEY                                                  | enforces receipt singleton identity, JSON and duplicate constraints in SQLite                            | Observed negative fail; source restored |
| Atomic persistence           | Removed transaction controls                                                 | rolls back ENABLED when receipt insertion fails                                                          | Observed negative fail; source restored |
| Persisted exact readback     | Before adding equality, injected AFTER INSERT trigger changing activationId  | rolls back when persisted receipt differs from the attempted receipt                                     | Observed negative fail; source restored |
| CLI DB_PATH                  | Omitted DB_PATH guard                                                        | refuses absent and empty DB_PATH                                                                         | Observed negative fail; source restored |
| CLI usage                    | Omitted usage guard                                                          | refuses unexpected arguments []                                                                          | Observed negative fail; source restored |
| CLI noncreating connection   | Substituted creating connection                                              | refuses a missing database without creating it                                                           | Observed negative fail; source restored |
| CLI read-only connection     | Substituted writable connection with injected write in inspection dependency | inspect refuses a write attempted by a broken inspection dependency                                      | Observed negative fail; source restored |

Missing and unreadable database/receipt files have separate CLI cases. A reversed object-property insertion-order receipt initially failed exact readback. The production serializer now uses the schema key order; the 33-case receipt suite verifies first activation and retry independently of insertion order.

A chmod-only read-only fixture did not detect writable connection substitution; it is filesystem behavior coverage, not the read-only proof. The injected-write case above independently detected that substitution.

## 5. Original Prerequisite Commands and Output (6093b326)

Fresh scoped checks:

- `bunx tsc --build --force libs/wbs/adapters/store-sqlite/tsconfig.json apps/wbs/be-01/tsconfig.json`: exit 0, empty output.
- After canonical serialization, `bunx tsc --build libs/wbs/adapters/store-sqlite/tsconfig.json apps/wbs/be-01/tsconfig.json`: exit 0, empty output.
- New receipt/CLI source and test files through `bunx eslint`: exit 0, empty output after generating the Nx project graph.
- `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts apps/wbs/be-01/drizzle/20261015100000_add_step_blockage_activation_receipt/migration.sql`: exit 0, empty output.
- `git diff --check`: exit 0, empty output.
- Receipt suite after canonical serialization: 33 pass, 0 fail, 71 assertions.
- Migration-down suite after updating ascending inventories: 20 pass, 0 fail, 174 assertions.
- CLI suite before the final injected-write case: 16 pass across the full run and its read-only filesystem follow-up. Injected-write case: 1 pass, 0 fail, 3 assertions; writable substitution watched fail.

The final affected-file regression uses explicit `./...test.ts` paths and a 30-second test timeout; its argv and completion output are retained in `/tmp/blockage-affected-final-command.json`, `/tmp/blockage-affected-final.log`, and `/tmp/blockage-affected-final-exit.json`. It exited 0:

```text
654 pass
0 fail
2298 expect() calls
Ran 654 tests across 35 files. [421.45s]
```

All changed TypeScript/Markdown/YAML files passed `bunx prettier --check` (exit 0). This is a scoped format check; full Nx `format:check --all` remains unrun.

An earlier non-`./` directory-filter attempt also collected emitted `dist/out-tsc` tests during concurrent compilation and is invalid evidence: 1556 pass, 311 fail, 87 errors across 232 files. A later interrupted background run was superseded by the explicit-file run. The sandbox denied child stdin writes in the existing browser-auth concurrency test (`EPERM`); a permitted focused escalation reran that case successfully (1 pass, 0 fail). The final affected run uses the same permitted escalation.

The full `h2puni-gate.sh <sha>` gate, full Nx format/test/lint/typecheck/build, image build, Docker deployment, Kubernetes conformance and production activation were not run. They remain required before claiming the complete change ready. This report grants no activation authority.

## 6. Implementation Signal

Base: `5c228a6a70b43faf225a0a49e5a511266f5dc058`. Isolated clone: `/tmp/puni-step-blockage-activation-sol`; the shared checkout was untouched. The final immutable commit is supplied in the agent handoff. No TEST-AXES identifiers were allocated.

## Decision

The image-local prerequisite is reviewable. The full change is incomplete; retain tasks 2.2–2.3 and obtain Astra review before any integration, push, release or activation.

## 7. Astra Review Correction: Empty Receipt Schema

Review of `6093b326c73e5218fe511089b9e1bce9d08576f7` found that an intact ledger and empty replacement receipt table could pass inspection and activation without the table's constraints. The initial production-path regression reproduced 11 failures: ten malformed table/view definitions and image-local inspection. Independent direct activation and image-local activation cases were then added so an inspection assertion cannot mask activation behavior.

Inspection now reads the physical table definition from `sqlite_master` before reading receipts or accepting DISABLED. It requires the migration's exact table definition with whitespace normalized, including INTEGER primary key, both NOT NULL constraints, the id=1 check and json_valid check. Missing, altered, unconstrained and view-substituted schemas refuse. The migration SQL and checksums were preserved.

| Check                                                  | Fault injected                                                                  | Production-path observation                                                                         | Result                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Exact constrained receipt table before empty authority | Removed the new schema validation after installing malformed empty tables/views | Ten schema variants, independent direct activation, and separate image-local inspect/activate cases | All 13 negatives failed with the check removed; guard restored before regression checks |

The earlier row-count/id/type mutation record describes the original `6093b326` implementation. Its deliberately unconstrained row fixtures now refuse at the schema boundary before row validation; their expected diagnostic was updated accordingly. Existing row guards remain in place.

Fresh typecheck, ESLint, migration lint and OpenSpec validation each exited 0. The full affected-file regression exited 0:

```text
667 pass
0 fail
2358 expect() calls
Ran 667 tests across 35 files. [303.07s]
```

Scoped formatting of every changed file passed (exit 0). Exact regression argv, output and exit status are retained at `/tmp/blockage-schema-affected-command.json`, `/tmp/blockage-schema-affected.log` and `/tmp/blockage-schema-affected-exit.json`. Static exits are `[0,0,0,0]` in `/tmp/blockage-schema-static-exit.json`. The full h2puni gate and image build remain unrun. Host/Kubernetes activation remains unimplemented and no production activation or push occurred.

## 8. Preserve-only Deployment Admission

Base: reviewed disabled prerequisite `3535ecc83960b47638b68a799ca04c64fa6c6e54` (#486). Isolated clone: `/tmp/step-blockage-preserve`; shared checkout untouched. Task 2.1 is implemented; tasks 2.2–2.3 remain unchecked. No activation flag/coordinator, live writer enable, host deployment, image publication, push, PR or canonical host gate ran. Migration execution in this packet was confined to disposable test fixtures; no migration SQL changed.

The backend image explicitly advertises `step_blockage_activation_v1` in its existing capability CLI. Both generated transport commands embed one coordinator-owned SQLite authority inspector. ENABLED with an exact validated receipt contributes one compatibility obligation even with no facts or journal. Kubernetes seals that inventory with independent exact candidate/previous image observations. Compose's existing stopped-writer recovery proof independently observes both exact image CLIs when the activation obligation exists. Missing/invalid CLI output still refuses through those existing transport boundaries; duplicate and empty capability entries now refuse Compose parsing too.

Coherent pre-marker authority is positively classified using a physical, readable migration ledger plus absence of both activation migration records, every marker/receipt schema object and all three admission trigger remnants. Pre-receipt DISABLED is accepted without writes. This classification changes neither runtime boot nor receipt CLI inspection. It never skips the separate fact or journal inventories. Kubernetes first-start retains its DISABLED guard. Successful DISABLED deployment alone is not positive capability evidence for a later activation; the remaining attended coordinator must independently prove the routed and rollback digests.

### Fresh checks

`BUN_TMPDIR=/tmp/step-preserve-bun-tmp bun install --frozen-lockfile` exited 0: 1573 installs across 1447 packages checked. Initial iteration used a shared dependency symlink; it was replaced by this clone's frozen dependencies before repeating all mutation proofs and final checks.

| Command scope                                                                                                                      | Fresh result                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Six admission suites: activation-admission, replay-capability, replay-coordinator, cutover-replay, swap, swap-writer-barrier       | 405 pass, 0 fail, 1825 assertions                                           |
| Docker `step blockage replay compatibility probes` subset                                                                          | 13 pass, 0 fail, 40 assertions                                              |
| Kubernetes execute-adapter and first-start, first-start-adapter, first-start-startup                                               | 235 pass, 0 fail, 425 assertions                                            |
| `bunx tsc --build --force` separately for tool-remote-scripts, tool-deploy and wbs-be-01 tsconfigs                                 | Each exit 0                                                                 |
| Fresh Nx graph then ESLint on every changed TypeScript file                                                                        | Each exit 0                                                                 |
| `bun build tools/tool-remote-scripts/src/swap.ts --target=bun --outfile=/tmp/step-preserve-swap.js`                                | Exit 0, 110 modules bundled                                                 |
| Bundled recovery smoke against disposable real migrated ENABLED-empty SQLite, executing generated commands through the Docker seam | Exit 0; candidate, rollback and activation inventory independently observed |
| `shellcheck -s bash bin/assert-no-prod-release.sh`                                                                                 | Exit 0                                                                      |
| OpenSpec 1.12.0 `validate --all --json`                                                                                            | Exit 0                                                                      |

Exact regression argv and exit codes are in `/tmp/step-preserve-tests.json`; outputs are `/tmp/step-preserve-{focused,docker-replay,k8s-adapter-first-start}-final.log`. Static argv/exits are in `/tmp/step-preserve-static.json`, with individual output files under `/tmp/step-preserve-*-final.log`. The bundle smoke is `/tmp/step-preserve-bundle-smoke.ts` and its `.log`. Changed-file formatting and commit-hook results are recorded in the implementation handoff.

### Watched production negatives

Both actual generated transport commands initially returned an empty array for ENABLED-empty; their new tests failed before inventory implementation. The new explicit capability advertisement, Kubernetes receipt/cutover allowlists and Compose candidate comparison also had watched RED cases. The table below records 35 additional injected production faults. Every mutation caused the named negative to fail, and every source was restored before regression/static checks.

| Guard                                          | Injected fault and observed negative                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Physical ledger and ledger rows                | Removed physical-table refusal and malformed-row refusal separately; substituted ledger view and null-name ledger negatives failed in both transports                                                                                                                                                   |
| Pre-marker schema absence                      | Removed schema-object predicate; marker/receipt tables and views plus each orphan admission trigger were admitted; 14 negatives failed                                                                                                                                                                  |
| Pre-marker receipt migration absence           | Removed receipt-ledger predicate; orphan receipt migration negative failed in both transports                                                                                                                                                                                                           |
| Marker migration count                         | Removed exact singleton ledger count; duplicate-ledger negatives failed                                                                                                                                                                                                                                 |
| Physical marker relation                       | Removed marker-table refusal; migrated marker view negatives failed                                                                                                                                                                                                                                     |
| Marker singleton, id and state                 | Removed count/id/state predicates separately; duplicate-marker, wrong-id and malformed-state negatives failed                                                                                                                                                                                           |
| Exact trigger bodies                           | Removed trigger-definition refusal; missing insert/update/delete and changed insert trigger negatives failed                                                                                                                                                                                            |
| Receipt schema and migration                   | Removed schema refusal and receipt-ledger predicate separately; weakened-schema and absent-receipt-ledger negatives failed                                                                                                                                                                              |
| Receipt state consistency                      | Removed DISABLED receipt exclusion and ENABLED exact-row refusal separately; retained-disabled-receipt and enabled-no-receipt negatives failed                                                                                                                                                          |
| Receipt field shape                            | Removed field-count predicate; unexpected-field negatives failed                                                                                                                                                                                                                                        |
| Receipt fields                                 | Removed protocol/version, activation/database identity type and emptiness, candidate/rollback digest and type, and time integer/bound guards separately; corresponding invalid-field negatives failed. The time type check was removed together with safe-integer validation for its string-valued case |
| Compose exact candidate and rollback admission | Removed candidate support comparison and rollback unsupported comparison separately; each enabled-empty image incompatibility negative failed                                                                                                                                                           |
| Compose capability shape                       | Removed duplicate and empty-entry checks separately; corresponding malformed capability negatives reached migration and failed                                                                                                                                                                          |
| Kubernetes exact image admission               | Removed image support membership; both enabled-empty candidate/previous incompatibility negatives failed                                                                                                                                                                                                |
| Both transport activation contributions        | Removed each activation contribution independently; that transport's ENABLED-empty inventory positive failed                                                                                                                                                                                            |

Authority mutation argv/exits and named failed tests are in `/tmp/step-preserve-mutations.json` (28 faults). Admission/transport mutations are in `/tmp/step-preserve-admission-mutations.json` (7 faults). Each has an individual `/tmp/step-preserve-mutation-<guard>.log`. Missing/unreadable databases, absent/malformed/unreadable ledger access, partial authority and real fresh/rollback predecessor controls are separate tests. SQLite stores its ledger in the same database file; the unreadable-ledger fixture denies that file. Diagnostic assertions inspect emitted error lines, excluding source excerpts, so an earlier unrelated failure cannot satisfy them.

The full h2puni gate, full Nx test/lint/typecheck/build/format gate, image build, Docker/Kubernetes conformance and live capability observations remain unrun. The fixture transport seam verifies generated commands and exact image arguments; it is not evidence about a deployed digest. Task 2.2 still owns durable host activation intent, exact fenced execution/readback and uncertainty barriers. Task 2.3 still owns the completed attended operator procedure. This packet grants no activation authority.

## 9. Independent Review Corrections

Astra rejected `13df409270cb4cbd26cfff0a3c2b7f827875ca93`: the standalone recovery proof handled two supplied images, but ordinary Compose passed the candidate for both; the new authority suite also assumed repository-root cwd. Section 8's tests established the helper boundaries, not correct ordinary caller integration or configured-cwd execution. This correction addresses both blockers and remains preserve-only. Tasks 2.2–2.3 stay open.

Ordinary preflight now captures the actual outgoing container's pinned `Config.Image` and immutable `Image` ID, verifies the pinned reference resolves to that ID, and persists the container/reference/image-ID association in the existing writer intent. After exact writer stop, deployment re-reads and compares that association before supplying the captured rollback digest and separate candidate digest to admission. Missing/malformed/mutable identity fails before stop; changed identity and incapable outgoing image retain stop intent and refuse before maintenance, migration and exposure.

A genuinely empty initial installation records null predecessor explicitly. Both preflight and read-only admission require no existing managed backend writer, preventing either colour or a late-arriving writer from being reclassified as no predecessor. The candidate must advertise `step_blockage_activation_v1` even while the database is DISABLED. ENABLED authority requires a rollback image. Coherent pre-marker/DISABLED first installs remain admitted. No candidate substitutes for a missing predecessor.

The authority test resolves backend and migration paths from `import.meta.dir`. Fresh configured-cwd reproduction in `/tmp/step-blockage-preserve/tools/tool-deploy` with `--preload ../test/scratch/preload.ts --timeout=10000` observed **107 fail, 0 pass** before the fix and **107 pass, 0 fail** after it. Logs: `/tmp/step-preserve-cwd-red.log` and `/tmp/step-preserve-cwd-green.log`.

### Fresh correction checks

- Configured remote-scripts cwd/preload: swap-writer-barrier, swap-maintenance.db, swap and writer-barrier suites: **217 pass, 0 fail, 1314 assertions**.
- Configured deploy cwd/preload: activation-admission, replay-capability, replay-coordinator and cutover-replay suites: **213 pass, 0 fail, 801 assertions**.
- `bunx tsc --build --force` separately for tool-remote-scripts and tool-deploy: each exit 0.
- Swap bundle build: exit 0.

Exact commands, working directories and exits are in `/tmp/step-preserve-correction-checks.json`; logs are `/tmp/step-preserve-{caller-configured,deploy-configured,type-remote,type-deploy,build-correction}-correction.log`. The authentic predecessor fixture now supplies real Docker image metadata and omits both later activation migrations before its preserved boot/migration exercise.

### New watched production negatives

| Boundary                             | Injected production fault and observation                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary rollback argument           | Candidate substituted for captured outgoing digest; incapable-outgoing ordinary execute negative failed                                            |
| Container observation shape          | Removed array and object guards separately; array-like output and null-container ordinary negatives failed                                         |
| Exact container identity             | Removed container-ID equality; wrong-container ordinary negative failed                                                                            |
| Runtime image identity               | Removed SHA-256 image-ID format check; mutually malformed container and image-inspect IDs were admitted and ordinary negative failed               |
| Pinned reference                     | Removed reference validation; mutable reference reached writer stop and its ordinary preflight negative failed                                     |
| Reference/image-ID association       | Removed pinned image-ID equality; wrong-pinned-id ordinary negative failed                                                                         |
| Post-stop readback                   | Removed re-observation, reference equality and image-ID equality separately; changed-reference and consistently re-bound image-ID negatives failed |
| Initial first-install classification | Removed empty-writer-inventory predicate; both-colour false-first-install negatives failed                                                         |
| Late first-install classification    | Removed admission's empty-writer-inventory predicate; late-writer ordinary negative reached maintenance and failed                                 |
| Null predecessor candidate           | Removed candidate capability comparison; incapable first candidate reached maintenance and negative failed                                         |
| Null predecessor authority           | Removed ENABLED refusal; ENABLED with no rollback reached maintenance and negative failed                                                          |

All **14 new faults** were observed through ordinary `execute`, with the configured remote-scripts cwd and scratch preload. Commands, exits and failing test names are in `/tmp/step-preserve-caller-mutations.json`; individual logs are `/tmp/step-preserve-caller-mutation-<guard>.log`. Sources were restored after every mutation. The original 35 inventory/admission faults were also repeated and detected on this correction, with their existing JSON/log paths updated.

Changed-file formatting/lint, OpenSpec validation and enabled commit hooks are recorded in the correction handoff. The full canonical h2puni gate, full Nx gates, Docker/Kubernetes conformance, deployed digest observation, push, PR, host deployment and activation remain unrun. Disposable fixture migrations are the only migration execution. Independent review of the final correction SHA remains required.

## 10. Complete Candidate Vocabulary Admission

Astra rejected `366e10b5d4ebe3fc7737c2a99890190d3e264f3e`: passing the actual outgoing digest correctly established rollback compatibility but displaced the candidate's complete pre-maintenance admission. A candidate lacking `move_progress_v1` could pass with a capable outgoing image and reach maintenance, migration and exposure. Section 9's image identity proof remained valid; its candidate coverage was insufficient outside activation obligations.

The read-only proof now unconditionally executes the exact candidate's own supported-values command for every entry in `STORED_VOCABULARIES`. A non-null outgoing digest receives its own independent observation for every entry. Each observation is compared against the same coordinator-owned database inventory before any maintenance phase. Candidate membership is no longer conditional on `step_blockage_activation_v1`. Null predecessor remains explicit, without a fabricated rollback observation; complete candidate admission and first-install constraints remain enforced.

The ordinary-execute matrix covers eleven obligations through all eight channels: FF relationships, on_hold holds, ready readiness, shared capacity, succeeded attempts, blocked facts, replace_blockage/move_progress_v1/delete_state_v1/step_blockage_activation_v1 semantics, and minute estimates. Each obligation has an incapable-candidate/capable-rollback negative, a capable-candidate/incapable-rollback negative, and a both-capable control. Negatives assert the correct image role and exact stored value/count and refuse before maintenance/migration/start. Controls reach start and prove independent capability command execution for both exact digests.

Before the fix the 33-case matrix observed **20 failures**: ten unsupported candidate obligations were admitted and ten controls lacked an independent candidate observation. After the fix all **33 cases passed**. Logs: `/tmp/step-preserve-vocabulary-red.log` and `/tmp/step-preserve-vocabulary-green.log`.

Four production faults were watched through this ordinary-execute matrix, with sources restored after every run:

| Fault                                                          | Observed failures                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Removed complete candidate membership comparison               | All 11 incapable-candidate negatives failed after deployment reached maintenance        |
| Removed complete rollback membership comparison                | All 11 incapable-rollback negatives failed after deployment reached maintenance         |
| Substituted rollback CLI observation for candidate observation | All 11 incapable-candidate negatives and all 11 independent-observation controls failed |
| Substituted candidate CLI observation for rollback observation | All 33 asymmetric/control cases failed                                                  |

Commands, exact failing names and exits are in `/tmp/step-preserve-vocabulary-mutations.json`; individual outputs are `/tmp/step-preserve-vocabulary-mutation-<fault>.log`. This corrects the ordinary caller without changing image capture, writer fencing, additive migrations, activation defaults or Kubernetes admission. Tasks 2.2–2.3 remain open; no host action or activation occurred. Final configured regression/static/hook results are recorded in the handoff, and independent review of the final correction SHA remains required.

### Final configured checks for section 10

- Configured remote-scripts cwd/preload, four focused suites: **250 pass, 0 fail, 2774 assertions**.
- Configured deploy cwd/preload, four focused suites: **213 pass, 0 fail, 801 assertions**.
- `bunx tsc --build --force tools/tool-remote-scripts/tsconfig.json` and the corresponding `tool-deploy` build: both exit 0.
- `bun build tools/tool-remote-scripts/src/swap.ts --target=bun --outfile=/tmp/step-preserve-swap.js`: exit 0.

Exact argv, working directories and exits are in `/tmp/step-preserve-correction-checks.json`; the configured test logs are `/tmp/step-preserve-caller-configured-correction.log` and `/tmp/step-preserve-deploy-configured-correction.log`. These are bounded checks. The full canonical host gate and live image/deployment observations remain unrun.

Changed-file Prettier and ESLint, `git diff --check`, and `openspec validate --all --json` exited 0. The rebuilt swap bundle passed the disposable ENABLED-empty admission smoke (separate candidate/rollback capability and activation inventory observations; no Docker or live database). Logs: `/tmp/step-preserve-openspec-vocabulary.log` and `/tmp/step-preserve-bundle-correction.log`. Enabled commit hooks are recorded in the handoff; independent final-SHA review and the canonical gate remain outstanding.

## 11. Host Gate Test Isolation Repair (#488)

Base: `f7f982cae8c633779f10f4f786da389dc1138be8`, isolated clone
`/tmp/puni-488-dbpath-sol`. Only the missing-`DB_PATH` test subprocess now runs
from its fresh fixture directory. Bun otherwise reloads an app-local `.env` after
the test removes the inherited variable. Production CLI guards are unchanged.

- Reproduction: added only an untracked app `.env` with a dummy `DB_PATH` pointing
  to a nonexistent database. From `apps/wbs/be-01`,
  `bun test ./src/step-blockage-activation-cli.db.test.ts --timeout=30000`
  exited 1: **18 pass, 1 fail, 59 assertions**. The missing-path negative received
  `SQLITE_CANTOPEN` instead of `DB_PATH must be set`
  (`/tmp/puni-488-dbpath-red.log`).
- With the fixture working directory and that same `.env` still present, the
  same test command filtered by `-t 'refuses absent and empty DB_PATH'` exited 0:
  **1 pass, 0 fail, 4 assertions** (`/tmp/puni-488-dbpath-env-green.log`).
- Production-path proof: temporarily removed the existing CLI `DB_PATH` guard.
  The repaired filtered negative exited 1: **0 pass, 1 fail, 2 assertions**,
  receiving the anonymous read-only SQLite refusal instead of the named guard
  error (`/tmp/puni-488-dbpath-guard-red.log`). Restored the production source
  byte-for-byte and removed the dummy `.env` before final checks. The existing
  adjacent production `Proof:` comment records this same guard-removal fault.
- Final clean focused suite, same unfiltered command: exit 0, **19 pass, 0 fail,
  61 assertions** (`/tmp/puni-488-dbpath-clean-green.log`).
- `BUN_TMPDIR=/tmp bun install --frozen-lockfile`: exit 0, 1573 installs checked.
  The initial invocation without `BUN_TMPDIR` refused its read-only temporary
  directory; the explicit writable temporary directory resolved that boundary.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false BUN_TMPDIR=/tmp bunx tsc --build
apps/wbs/be-01/tsconfig.json`: exit 0.
- Changed-test ESLint: exit 0 with no warnings after Nx project graph generation
  (`/tmp/puni-488-dbpath-scoped-lint.log`). The earlier direct ESLint invocation
  warned that module-boundary checking was skipped without a cached graph;
  this clean rerun supersedes that incomplete check.
- Changed-test/report `bunx prettier --check` and `git diff --check`: exit 0.
- `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate --all --json`:
  exit 0, **210 passed, 0 failed** (`/tmp/puni-488-dbpath-openspec.json`).

`NX_DAEMON=false NX_ISOLATE_PLUGINS=false BUN_TMPDIR=/tmp bunx nx run wbs-be-01:lint --skip-nx-cache` also exited 0; backend lint passed with caching disabled (`/tmp/puni-488-dbpath-lint.log`).

Full host gate, full workspace format/test/lint/typecheck/build, image builds,
release operations and production activation were not run in this repair slice.
The exact committed repair requires Astra review and the canonical host gate.

## 12. Hosted Colored Diagnostic Repair (#491)

The hosted `fleet-check` for #491 reported **733 pass, 94 fail** in `tool-deploy:test`; the failing authority negatives received an empty string from `diagnostics()`. The configured Nx target already supplies the scratch preload and `tools/tool-deploy` cwd. The cause was ANSI formatting inherited through `FORCE_COLOR`, not missing preload or a production admission failure.

A disposable real Kubernetes inventory command with missing-marker authority and `FORCE_COLOR=1` exited **1**, with no signal, no spawn error and empty stdout. Raw stderr contained ANSI formatting and the actual `invalid step blockage activation marker` error. The old anchored parser returned empty; removing terminal control formatting returned the exact named error. Safe raw capture: `/tmp/step-color-child.json`.

Only the test diagnostic parser now strips terminal control sequences with Node's `stripVTControlCharacters` before applying the existing anchored error-line filter. Source excerpts and stack lines remain excluded. Inventory children explicitly use `FORCE_COLOR=1`, so the normal target exercises the hosted formatting boundary regardless of the runner environment. A focused parser test also checks colored Error/SQLiteError lines and exclusion of source-only witnesses. Production admission and runtime code remain byte-identical to the approved integration.

- Before the fix, the real `Kubernetes refuses broken authority: missing-marker` negative with `FORCE_COLOR=1` failed: **0 pass, 1 fail**, expected named marker diagnostic, received empty. After the fix: **1 pass, 0 fail**. Logs: `/tmp/step-color-red.log`, `/tmp/step-color-green.log`.
- Watched production-path proof: temporarily removed the production marker refusal from `step-blockage-inventory.ts`. Both colored Compose and Kubernetes missing-marker negatives failed their exact diagnostic assertions: **0 pass, 2 fail**. Restored the production file byte-for-byte before subsequent checks. Logs and argv: `/tmp/step-color-marker-mutation.log`, `/tmp/step-color-marker-mutation.json`.

The reviewed restack is `7897a27cf3fa5c7f461db70f09662377755c6182`, with parents repaired #488 `fca16386e8c993c35f169ebf57d07b04da0170a9` and reviewed Step `580b9e65d6fa2149575e19553f909b768235702d`, tree `c866fc824bba506861c55a96d331841642e854c1`. Its sole conflict was this report: all Step evidence was retained verbatim, followed by the complete #488 DB_PATH evidence under renumbered section 11. Every other source blob, mode and deletion matched its reviewed parent. Restack checks passed 250 configured remote tests, 213 configured deploy tests, 3 Docker Step compatibility tests and all 19 CLI tests with a dummy app `.env`, plus scoped typechecks/build, OpenSpec 210/210, formatting, graph-backed lint and normal commit hooks. Evidence: `/tmp/step-restack-preservation.json`, `/tmp/step-restack-checks.json`, `/tmp/step-restack-lint-graph.log`, `/tmp/step-restack-commit.log`.

Final colored Nx target and scoped repair checks are recorded in the handoff. Full canonical host gate, push, PR update, deployment and activation remain unrun; tasks 2.2–2.3 remain open.

The first exact colored Nx run inside the restricted sandbox passed all 108 activation cases and 816 tests overall, but exited 1 with 10 failures/1 error because existing registry, Git HTTP and backup fixtures could not `listen` (`EPERM`). This did not establish full-target success. The same command was rerun with approved local test-server listening permission; output is `/tmp/step-color-nx-deploy-unsandboxed.log`. Restricted-run output: `/tmp/step-color-nx-deploy.log`.

The approved listener-enabled rerun of `NX_DAEMON=false NX_ISOLATE_PLUGINS=false BUN_TMPDIR=/tmp FORCE_COLOR=1 bunx nx run tool-deploy:test --skip-nx-cache` exited **0**: **828 pass, 0 fail, 2255 assertions across 32 files** (79.92 seconds), including all 108 activation cases. The target used its configured cwd, preload and 10-second default without changes. Scoped `tool-deploy` TypeScript build, graph-backed changed-test ESLint and OpenSpec validation also exited 0 (210/210 artifacts); argv/exits are `/tmp/step-color-scoped-checks.json`. Changed-file formatting/diff checks and enabled commit hooks are recorded in the final handoff. No production file differs from pure restack `7897a27c`.

## 13. Attended Compose Activation (local implementation)

Base: published accepted `7b9b414b9ceca73cc934ad92dd874803eb0658a0`. Isolated clone: `/tmp/puni-step-activation-compose-sol-oct16`; root checkout and aggregate source clone were not edited. Tasks 2.2–2.3 are implemented. Dependencies were reused read-only through the accepted aggregate clone's `node_modules` symlink; this worker did not install or mutate shared dependencies. No host-wide gate, live Docker/Kubernetes operation, image publication, push, PR, deployment, WBS write or activation ran.

The explicit `--activate-step-blockage` flag admits only a backend-only `--execute` invocation. Ordinary deployment preserves authority. The existing single deployment lock covers the transition. Before maintenance or intent, stopped-writer admission separately observes both exact images' activation capability and requires the candidate's strict receipt inspection to find the already installed DISABLED receipt authority. This prevents first-install activation and installing the receipt migration for the first time in the same activation release. The outgoing image/container association and all existing vocabulary checks remain required.

After backup/migration, activation uses the validated inert maintenance container and repeats maintenance, stopped outgoing writer, rollback-image, canonical database and full writer-inventory proofs. The coordinator exclusively publishes and syncs `be-writer-activation.json`, reads exact intent bytes, transfers the exact receipt to the image, executes activation, then independently inspects committed authority. Both response envelopes must equal `{state:"ENABLED",receipt:<exact attempt>}`. Only then may the existing maintenance-stop and application-exposure steps proceed. The activation marker blocks ordinary retry independently of other markers, and is removed only with the existing barriers after deployment commit.

Preparation and activation each use an absolute 60-second operational budget. Every capability/inspection, fence, intent publication/readback, transfer, activate and committed readback shares its phase deadline. The maintenance fence forwards abort into its captured production Docker runner; stopped-writer/image/inventory calls inherit the fence signal/deadline, while the whole fence race covers mount and namespace stalls. Docker-client termination cannot prove daemon-side execution stopped. Timeout or late publication leaves existing barrier evidence, never advances the sequence and never authorizes exposure, rollback or retry. Representative-host evidence for the chosen budget remains outstanding; these are phase budgets, not a whole-deployment SLA.

### Fresh checks

| Scope                               | Command and observed outcome                                                                                                                                                                                                                                                                                                                                                          | Maximum RSS (KiB)       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Seven remote suites                 | From `tools/tool-remote-scripts`: `bun test ./src/swap.test.ts ./src/swap-writer-barrier.test.ts ./src/swap-maintenance.db.test.ts ./src/swap-migration.db.test.ts ./src/lib/writer-barrier.test.ts ./src/lib/step-blockage-activation.test.ts ./src/lib/docker-deadline.test.ts --preload ../test/scratch/preload.ts --timeout=10000`: **318 pass, 0 fail**, 4117 assertions, 25.12s | 579704                  |
| Kubernetes first-start preservation | From `tools/tool-deploy`: `bun test ./src/k8s/first-start.test.ts ./src/k8s/first-start-adapter.test.ts ./src/k8s/first-start-startup.test.ts --preload ../test/scratch/preload.ts --timeout=10000`: **178 pass, 0 fail**, 289 assertions                                                                                                                                             | 565736                  |
| Real protocol                       | Disposable real SQLite, actual generated receipt transfer and actual image-local capability/activation/inspect CLIs: **33 pass, 0 fail** in the coordinator suite after response-envelope repair                                                                                                                                                                                      | 510312                  |
| Final strengthened proofs           | Late publication awaits actual write completion; prepared maintenance observes forwarded abort: **2 pass, 0 fail**, 6 assertions                                                                                                                                                                                                                                                      | Not separately measured |
| Scoped typecheck                    | `bunx --no-install tsc --build tools/tool-remote-scripts/tsconfig.json`: exit 0                                                                                                                                                                                                                                                                                                       | 243684                  |
| Graph-backed changed-file lint      | Fresh `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx --no-install nx graph --file=/tmp/step-activation-graph.json`, then `bunx --no-install eslint` on all five changed TypeScript files: exit 0, no warnings                                                                                                                                                                         | 682592                  |
| Scoped bundle                       | `bun build tools/tool-remote-scripts/src/swap.ts --target=bun --outfile=/tmp/step-activation-swap.js`: exit 0 on the final source                                                                                                                                                                                                                                                     | 35108                   |

Exact command outputs, exit statuses and RSS are `/tmp/step-activation-final-regression.log`, `/tmp/step-activation-k8s-first-start.log`, `/tmp/step-activation-real-cli-{red,green}.log`, `/tmp/step-activation-late-signal-final.log`, `/tmp/step-activation-final-{typecheck,lint}.log`, `/tmp/step-activation-graph.log` and `/tmp/step-activation-build.log`. Changed-file formatting, `git diff --check`, OpenSpec validation, final bundle and normal commit-hook evidence are recorded in the handoff after this report is written.

### Watched production failures

The initial real execute-prefix test failed because the old path exposed the application without activation. The initial coordinator module was absent. The real SQLite/CLI integration then caught that activate returns an ENABLED/receipt envelope rather than a bare receipt; it failed with `activation receipt differs` before repair. Fakes were corrected to the actual protocol. Six stalled production-caller cases initially timed out before deadline implementation. The later eight-case deadline-omission mutation also timed out on every stalled caller; sources were restored before regression checks.

| Production check                                                                                | Injected fault / named observation                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rollback predecessor and canonical database authority                                           | Removed each guard independently; first-install named refusal and missing-canonical-identity negatives failed                                                                              |
| Independent exact image capability and shape                                                    | Removed capability validation; candidate/rollback-incapable and numeric/object/empty/duplicate capability negatives failed before intent                                                   |
| Previously deployed DISABLED receipt boundary                                                   | Removed strict pre-maintenance inspection equality; enabled/malformed authority preparation negatives failed                                                                               |
| Durable exact intent publication and readback                                                   | Omitted publication, then omitted byte equality independently; durable-intent positive and corrupt-publication dependency negative failed                                                  |
| Image activation response                                                                       | Removed exact ENABLED/receipt envelope comparison; mismatched activation response was accepted and negative failed                                                                         |
| Independent committed inspection                                                                | Removed exact ENABLED/receipt comparison; disabled/mismatched readback negatives completed and failed                                                                                      |
| Fences before execution/readback                                                                | Removed repeated fences; identity-fault negative completed instead of retaining uncertainty                                                                                                |
| Maintenance, stopped outgoing writer, rollback image, canonical file, complete writer inventory | Removed each fence proof independently; each named drift negative lost its refusal                                                                                                         |
| Captured maintenance Docker signal                                                              | Omitted forwarding the abort signal in real `prepareBackend` verification; aborted-maintenance observation returned success                                                                |
| Absolute preparation/activation budgets                                                         | Replaced production deadline racing with an unbounded runner; all eight capability/inspect/activate/readback/maintenance/stopped-writer/mount/namespace stalled-caller negatives timed out |
| Activation retry barrier                                                                        | Omitted activation from the boundary registry; an isolated activation intent admitted ordinary retry                                                                                       |
| Commit-only activation cleanup                                                                  | Omitted activation cleanup; successful committed activation retained its barrier                                                                                                           |
| Explicit CLI and backend-only authority                                                         | Removed each invocation/tier guard; five incompatible command cases and non-backend plan lost their named refusals                                                                         |

Eighteen original guard injections are recorded in `/tmp/step-activation-mutations.json` and individual mutation logs. Additional tier, maintenance-signal and deadline injections are `/tmp/step-activation-mutation-{plan-tier,maintenance-signal,total-budget}.log` (**21 independent production fault injections total**). Adjacent `Proof:` comments name the observations. The filesystem tests separately cover absent intent and a publication dependency refusing unreadable state; a corrupt intent has its own exact-byte refusal. Late publication is awaited deterministically and preserves its marker without executing another command.

### Remaining acceptance

Exact committed review and the canonical `bin/h2puni-gate.sh <sha>` remain required before claiming host acceptance. The full workspace gate, real Docker/Compose/Kubernetes conformance, representative-host timing, live preserve-only rollout and attended activation were not run. Kubernetes source was unchanged and its strict first-start DISABLED negatives passed. Main-spec synchronization/archive remain pending. The operator must review the completed runbook and perform the two distinct windows; this local implementation does not authorize live activation.

## Composed receipt rollback boundary (2026-10-17)

The five receipt rollback cases originally compared the entire pre-call migration
ledger. Adding the newer sparse Step migration exposed that this expectation
asserted whole-selection atomicity. The existing
[recovery contract](../restore-applied-migration-set/specs/applied-migration-set-rollback/spec.md#requirement-recovery-preserves-script-integrity-and-resumability)
commits each successful down script with its ledger deletion and permits retry
after partial rollback. The receipt requirement protects the refused receipt
migration's schema and ledger; it does not undo an earlier committed reversal.
No production runner, migration SQL or contract changed.

At unchanged `796e279`, all five original assertions failed solely because the
newer successful sparse migration's row was absent. The corrected composed cases
compare the actual ledger directly with the exact captured ledger minus only that
known newer row. They assert its table is gone, preserve the receipt and marker
schema and rows exactly, and repeat the request to prove the same refusal and
state on retry. They neither filter the actual ledger nor weaken it to membership.

Independent production-path omissions skipped the newer migration's ledger
deletion and its table drop. Each made all five corrected cases fail at the
intended exact assertion. The runner and SQL were restored byte-for-byte before
the receipt, activation, migration-down and Step-parallel suites passed 120 tests
across four files. Adjacent Proof comments name the two observed omissions.

Exact commands, source identities, resource limits and raw/compressed receipts
are retained in `evidence/rollback-boundary-2026-10-17/manifest.json`. The initial
900 MiB scoped typecheck was resource-killed before diagnostics and is disqualified.
Normal hook and containing-commit receipts are delivered externally after review.
Full host gate, broad workspace suites and deployment acceptance are not claimed
by these bounded local checks.
