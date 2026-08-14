# verify — `mobile-card-facts`

Branch `change/mobile-card-facts`, cut from `main` @ `30e8c4c` (#63 merged) on
2026-08-14. M1 of `notes/wbs-plan-2026-08-14-mobile-parity.md`'s split.

**Run under the PoC-mode contract of 2026-08-14** (`notes/delivery-modes.md`,
amended after `chart-clamp-words`): no `design.md`, no citation table, no
watched red per behaviour for copy — the two additions here are read-only
display, not a new guard — and **CI is the gate of record** rather than a full
local run. `nx format:check --all`, not `--base`, per the amendment.

## Wall clock

| moment | UTC |
| --- | --- |
| branch cut | 2026-08-14 18:32 |
| code and tests written | 2026-08-14 18:41 |
| first `nx affected` run (lint red) | 2026-08-14 18:42 |
| lint fixed, green `nx affected` run | 2026-08-14 18:46 |
| `nx format:check --all` red, `format:write` applied | 2026-08-14 18:50 |
| green gate + `openspec validate` 49/49 | 2026-08-14 18:52 |
| PR open | PLACEHOLDER |

**Branch cut to PR open: PLACEHOLDER.** The read this time was smaller than
`chart-clamp-words`' four files — `plan-cards.tsx` already carried the priority
chip and the `showDay`/`spanOf` props this change reuses, so the new fields
needed no prop threaded through `wbs-table.tsx` at all, which is also why that
file could stay untouched as the task required.

## The gate

`bunx nx affected -t test lint typecheck --base=origin/main` on **h2puni**, in
`/home/puni1/wd/puni/wt-mobile-card-facts` (a worktree of `/home/puni1/wbs-reds`),
bun 1.2.20.

| run | result |
| --- | --- |
| affected projects (`nx show projects --affected`) | **fe-01** alone |
| 1st `nx affected -t test lint typecheck` | test 1348 passed / 52 files; **lint 2 errors** — see below |
| 2nd, after the lint fix | **test 1348 passed / 52 files**, lint clean, typecheck clean |
| `nx format:check --all` | 4 files unformatted; `format:write --all` applied, re-check clean |
| 3rd, after `format:write` | **6 tests failed across 2 files** — a flake, not this branch's: an immediate `bunx nx test fe-01` re-run and a `nx reset` + full affected re-run both gave **1348 passed / 52 files, 0 failed**. No file in the flaked run's output changed between it and the two greens either side of it. |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json` | **49 items, 49 passed, 0 failed** |

**Final state: test 1348/1348 (52 files), lint clean, typecheck clean,
openspec 49/49**, reproduced twice in a row after an `nx reset`. be-01 is not
affected and was not run: nothing outside `apps/fe-01` and `openspec/` is
touched. The full gate (`run-many`, e2e, secrets, doc caps) was not run here by
contract — CI below is the gate of record. Nothing ran on h1claw; the
PreToolUse hook there denies it regardless.

## CI

PLACEHOLDER — run id and conclusion to follow once the PR is open.

## The lint red, watched

Not injected — the first real run of the new code caught it:

| what | observed |
| --- | --- |
| `estimate === undefined ? '' : ...` and `finalDays === undefined ? '' : ...`, each assigned to a `const` typed `Days \| undefined` / `number \| undefined` from a bare `row.estimates[roleId]` / `row.finalDays[roleId]` index | `@typescript-eslint/no-unnecessary-condition`: **2 errors**. TypeScript narrows a `const`'s type to its initializer's inferred type (`Days`, `number` — no `undefined`, since `Record<string, T>` indexing is not `noUncheckedIndexedAccess`-checked here), so the annotation on the `const` does not survive into the equality check the way it does on a function *parameter*. |

**The fix taken:** moved both reads behind small named functions
(`trioPoint`, `trioFinal`) whose *parameters* carry the `| undefined`
annotation — the same shape `wbs-table.tsx`'s own `showDays`/`showFinal`
already use, for the same reason. Called inline with the raw index expression
rather than through an intermediate `const`, so nothing narrows the check
away. Re-run: lint clean.

This is also this change's negative test for the pattern: the first commit's
version (struck) is what the row above reproduces; nothing about the runtime
behaviour differed, only what the type checker could see.

## What is left out, on purpose

Everything else `notes/wbs-plan-2026-08-14-mobile-parity.md` names for a phone:
row actions (M2), touch pickers (M3), the structure menu (M4), the Gantt and
the four hover cards (M5+). Untouched files: `wbs-table.tsx`, `plan-export.ts`,
`plan-mermaid.ts`, `gantt-panel.tsx`, `teams-dialog.tsx` — other agents' at the
time this branch was cut.

## Open question for Dany

**The plan-level `scheduleError` (`'cycle' | null`) is not threaded to the
cards.** `wbs-table.tsx`'s Slack cell prints `—` instead of a figure when
`scheduleError !== null` (a dependency cycle means no schedule was computed at
all); the card's new Slack line has no access to that flag without a new prop
from `wbs-table.tsx`, which this branch was told not to touch. During a cycle
a card instead reads `row.schedule.float`/`.critical` as be-01 sends them —
`0`/`false`, its own fallback (`work-item.service.ts:77-78`) — so a card would
say `0d slack` rather than `—` on a plan with no schedule at all. The existing
red banner above both renderers (`wbs-table.tsx:7390`, "These dependencies run
in a circle…") already states the cycle plan-wide, so no reader is left with
*only* the wrong number — but the number itself is wrong for that one state.
Options: (a) leave it — the banner already covers the case and a cycle is rare
and self-reported by the plan; (b) a later, tiny PR threads `scheduleError`
(or just the boolean `hasSchedule`) into `PlanCardsProps`, the one new prop
this change avoided. Recommend (a) unless Dany disagrees — it is a one-line
change whenever `wbs-table.tsx` is next open for something else.
