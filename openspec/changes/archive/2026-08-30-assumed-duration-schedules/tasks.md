<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 0. Ordering

- [x] 0.1 **After `dep-reach-whole-item`** — **not honoured, deliberately.** The behaviour slice 2.2 protects is the engine's only rule today, so its test is written against the engine as it stands and becomes that change's `anchor-slice` case verbatim. What the merge has to do is in `verify.md` under Ordering. **Resolved 2026-08-30:** `dep-reach-whole-item` merged and did it — `the anchor reach still means first estimated` now schedules on a named `anchor-slice` reach and asserts the `whole-item` default at day 8 beside it.

## 1. One shared constant

- [x] 1.1 `ASSUMED_SLICE_WORKDAYS = 2` in `libs/domain`, imported by `schedule.ts` and `gantt-geometry.ts`; the local figure in `gantt-geometry.ts` deleted — test: `the drawing and the dates agree`; negative: the constant changed to 3, watched moving **both** a scheduled date and a drawn bar width in one run. A copy left behind would move only one.

## 2. The engine assumes, and nothing else changes its mind

- [x] 2.1 An unestimated slice's duration is the assumed duration in placement, dependencies, floors, leveling and capacity — test: `schedule.test.ts` `an entirely unestimated predecessor delays its successor`, `two unestimated slices for one person do not overlap`, `an unestimated slice spends its team's pool`; negative: the assumed duration applied to the dependency graph but not to leveling, watched failing on the overlap case.
- [x] 2.2 **The six reporters are untouched.** Days column, roll-up, readiness badge and its walk, export, `estimatedStepIds` facet, and the `anchor-slice` reach each tested against an unestimated item and answering exactly as before — test: `an unestimated item still reports no estimate`, `the anchor reach still means first estimated`; negative: the estimated-predicate changed to "has a duration", watched taking all six red at once. This is the change's real risk (design D2).

## 3. The drawing

- [x] 3.1 `gantt-geometry.ts` reads the shared constant; the dotted outline, translucent fill, `?` and `data-assumed` unchanged — test: `gantt-geometry.test.ts` `the bar still says it is a guess`; negative: `data-assumed` dropped, watched failing.

## 4. Glossary

- [x] 4.1 `CONTEXT.md`: **Assumed duration** added; **Assumed span** reworded per design D5 (it no longer claims the engine does not know); **Anchor slice**'s last sentence reworded per D4.

## 5. Identity, re-derived honestly

- [x] 5.1 `schedule-identity.test.ts`: fully-estimated fixtures assert **unchanged** dates; every fixture holding an unestimated slice is re-derived, and each is listed in `verify.md` with the reason it moved. A fully-estimated fixture that moved is a bug in the duration lookup.

## 6. In a browser

- [x] 6.1 A Chromium spec: a chain whose predecessor is entirely unestimated, asserting the successor's bar starts after the predecessor's — find the bar through its own row and assert non-zero width and height **first** (`AGENTS.md`, the gantt-calendar-axis vacuity: a zero-width bar makes an overlap check unfailable); negative: the assumed duration reverted to zero, watched failing.

## 7. Gate

- [x] 7.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, the whole `CI=1` Playwright gate on shifted ports. **Done, with two substitutions stated.** `h2puni-gate.sh` is that host's and this is a Mac; its five commands were run individually. The whole browser gate ran **serialised under the canonical heavy lock** on shift 1900: **232 passed, 4 failed, 1 skipped**, every failure reproduced on `main` without this change and each named in `verify.md`. An earlier 229/4 run on shift 1500 shared its ports with another agent's suite and is discarded rather than cited. `openspec validate --all --json` green; `be-01` 1213, `fe-01` 1899, `domain` 128, `mcp-01` 103, typecheck 23/23.
