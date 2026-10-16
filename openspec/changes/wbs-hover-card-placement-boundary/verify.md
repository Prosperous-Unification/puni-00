# Verification

## Scope and identity

Base: wave 9 aggregate `741840881376327bca23140cb8367c7528818dca`, tree
`168c2a67ef6a68da88bf318630bdeb4d671f65b5`. Isolated native checkout:
`/home/df/.codex/worktrees/2a9a/puni-00`, branch
`refactor/wbs100-hover-card-placement-20261016`.

`hover-card.tsx` is 540 lines after extracting placement geometry to the 321-line
`hover-card-placement.ts`; the base component was 833 lines. The sibling has no
imports. All four placement function declarations are byte-identical to the
base, and the entire `HoverCard` function is byte-identical, including React
measurements/effects, whole-row height correction, pointer behavior, rendering
and #536 portalled z-index. CARD width constants remain unchanged. Existing
public geometry names are reexported through the original module. Original
symbol JSDoc moved with its declarations. Three links to component symbols now
use relative Markdown file links to keep the pure module dependency-free; the
surface function also gained the observed arithmetic failure proof paragraph.

The AST-backed one-off comparison (`bun /tmp/check-hover-preservation.ts`) selects
the original and extracted function declarations using TypeScript and compares
their source text, then compares the complete `HoverCard` source suffix and width
constants. It printed: `All four function declarations byte-identical; entire
HoverCard function byte-identical; width constants unchanged; placement module
imports no dependency.` This is extraction evidence, not a permanent gate.

## Checks observed

Commands run at checkout root unless marked frontend cwd. Dependencies are a
symlink to the existing root `node_modules`; no fresh frozen installation was
performed locally. The installed runner reports Vitest 5.0.0.

| Command                                                                                                                                                                                       | Observed output                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `TZ=UTC bunx vitest run --config vitest.node.config.ts src/components/wbs/hover-card-placement.test.ts --maxWorkers=1` before extraction (frontend cwd)                                       | Expected RED: missing `./hover-card-placement`, one failed suite, zero tests; exit 1.             |
| `TZ=UTC bunx vitest run --config vitest.node.config.ts src/components/wbs/hover-card-placement.test.ts src/test-tiers.test.ts --maxWorkers=1` after extraction and restoration (frontend cwd) | 2 files passed, 30 tests passed; exit 0.                                                          |
| `TZ=UTC bunx vitest run src/components/wbs/hover-card.test.tsx --maxWorkers=1` (frontend cwd)                                                                                                 | 1 file passed, 20 tests passed; exit 0.                                                           |
| `NODE_OPTIONS=--max-old-space-size=768 bunx eslint` over the four changed TypeScript/TSX source and test files                                                                                | Final run exit 0, no ESLint diagnostics; Nx boundary rule skipped because no cached ProjectGraph. |
| `bunx prettier --check` over the five changed frontend files and this change directory                                                                                                        | All matched files use Prettier code style; exit 0.                                                |
| `bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js validate wbs-hover-card-placement-boundary --json`                                          | 1 valid change, 0 failed; exit 0.                                                                 |
| Same installed OpenSpec CLI `validate --all --json`                                                                                                                                           | 235 valid items (217 changes, 18 specs), 0 failed; exit 0.                                        |
| `bun /tmp/check-hover-preservation.ts`                                                                                                                                                        | Exact function/body/width preservation and no imports confirmed; exit 0.                          |
| `git diff --check`                                                                                                                                                                            | Exit 0.                                                                                           |

The first test invocation included unsupported Vitest 5 flag `--minWorkers=1`
and exited 1 before running tests. It was corrected to `--maxWorkers=1`.
The first scoped lint found import/export ordering errors; ESLint autofix
corrected them and the final four-file run exited 0. Vite emits existing native
config warnings (`__dirname`, extensionless imports, JSON attributes). Scoped
ESLint cannot prove module boundaries without a cached Nx ProjectGraph.

The installed TypeScript 6.0.3 JSDoc resolver was also run over every symbol link
in the pure module. Before correcting moved cross-file links it exited 1 with
11 checked links and unresolved `HoverCard`, `HoverCard`,
`HoverCardProps.diagonal`. Replacing those three with relative Markdown links
preserves the wording and zero-import boundary. The restored resolver check
reports 8 checked links and an empty unresolved list (exit 0).

## Failure-proof table

No production safety check was added or changed. The new fixed-output geometry
suite exercises the real production functions directly.

| Fault injected                                                                  | Observing test                                               | Observed failure                                                        |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Below-mark gap addition changed to subtraction in production `surfacePlacement` | `surface placement geometry > below the mark with its gap`   | Actual top 222 versus expected 234; exit 1.                             |
| Same arithmetic mutation                                                        | `clamped at the right edge`, `exact fit below remains below` | Actual tops 222/668 versus expected 234/680; total 3 failed, 21 passed. |

The fault was removed before the passing rerun. Its adjacent `Proof:` comment
records the injection and observed fixed-output case. The original component
suite remains intact with one added function-identity case. New node fixtures
cover normal placement, left/up flips, nonzero frame clamps, oversized cards,
exact gap-inclusive fits, list refusal, tie choices, viewport-share cap,
scrolling floor and a small frame overriding that floor.

## Pending hosted proof and gate

Selected F7 committed comparison, restored-oversized-file fault, and full
all-rule surveys have **not run for this candidate**. The identified evaluator
and unchanged policy from the preceding extraction remain the required inputs;
the parent hosted lane must freshly identify them and record executable/policy
hashes. It must require exactly the selected hover-card finding removed and
compare every unrelated finding and unevaluated outcome across all rules.
No local evaluator or policy substitute was used.

Browser regressions, frontend typecheck, full frontend lint, fresh frozen install,
`bunx nx format:check --all`, and full `test lint typecheck build` remain
unverified for this candidate. They are reserved for hosted serial execution on
the reviewed immutable commit. On h2puni the required full command is
`bin/h2puni-gate.sh <sha>`, under its canonical lock. No full local Nx, browser or
Burokrat survey was run on the RAM-constrained laptop.

## Completeness and integration

The extraction and local fixed-output/identity proofs are implemented. Hosted
committed F7 proof, full survey preservation, browser/gate and reviewed push/PR
remain unchecked in `tasks.md`, blocking archive. The delta spec is not synced.
No separate design or ADR is needed for this bounded reversible extraction;
no new domain terms were introduced. PM source diff review was requested before
push. Implementation commit identity will be recorded by the integration lane.
WBS100 remains `blocked_by_proxy`; this packet claims no certification or closure.
