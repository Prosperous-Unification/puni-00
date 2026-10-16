# verify — `ui-review-gantt-directory`

Branch `ui-review/gantt-directory` from `origin/main` @ `3e06eb5a4`. fe-01 only. No migration, no
dependency, no be-01 change. Every run below is fresh, 2026-10-16, with `E2E_PORT_SHIFT=3700`.

| Command                                                                                        | Result                                    |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `bunx nx run-many -t lint:fast typecheck -p wbs-fe-01 --skip-nx-cache`                         | Successfully ran                          |
| `bunx nx run-many -t test:unit test -p wbs-fe-01 --skip-nx-cache` (`env -u CLAUDECODE`)        | Successfully ran, exit 0                  |
| Playwright: header, project-picker, keyboard, gantt, gantt-legibility, directory, gantt-detail | 116 passed, 1 skipped, 1 failed (F-107)   |
| same, `header.spec.ts` after narrowing the F-107 test to options with a short name             | 15 passed                                 |
| Playwright `gantt.spec.ts` marker rule, `--repeat-each 3`                                      | 3 passed, `changedPixels=0` at every rung |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                       | 215 passed, 0 failed                      |

The first Playwright run's one failure was the new F-107 test meeting a project named
`LONG_PROJECT_NAME` by an earlier header test in the same database: a name as wide as the list
leaves no meta at all, which is F-086's listbox width. The test now measures the options whose name
takes under half the option, and was watched failing again on the owner-first order (below).

## R5 proofs (each fault injected alone, then watched fail)

| Check                                                                    | Injected fault                             | Observed                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------- |
| vitest `writes one label for a row’s laned bars…`                        | code before the change                     | `expected <span …(4)></span> to be null` (`sand-plan`)                       |
| same                                                                     | `labelBandOf` lane check removed           | `expected <span …(4)></span> to be null`                                     |
| vitest `says how many steps a stack holds…`                              | code before the change                     | `stackText is not a function`                                                |
| vitest `writes a lane stack’s one label in the file…`                    | stack loop given no bars in the SVG export | `expected [] to deeply equal [ 'sand · 2 steps · 1 no estimate' ]`           |
| e2e `a row whose steps share one instant writes its number once` (F-101) | `gantt-panel.tsx` before the change        | `labels for 010`, expected length 1, received `["010 · no estimate", "010"]` |
| e2e `are the palette’s ink, not the browser’s link blue` (F-102)         | code before the change                     | light `rgb(0, 0, 238)`, dark `rgb(158, 158, 255)`                            |
| vitest `names a column the way the table’s header does` (F-105)          | code before the change                     | `Enter in Prio: expected [ 'Links', 'Depends on', …(15) ] to include 'Prio'` |
| e2e `every entry’s date is still on screen at 1024` (F-107)              | `entryMeta` owner first                    | `the date in (local-dev · 16 Oct) is cut off`, received 33                   |

## Follow-up after the #519 review (2026-10-17, F-138, F-140, F-142)

On `ui-review/gantt-directory` with origin/main 5274046bd (#514) merged in. That merge had one
conflict in `e2e/header.spec.ts`: #515's `two imports of one long name read apart at every width` and
this lane's F-107 test sat at the same place. Both tests were kept in full. Shift 3700,
`--workers 2`.

| Command                                                      | Result                                    |
| ------------------------------------------------------------ | ----------------------------------------- |
| `header.spec.ts` on the merged tree                          | 16 passed                                 |
| `lint:fast typecheck -p wbs-fe-01 --skip-nx-cache`           | Successfully ran                          |
| Vitest `gantt-bar-labels`, `gantt-panel`, `gantt-panel-fill` | 311 passed                                |
| Playwright `gantt-legibility.spec.ts`, `directory.spec.ts`   | 18 passed                                 |
| Playwright marker rule, `--repeat-each 2`                    | 2 passed, `changedPixels=0` at every rung |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`     | 225 passed, 0 failed                      |

| Check                                                           | Injected fault                         | Observed                                                                 |
| --------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| vitest `keeps an estimated bar’s own words where it runs past…` | code at 52cdd2ae5; `spill` always null | `sand-dev’s own label: expected null not to be null`                     |
| vitest `writes a lane stack’s one label in the file…`           | spills ignored in the SVG export       | `expected [ 'sand · 2 steps · 1 no estimate' ] to deeply equal [ …(2) ]` |
| e2e `a row whose steps share one instant…` (`030` row)          | `gantt-panel.tsx` at 52cdd2ae5         | `labels for 030`, received list missing `bar: 030 · Row long`            |
