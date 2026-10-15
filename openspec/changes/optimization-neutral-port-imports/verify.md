# Verification Report

**Change**: `optimization-neutral-port-imports`

**Verified at**: 2026-10-15

**Verifier**: implementation worker, isolated `/tmp/puni-k6-packet1`

## Scope and completeness

The parent authorized the exact neutral-port packet. Existing glossary terms suffice; no new term or ADR was needed. `design.md` is deliberately omitted because this is a reversible import and type placement change with no runtime shape change. Implementation preserves the recorder's old type exports, the adapter's old event-log type exports, and every recorder call and transaction/delivery body.

The initial direct-core-import correction reduced K6 from 77 to 68. Production evidence exposed a second forwarding route through the SQLite barrel and the event-log adapter's core-barrel type re-export. Narrowing those existing imports and the compatible adapter type re-export reached 12. Inventory and rule algorithms are unchanged.

## Production graph

Executable: `/tmp/burokrat-entrypoint-exact-consumer/node_modules/.bin/twib`; package version `0.1.0`, source revision `ac774f0c358db369c2048e537151e263cc29361e`, toolkit identity `db3dcf59b03555b34b0219b400c9a0ce077df031aa550eb2c1f2f03eae494a79`.

Policy: `/tmp/binary-assets-successor-policy.json`, SHA-256 `052a3aa30b1ae091968cf01318c7ad89a32e4e3dc144479e73d0c6da0ae965de`.

Baseline command:

```sh
/tmp/burokrat-entrypoint-exact-consumer/node_modules/.bin/twib check committed /tmp/puni-k6-packet1 5c228a6a70b43faf225a0a49e5a511266f5dc058 /tmp/binary-assets-successor-policy.json --rule K6
```

Updated and fault commands replace `committed` with `working`, using the same repository, base, policy, and installed executable. All graph invocations ran serially. Baseline: 77 findings; initial correction: 68; final source: 12. Each returned `unevaluated: []`. The observe policy returns `allowed: true`, `certifies: false`, and exit 0 even with findings; the assertion inspects actual findings instead of treating exit status as proof.

The final assertion requires exactly 12 findings, no coordinator findings, and exactly seven optimization owner findings all targeting `libs/wbs/application/core/src/service/committed-fanout.ts`. The other five findings remain in imported-plan (2), project-rank (1), and space (2).

```text
K6 boundary assertion passed: seven runtime recorder edges and five unrelated sibling edges
```

## Failure proofs

No production safety check was added or changed. These production-path negatives prove the import boundary assertion is breakable. The assertion first failed against the fresh committed baseline: `expected 12 retained findings, got 77`.

| Boundary                  | Injected fault                                                            | Production observation                        | Assertion                           |
| ------------------------- | ------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------- |
| Initial reservation owner | Restore only UnitOfWork's broad `@wbs/core` import                        | 20 K6 findings, no unevaluated rules; 218.85s | Failed, exit 1: expected 12, got 20 |
| Optimized reader          | Restore only the broad `@wbs/core` type re-export, keeping imports narrow | 20 K6 findings, no unevaluated rules; 207.96s | Failed, exit 1: expected 12, got 20 |
| Coordinator               | Restore CommittedProjectEvent's feature recorder import                   | 13 K6 findings, no unevaluated rules; 226.37s | Failed, exit 1: expected 12, got 13 |

Each mutation was restored in `finally`, with SHA-256 equality checked against the original file bytes. Raw local evidence is `/tmp/k6-packet1-{baseline,green,green2,owner-barrel,reader-reexport,coordinator-type}.json` and `/tmp/k6-packet1-fault-proofs.json`. Proof: changing any of these three imports back independently was observed to fail the same final graph assertion against the installed production evaluator.

## Focused checks

- Frozen dependency installation: Bun checked 1573 installs across 1447 packages, exit 0.
- `NX_DAEMON=false bunx nx graph --file=/tmp/k6-packet1-nx-graph.json`: exit 0, JSON graph created. Initial ESLint runs warned that the Nx project graph was absent; final targeted ESLint after graph creation exited 0 with empty output and no skipped boundary warning.
- Targeted ESLint covered all 13 changed TypeScript files.
- Targeted Prettier checked all 13 changed TypeScript files and the change artifacts: `Checking formatting... All matched files use Prettier code style!`, exit 0.
- `bunx tsc --build --force apps/wbs/be-01/tsconfig.json libs/wbs/application/core/tsconfig.json libs/wbs/adapters/store-sqlite/tsconfig.json`: exit 0, empty output. Existing callers still import the old recorder types, so these builds also check type export compatibility.
- `bun tools/tool-devsync/src/typecheck-modules.ts apps/wbs/be-01/src/module`: exit 0; optimization, solver-launcher, and solver-supervisor checked.
- `bun tools/tool-devsync/src/typecheck-modules.ts libs/wbs/application/core/src/module`: exit 0, all core modules checked.
- Final runtime command: `bun test --preload ./tools/test/scratch/preload.ts libs/wbs/application/core/src/service/committed-fanout.test.ts apps/wbs/be-01/src/module/optimization/optimized-schedule-reader.test.ts apps/wbs/be-01/src/service/optimization-coordinator.db.test.ts apps/wbs/be-01/src/service/optimization-events.db.test.ts apps/wbs/be-01/src/service/optimization-coordinator.model.db.test.ts --timeout=60000`: exit 0.

```text
94 pass
0 fail
27661 expect() calls
Ran 94 tests across 5 files. [95.09s]
```

All three ordered task slices are complete. The spec's neutral boundary requirement is proved by installed production graph observations; its compatibility requirement is covered by unchanged old type imports and the runtime suites. No design artifact requires reconciliation.

- Installed OpenSpec `validate --all --json`: 205 entries passed, zero failures (187 changes and 18 specs). Delta spec sync is pending; no archive was requested.

## Full gate and integration limits

`bin/h2puni-gate.sh`, full `bunx nx run-many -t test lint typecheck build`, full `bunx nx format:check --all`, browser checks, push, PR, archive, and deployment were not run: this bounded worker packet explicitly reserves host gate and integration for the parent. Targeted checks do not claim a full gate pass. No tests or production bodies were modified.

Base commit: `5c228a6a70b43faf225a0a49e5a511266f5dc058`. This report is committed with the implementation; final worker commit SHA is supplied in the handoff.
