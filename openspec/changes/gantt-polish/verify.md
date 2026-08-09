# verify — gantt-polish

Run 2026-08-09, branch `change/gantt-polish`, this checkout.

## Commands

| Command                                                      | Result                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx format:check --all`                                 | pass (after `prettier --write` on the three touched files)                                                                                                                                                                                                                                                                                           |
| `bunx nx run-many -t test lint typecheck build --parallel=2` | pass — `Successfully ran targets test, lint, typecheck, build for 21 projects`                                                                                                                                                                                                                                                                       |
| `openspec validate --all --json`                             | 58 items, 58 passed                                                                                                                                                                                                                                                                                                                                  |
| `bun run e2e`                                                | **NOT RUN locally.** Ports 3100/3200/4200 were held by `~/wd/puni/wbs-tool-v1`'s dev stack (PIDs 71520/71521/71522); with `reuseExistingServer: !isCi` a local run would have measured that checkout — the exact landmine `LLM_README.md` records. Dany chose "skip local e2e, push now"; CI's `pixels` job is the first browser run of this change. |

`apps/fe-01` vitest: 52/52 in `gantt-panel.test.tsx` (was 45 before the change).

## Failure proofs (R5)

Every fault injected on the real production call path, watched failing, then reverted.

| #   | Check                                                | Injected fault                                                        | Observed failure                                                                                                                                               |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Row words never dropped for room                     | `barText` appends the words only when they fully fit                  | `4 failed \| 48 passed` — `carries the row words whole…` on `expected 'Kat' to be 'Kat · strip - strip'`, three narrow-bar cases with it, every wide bar green |
| 2   | Ghost bar is translucent                             | bracket class made `fill-foreground` whole                            | `1 failed \| 51 passed` — `draws a parent as the ghost of a bar…` on `expected 'fill-foreground' to contain 'fill-foreground/15'`                              |
| 3   | Switch hides the head with the elbow                 | `arrowsShown &&` moved onto the elbow path alone                      | `1 failed \| 51 passed` — `hides every arrow and its head…` on `expected 1 to be +0` for the head count                                                        |
| 4   | Caption reads `Aug 2026`                             | `monthWords` short-circuited to `date.slice(0, 7)`                    | `3 failed \| 49 passed` — both caption cases on `Unable to find an element with the text: Aug 2026` / `Sep 2026`, and the fixed-table case                     |
| 5   | Ghost bar spans placed readings, not engine workdays | `placeGantt` brackets given `from: bracket.start, to: bracket.finish` | `3 failed` incl. `expected 7 to be 9` (right edge) and `expected 5 to be 7` (calendar x)                                                                       |
| 6   | Ghost bar is drawn at all                            | the brackets `map` deleted whole                                      | `nothing on the chart at [data-gantt-bracket="hull"]` and `expected 'nothing on the chart at…' to be '9'`                                                      |

## Not watched

- The **Chromium** half of the ghost-bar paint check (`e2e/gantt.spec.ts`, computed
  `fill` alpha < 1): blocked by the port conflict above. Its comment says so in
  place. First run is CI's `pixels` job on this push; the injected-fault watch
  still has to happen in a local Chromium once the ports are free.

## Cross-review, 2026-08-09

codex (headless `codex exec`) and an Opus subagent reviewed `tmp/gantt-polish.diff`;
agy queued for Dany (`tmp/agy-review-gantt-polish.sh` — headless agy auto-denies reads).

| Finding                                                                                | Disposition                                                                                                                    |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| e2e alpha parser rejects Chromium's `oklab(... / 0.15)` serialization (both, critical) | **Fixed** — parser now reads the trailing `/ alpha`, rgba's fourth argument, percent forms; traced against five serializations |
| zero-span parent draws a zero-width rect, no mark (both, major)                        | **Fixed** — a tick line, `still marks a parent whose projection has no days`, negative watched (`1 failed \| 52 passed`)       |
| "reverts FoldedRoleCard / deletes redraw coverage" (both)                              | **Not a finding** — the branch was behind main; merged `e9a1308` in                                                            |
| task 2.2's geometry half missing from the browser gate (opus, major)                   | **Fixed** — ghost box asserted non-zero and inside its row in `gantt.spec.ts`                                                  |
| Arrows corner scrolls away vertically (opus, minor)                                    | **Fixed** — corner and axis are `sticky top-0`; the comment's claim is now true                                                |
| `rx` comparison passes when both radii are missing (opus, minor)                       | **Fixed** — not-null first; negative watched (`expected null not to be null`)                                                  |
| `monthWords` guard had no reachable negative (opus, minor)                             | **Fixed** — `refuses a month no calendar has, out loud`, guard-deleted fault watched                                           |
| `LABEL_CHAR_PX` documented against 10px, worth ~5 at 9px (opus, minor)                 | **Fixed** — 5.5 → 5, JSDoc says which font it measures; every label test unchanged                                             |
| toggle never clicked in a browser (opus, minor)                                        | **Fixed** — `gantt.spec.ts` clicks it both ways in Chromium                                                                    |
| probe inherits body colour on invalid paint (opus, nit)                                | **Fixed** — sentinel colour distinguishes "unreadable" from "solid"                                                            |
| assignee part can consume a narrow bar before the row words (codex)                    | **Accepted** — the assignee-first order is the ask; the box crops the words                                                    |
| two-role rows repeat the row words once per bar (opus, nit)                            | **Accepted** — the label is the ask verbatim; the role stays in the hover title                                                |

Browser-side checks (ghost paint alpha, ghost geometry, toggle click) remain
**unwatched in Chromium** — same port conflict, first run is CI's `pixels` job.
