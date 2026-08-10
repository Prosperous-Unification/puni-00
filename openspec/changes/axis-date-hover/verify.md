# verify — axis-date-hover

Run 2026-08-10, on main.

| Command                                                      | Result                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                                 | pass                                                                                                                      |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | pass — 21 projects                                                                                                        |
| `openspec validate --all --json`                             | 60/60                                                                                                                     |
| `bun run e2e`                                                | not run locally — 3100/3200/4200 still held by the puni checkout's dev stack; CI's `pixels` job runs the new browser test |

`gantt-panel.test.tsx`: 77/77 (was 71).

## Failure proofs (R5)

| Check                                         | Fault injected                                 | Observed                                                                      |
| --------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| The card opens with the right words (4 tests) | TDD red first — feature absent                 | `4 failed \| 73 passed` before the implementation existed                     |
| Touch opens nothing on the axis               | the `pointerType !== 'mouse'` guard dropped    | `1 failed \| 76 passed` — `opens nothing for a pointer that is not a mouse`   |
| A crossing pointer opens nothing              | `onPointerOut={dismiss}` removed from the cell | `1 failed \| 76 passed` — `opens nothing for a pointer that crosses the axis` |

Not watched in Chromium: the new e2e hover test itself — same port conflict as
`gantt-polish`; CI is its first run.
