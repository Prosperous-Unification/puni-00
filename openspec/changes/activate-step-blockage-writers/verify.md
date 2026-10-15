# Verification Report

**Change:** `activate-step-blockage-writers`
**Verified at:** `2026-10-15 18:28 UTC`
**Status:** Image-local prerequisite and preserve-only deployment admission implemented; attended activation remains incomplete and blocked from archive/release activation.

## 1. Structural Validation

`bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json` exited 0:

```json
{ "items": 205, "passed": 205, "failed": 0 }
```

## 2. Task Completion

Tasks 1.1–1.4 and 2.1 are implemented. The preserve-only admission evidence is in section 8. Tasks 2.2–2.3 remain unchecked and block activation and archive: explicit Compose activation/inspect orchestration, durable intent and uncertainty barriers, and the complete attended operator procedure. Kubernetes first-start still requires DISABLED.

The runbook documents the two-stage prerequisite and identifies the missing host operation explicitly. No production activation, deployment, push or PR occurred.

## 3. Delta Spec Sync

`step-blockage-writer-activation`: pending; this change remains active. The explicit fenced deployment requirement is not implemented by this prerequisite.

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
