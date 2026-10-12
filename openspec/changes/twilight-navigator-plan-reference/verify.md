# Verification

Observed on 2026-10-11 in `/home/df/wd/puni/b10-navigator` (local workstation, uid 1000, load
average 13–28 from parallel lanes). Bun tests ran with `CLAUDECODE` and
`CLAUDE_CODE_ENTRYPOINT` unset.

## Fixture

`apps/twilight-structure/twilight-navigator/cli/src/fixtures/plan-export.v6.json` was written by
WBS's own exporter: a throwaway script beside `libs/wbs/application/core` composed
`servicesOver(openMemorySource())` with a fixed clock (`2026-10-11T09:00:00.000Z`) and sequential
UUID-shaped ids, created a project (default steps `dev`, `qa`), a parent with two leaves, one
top-level leaf, three-point estimates, one FS typed dependency and one legacy dependency, and
called `PlanDocumentService.export`. The script was deleted; the file holds no real names.

## Checks

| Command                                                                                                                                   | Result                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bunx nx run-many -t test lint typecheck -p twilight-navigator --skip-nx-cache --output-style=static`                                     | Exit 0; `Successfully ran targets test, lint, typecheck`; 29 pass, 0 fail across 3 files.                                                                                                                                                                          |
| `bunx nx run-many -t test lint:source typecheck -p twilight-burokrat --skip-nx-cache --output-style=static`                               | `test`: 813 pass, 0 fail across 43 files (2093 s); `lint:source` green; `typecheck` failed on a Bun `toEqual` generic in `navigator-records.test.ts`, fixed in commit `968a6fadc`, after which `lint:source typecheck` reran uncached: `Successfully ran targets`. |
| `bun test --preload ../../../../tools/test/scratch/preload.ts --timeout=60000 src/contracts/` (Burokrat)                                  | 29 pass, 0 fail (before the final lint autofix of import order and arrow bodies; `navigator-records.test.ts` 8/8 and `canonical.test.ts` 6/6 after it).                                                                                                            |
| `bun test --timeout=120000 tools/tool-devsync/src/{eslint-boundaries,workspace-projects,namespace-layout,workspace-targets,sync}.test.ts` | 135 pass, 0 fail. One earlier run of the same five files failed only the new Navigator lint-boundary case; it passed in isolation and in three reruns.                                                                                                             |
| `bunx nx run-many -t lint typecheck -p tool-devsync --skip-nx-cache`                                                                      | `Successfully ran targets lint, typecheck`.                                                                                                                                                                                                                        |
| `bun run apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working <worktree> HEAD`                                  | Exit 0, empty stderr; Navigator files appear only as unindexed candidates (no `module-index` declared), as Dash's do.                                                                                                                                              |
| `bunx @fission-ai/openspec@1.12.0 validate twilight-navigator-plan-reference --strict --json`                                             | 1/1 passed.                                                                                                                                                                                                                                                        |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                  | 161/161 passed.                                                                                                                                                                                                                                                    |
| `bunx prettier --check` on every touched path                                                                                             | All matched files use Prettier code style.                                                                                                                                                                                                                         |

## CI correction

The first PR run (#325, `bcc90a4db`) failed `tool-devsync:test` on two cases the five oracle
files did not cover: `repo-namespacing-handoff.test.ts` refused the alias
`@twilight/burokrat-contracts` (`no product named twilight`: an alias scope must be a product),
and the README link check found `../twilight-burokrat/…` resolving under the Navigator
directory. The alias is now `@twilight-burokrat/contracts` and the link `../../twilight-burokrat/…`.
Afterwards `bunx nx run-many -t test lint typecheck -p tool-devsync twilight-navigator
--skip-nx-cache` exited 0: tool-devsync 395/395 across 28 files, Navigator 29/29.

## Fable review fixes (2026-10-11)

Renamed `handle` → `opened` and `item` → `workItem`. Navigator now pins
`NAVIGATOR_PLAN_DOCUMENT_VERSION = 6` instead of importing WBS's constant. ENOENT on an
exclusive create is refused as `output directory is missing: <dir>`. `RepositoryId` is
documented as caller-supplied; its shape is unchanged. Afterwards, uncached `twilight-navigator`
test, lint and typecheck exited 0 (31/31). Burokrat `src/contracts/` passed 30/30, with eslint
and tsc clean. OpenSpec passed 161/161 and Prettier was clean.

## R5 proofs

Each fault was injected alone, the named test watched failing, and the source restored before
the green run above. The adjacent `Proof:` comments name the same faults.

| Injected fault                                                                  | Observed failure                                                                                                |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `verifyDigest` comparison replaced by `false`                                   | `verifyDigest accepts the record it digested and refuses a tampered one`                                        |
| `onUndeclaredKey('reject')` dropped from `PlanReferenceRecord`                  | `refuses an undeclared key on either record and inside planRef`                                                 |
| same, from `ProgressReceiptRecord`                                              | same test, receipt case                                                                                         |
| plan reference digest narrow returns `true`                                     | `refuses a record whose embedded digest does not match`                                                         |
| receipt digest narrow returns `true`                                            | same test, receipt case                                                                                         |
| `atLeastLength(1)` dropped from receipt entries                                 | `refuses an empty entries list and an unknown status`                                                           |
| `plan-reference` removed from `RecordKind`                                      | `the kind set is exactly the documented list`, `the production validate command accepts both kinds`             |
| version check removed                                                           | `refuses a version-5 document before writing`                                                                   |
| exclusive `'wx'` replaced by `'w'`                                              | `refuses an existing output file and keeps its bytes`, `removes its own first file when the second is occupied` |
| missing collapsed into unreadable                                               | `refuses a missing export and names it, through the real entrypoint` and both missing-file dispatch cases       |
| partial-output removal dropped                                                  | `removes its own first file when the second is occupied`                                                        |
| requirements UTF-8/empty decode removed                                         | `refuses a missing, unreadable or malformed requirements file`                                                  |
| unknown-flag allowlist bypassed                                                 | `refuses an unknown flag before any read`                                                                       |
| duplicate-flag guard bypassed                                                   | `refuses a duplicate flag before any read`                                                                      |
| valueless-flag guard bypassed                                                   | `refuses a valueless flag before any read`                                                                      |
| missing-flag check bypassed                                                     | `refuses a missing flag before any read`                                                                        |
| unknown commands routed to `plan-reference`                                     | `refuses an unsupported command before any read, exit 2 through the entrypoint`, `refuses no command at all`    |
| entrypoint maps `UsageRefusal` to exit 1                                        | same entrypoint test, `Expected: 2, Received: 1`                                                                |
| `planRef` equality skipped                                                      | `refuses a receipt for another plan reference`                                                                  |
| `tasksDigest` binding skipped                                                   | `refuses a task export the plan reference does not bind`, tampered task export case                             |
| task lookup skipped                                                             | `refuses an unknown task or step before writing` (absent task)                                                  |
| step lookup skipped (falling back to the code)                                  | same test (absent step)                                                                                         |
| Navigator name exception removed                                                | namespace-layout: `project name must be twilight-navigator-cli, found twilight-navigator`                       |
| Navigator `project.json` / `tsconfig.json` removed from `RESTART_PATHS`         | `names every app project.json…` / `names every app tsconfig…`                                                   |
| graph pair `twilight-navigator → twilight-burokrat` / `→ wbs-contracts` removed | real Nx graph oracle reported that edge                                                                         |
| Navigator lint allow widened to `^@wbs/`                                        | `lets Navigator reach exactly the Burokrat and WBS record contracts` at the allow-list assertion                |
| comparing the version to WBS's imported constant, bumped to 7 in libs/wbs       | `refuses a version-7 document before writing` (received `plan export is malformed`)                             |
| ENOENT on exclusive create left unmapped                                        | `refuses a missing output directory and names it` (raw `ENOENT … open`)                                         |
| Navigator lint override removed                                                 | `eslint` on Navigator: `Imports of apps are forbidden` and the product tag refusal                              |

The emitted command batch is checked against `postApiProjectsByIdCommands`' own params and body
shapes in a test, not at runtime: the batch is built from `PlanCommandWire`, so a runtime check
could not fail.

## Not run

- `bin/h2puni-gate.sh <sha>` (host gate): the orchestrator runs it on the integrated head.
- The unreadable-input proofs need a non-root runner; under uid 0 the test throws.

## WBS v8 schema drift repair, 2026-10-13

Observed in `.worktrees/round14-twilight-fixture`, based on
`a61ce440dcbe0880559bc6d97e584e055cf7e23d` on the local workstation (uid 1000).
The unchanged Navigator suite reproduced the canonical gate failure: 18 pass,
13 fail. Navigator's version pin and fixture remained v7, while WBS's imported
`planDocument` required v8 and each step's `estimateUnit`.

The decoder now derives the v7 wire shape before deep validation: version 7,
steps without `estimateUnit`, and work items without `charged`. Only after
validation does it normalize the internal document to v8 with workday steps.
The reference still names version 7 and hashes the original export bytes.
The README and current delta spec now describe the existing v7 pin.

| Command / injected fault                                                                                                                       | Observed result                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `bun test --preload ../../../../tools/test/scratch/preload.ts src --timeout=30000` (Navigator CLI directory)                                   | Original: 18 pass, 13 fail. Repaired: 37 pass, 0 fail, including six new v7 field refusal cases.                          |
| Remove `.onDeepUndeclaredKey('reject')`; run the same preload with `src/plan-reference.test.ts --test-name-pattern carrying --timeout=30000`   | Exit 1: all seven root/step/charge unknown-field cases failed with exit 0 instead of expected exit 1. Restored the check. |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t test lint typecheck -p twilight-navigator --skip-nx-cache --output-style=static` | Exit 0 on the final adapter: all three targets passed uncached; 37 tests passed, 0 failed.                                |
| `BUN_TMPDIR=/tmp bunx @fission-ai/openspec@1.12.0 validate twilight-navigator-plan-reference --strict --json`                                  | Exit 0, 1/1 passed.                                                                                                       |

Dependencies were provided by a symlink to the existing root `node_modules`;
a fresh frozen install and the canonical h2puni gate remain release integration
checks. No full workspace gate was run on this workstation.
