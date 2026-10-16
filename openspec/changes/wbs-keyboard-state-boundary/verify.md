# Verification

## Scope and identity

Exact accepted base: `8ab865f3f36052f4caac846aee7e5206f681d056`.
Isolated checkout: `.worktrees/wbs100-keyboard-state-sol`, branch
`refactor/wbs100-keyboard-state-20261016`.

The 1046-line original module becomes a 775-line handler/navigation module and
286-line state/effect sibling. `usePlanKeyboardState`, `usePlanKeyboardEffects`,
private `planIsActive`, public `ARM_WINDOW_MS` and all attached JSDoc/proofs are
byte-identical to their original source. A direct text comparison of the moved
blocks and complete remaining handler/navigation span passed. Existing callers
and their imports are unchanged. Public hooks and timer use identity reexports.

No domain terms, ADR, behavior or production safety checks were introduced.
The parent architect supplied the extraction boundary before dispatch; no new
design interview was necessary for this mechanical extraction.

## Observed checks

Dependencies are symlinks to the root installed `node_modules`; a fresh frozen
install has not run locally. Local tests use one Vitest 5.0.0 worker at a time.
The host reported 21320 MiB available before work and 19672 MiB during owning
suites; no browser, full Nx or Burokrat process was started locally.

All Vitest commands below run from `apps/wbs/fe-01`.

| Command                                                                                                                                                                                                                                    | Observed outcome                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `TZ=UTC bunx vitest run src/components/wbs/plan-keyboard.test.tsx -t 'preserves keyboard state and effects' --maxWorkers=1` before extraction                                                                                              | Expected RED: missing `./use-plan-keyboard-state`, one failed suite, exit 1.                                   |
| `TZ=UTC bunx vitest run src/components/wbs/plan-keyboard.test.tsx src/components/wbs/project-page.test.tsx -t 'preserves keyboard state and effects\|hidden Plan window shortcuts\|arm toast leaves' --maxWorkers=1 --no-file-parallelism` | 2 files passed, 4 tests passed, 196 skipped by explicit name filter; exit 0.                                   |
| `TZ=UTC bunx vitest run src/components/wbs/plan-keyboard.test.tsx src/components/wbs/project-page.test.tsx --maxWorkers=1 --no-file-parallelism`                                                                                           | 2 files passed, 200 tests passed; exit 0, 99.80s.                                                              |
| Direct source text preservation comparison described below                                                                                                                                                                                 | Both moved blocks, timer/default predicate, JSDoc/proofs and remaining runtime declarations preserved; exit 0. |
| `NODE_OPTIONS=--max-old-space-size=768 bunx eslint` over the three paths below                                                                                                                                                             | Exit 0; no source diagnostics. Nx module boundaries skipped without cached ProjectGraph.                       |
| `bunx prettier --check` over the three paths and change directory below                                                                                                                                                                    | All matched files use Prettier code style; exit 0.                                                             |
| Installed OpenSpec 1.12.0 CLI `validate wbs-keyboard-state-boundary --json`                                                                                                                                                                | 1 valid change, 0 failed; exit 0.                                                                              |
| Same installed CLI `validate --all --json`                                                                                                                                                                                                 | 235 items passed (217 changes, 18 specs), 0 failed; exit 0.                                                    |
| `git diff --check`                                                                                                                                                                                                                         | Exit 0.                                                                                                        |

The first attempt to add the identity assertion used a root-relative path from
frontend cwd and failed before writing; an accompanying filtered runner found
no case and skipped 96 tests. The path was corrected before the expected RED.
Vite reports its existing native config `__dirname` warning.

Exact scoped paths for ESLint and Prettier are
`apps/wbs/fe-01/src/components/wbs/use-plan-keyboard.ts`,
`apps/wbs/fe-01/src/components/wbs/use-plan-keyboard-state.ts` and
`apps/wbs/fe-01/src/components/wbs/plan-keyboard.test.tsx`. Prettier additionally
checks `openspec/changes/wbs-keyboard-state-boundary`. These commands run at
checkout root. The installed OpenSpec command prefix is
`bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js`.

The source comparison reads the original with
`git show 8ab865f3f36052f4caac846aee7e5206f681d056:apps/wbs/fe-01/src/components/wbs/use-plan-keyboard.ts`
and uses Python string slices bounded by the original section JSDoc: the
`const planIsActive` through the next `Every chord the plan answers` section,
the `The two pieces of state the keyboard owns` suffix, and the `How long an
armed Ctrl+D` through `The armed row` section must occur verbatim in the sibling.
The original span from `Every chord the plan answers` to `The two pieces of
state the keyboard owns`, minus only that exact timer block, must occur verbatim
in the facade. All four assertions passed. This is extraction evidence rather
than a permanent gate.

## Failure-proof table

Existing production safety checks and attached historical `Proof:` comments
moved unchanged. Both faults were freshly observed against the extracted module
and removed before the restored owning-suite invocation.

| Injected production fault                                    | Observing test                                             | Observed failure                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| Remove both `isPlanActive` listener guards                   | `keeps the hidden Plan window shortcuts inactive on Board` | Unexpected undo `[["p2"]]` versus `[]`; 1 failed, 102 skipped, exit 1.  |
| Remove `dismissToast(toastKey(promise))` from effect cleanup | `the arm toast leaves with the arm, however the arm ends`  | Promise toast still present after disarm; 1 failed, 96 skipped, exit 1. |

Fault commands (frontend cwd), run sequentially after the respective production
mutation and before restoring the clean sibling:

```sh
TZ=UTC bunx vitest run src/components/wbs/project-page.test.tsx -t 'hidden Plan window shortcuts' --maxWorkers=1
TZ=UTC bunx vitest run src/components/wbs/plan-keyboard.test.tsx -t 'the arm toast leaves with the arm' --maxWorkers=1
```

Raw local logs are retained at `/tmp/wbs100-keyboard-{red,green,board-fault,toast-fault,owning}.log`.

## Hosted proof, review and remaining checks

Parent PM independent Astra high review completed with no P0–P3 code findings.
Its independent TypeScript comparison confirmed all 11 declarations and attached
JSDoc byte-identical, with no parse diagnostics. Source publication and draft
PR creation await parent PM approval of the prepared hosted proof. A separate hosted proof branch must pin immutable
source/base/tree identities, recover the retained installed evaluator and
unchanged policy, require only the selected F7 finding disappear, and preserve
unrelated findings and unevaluated outcomes in complete surveys. The proof must
commit the restored oversized production file and observe the selected-finding
oracle fail. These hosted checks have not run for this candidate.

Frontend typecheck, full lint, browser, full Nx, frozen install and build are
unverified locally. The parent owns the reviewed immutable hosted gate; on
h2puni it must run `bin/h2puni-gate.sh <sha>` under the canonical lock. No gate,
certification, WBS100 closure, deployment, spec sync or archive is claimed.
WBS100 remains `blocked_by_proxy`.
