# Verification Report

**Change:** `activate-step-blockage-writers`
**Verified at:** `2026-10-15 17:35 UTC`
**Status:** Image-local prerequisite only; overall change incomplete and blocked from archive/release activation.

## 1. Structural Validation

`bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json` exited 0:

```json
{ "items": 205, "passed": 205, "failed": 0 }
```

## 2. Task Completion

Tasks 1.1–1.4 are implemented. Tasks 2.1–2.3 remain unchecked and block activation and archive: independent enabled-empty capability inventories, candidate/rollback admission, explicit Compose activation/inspect orchestration, durable intent and uncertainty barriers, and Kubernetes admission while retaining first-start DISABLED.

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

The image-local prerequisite is reviewable. The full change is incomplete; retain tasks 2.1–2.3 and obtain Astra review before any integration, push, release or activation.

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

## 8. Host Gate Test Isolation Repair (#488)

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
