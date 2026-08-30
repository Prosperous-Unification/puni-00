# verify — `mobile-row-actions`

Branch `change/mobile-row-actions`, cut from `main` @ `cf57109` (#69 merged) on
2026-08-16. M2 of `notes/wbs-plan-2026-08-14-mobile-parity.md`'s split, after
M1 (`mobile-card-facts`, #64, merged).

**Run under the PoC-mode contract of 2026-08-14** (`notes/delivery-modes.md`):
no `design.md`, no citation table, no watched red per behaviour for the
`touchSized` style branch (an ordinary assertion, the lighter contract's own
rule for a layout change) — but the new `ActionsMenu` wiring inside
`plan-cards.tsx` (which item calls which handler, with which argument, and
that a refused item calls nothing) got its own tests too, since that is new
behaviour a silent regression could hide in. `bunx nx format:check --all`, not
`--base`, per the amendment. **CI is the gate of record.**

## Wall clock

| moment                                                                                                                 | UTC              |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------- |
| branch cut (`git worktree add`)                                                                                        | 2026-08-16 18:29 |
| code and tests written (4 files: `actions-menu.tsx`, `actions-menu.test.tsx`, `plan-cards.tsx`, `plan-cards.test.tsx`) | 2026-08-16 18:30 |
| first commit                                                                                                           | 2026-08-16 18:31 |
| `bun install` on the fresh h2puni worktree                                                                             | 2026-08-16 18:31 |
| 1st `nx affected -t test lint typecheck` — green first try (1400/1400, lint clean, typecheck clean)                    | 2026-08-16 18:32 |
| `nx format:check --all` — red, 3 files                                                                                 | 2026-08-16 18:33 |
| `format:write --all` applied — `tasks.md` would not converge (see below)                                               | 2026-08-16 18:34 |
| `tasks.md` rewritten without manual mid-sentence line wraps, `format:check --all` clean                                | 2026-08-16 18:36 |
| second commit (the format fix), pushed                                                                                 | 2026-08-16 18:37 |
| final gate green on h2puni: test 1400/1400, lint clean, typecheck clean, format clean, openspec 54/54                  | 2026-08-16 18:37 |
| PR #70 open                                                                                                            | 2026-08-16 18:37 |

**Branch cut to PR open: ~8 minutes.** Code and tests were the small side of
this one — reusing `actions-menu.tsx` outright meant no new accessible-menu
logic to write, only the wiring and the wording match. The `tasks.md` oscillation below cost more real time than anything in the code.

## The gate

`bunx nx affected -t test lint typecheck --base=origin/main` on **h2puni**, in
`/home/puni1/wd/puni/wt-mobile-row-actions` (a worktree of
`/home/puni1/wbs-reds`), bun 1.2.20. `bunx nx format:check --all` per the
PoC-mode amendment.

| run                                                                        | result                                                                                   |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| affected projects (`nx show projects --affected`)                          | **fe-01** alone                                                                          |
| `nx affected -t test lint typecheck` (fresh worktree, after `bun install`) | **test 1400 passed / 53 files, 0 failed**, lint clean, typecheck clean — green first try |
| `nx format:check --all` (1st)                                              | **3 files unformatted**: `plan-cards.test.tsx`, `proposal.md`, `tasks.md`                |
| `format:write --all`, re-check                                             | `tasks.md` alone still flagged — see "The format oscillation" below                      |
| `tasks.md` rewritten, `format:write --all`, re-check                       | **clean**                                                                                |
| `nx affected -t test lint typecheck` (final, on the pushed head)           | **test 1400 passed / 53 files, 0 failed**, lint clean, typecheck clean                   |
| `bunx @fission-ai/openspec@1.3.0 validate --all --json`                    | **54 items, 54 passed, 0 failed**                                                        |

**Final state: test 1400/1400 (53 files), lint clean, typecheck clean, format
clean, openspec 54/54**, reproduced on the pushed head `e7f0a49`. be-01 is not
affected and was not run: nothing outside `apps/fe-01` and `openspec/` is
touched. The full gate (`run-many`, e2e, secrets, doc caps) was not run here
by contract — CI below is the gate of record. Nothing ran on h1claw; the
PreToolUse hook there denies it regardless.

## CI

**Run 31965152006** on head `e7f0a49` (PR #70). _(fill in on completion)_

## The format oscillation, watched

Not the injected-fault kind — a real non-idempotency in `format:write` over
one file. `tasks.md`'s first draft hand-wrapped long sentences at ~78
characters, breaking two backtick code spans across a soft line break
(`` `grows the ⋯\n      button to a 44px tap target...` ``). Two consecutive
`format:write --all` runs kept re-indenting the continuation line differently
(6 spaces, then 2, then 6 again) without ever reaching a fixed point —
`format:check --all` stayed red on the same file across both. **Fix:**
rewrote the file with each list item as a single unwrapped line and let
Prettier's own `proseWrap` decide the breaks, rather than pre-wrapping by
hand; `format:check --all` then passed clean on the first following run and
stayed clean on a second independent run. Worth carrying forward: **hand
line-wrapping Markdown text that contains a code span is what triggered
this** — write long sentences on one line in source and let the formatter
wrap them.

## What is left out, on purpose

Everything else `notes/wbs-plan-2026-08-14-mobile-parity.md` names for a
phone beyond M1+M2: touch pickers (M3), the structure menu (M4), the Gantt
and the four hover cards (M5+). Untouched files: `wbs-table.tsx`,
`plan-export.ts`, `plan-mermaid.ts`, `gantt-panel.tsx` — two other agents'
tonight.

No per-row **Freeze** item: the table's own `ActionsMenu` usage
(`wbs-table.tsx`'s `actions` column) offers only Duplicate, conditional
Unfreeze and Delete — freezing a plan's numbering is `api.freeze(projectId)`,
a toolbar action over the whole plan, not a per-row one. Building a per-row
Freeze the desktop does not have would have been the second vocabulary the
task asked this change not to invent.

## The code-versus-record split

Roughly even this time, and record includes the format-oscillation
detour: code + tests ~25 minutes (most of it reading `actions-menu.tsx` and
`wbs-table.tsx`'s existing usage closely enough to reuse the component
byte-for-word rather than re-describe it), record + gate + the `tasks.md`
fix ~15–20 minutes, spread across the wall-clock table above.

## Open question for Dany

**The menu this change builds is complete and unit-tested, but not reachable
from a running plan.** `PlanCardsProps.rowActions` is optional; `wbs-table.tsx`
is two other agents' file tonight and this branch was told not to touch it,
so its `<PlanCards>` call site (`wbs-table.tsx` around the `renderer ===
'cards'` branch) still does not pass real `duplicate`/`unfreeze`/`remove`
callbacks. Concretely, until that call site is edited, a phone shows no ⋯
button on any card at all — the same "absent rather than half-built" choice
`mobile-card-facts` made for `scheduleError`, but larger here because the
whole feature, not one field, waits on it.

The actual wiring is small once the file is free — three lines, mirroring
what `wbs-table.tsx`'s own `ActionsMenu` usage already does:

```tsx
rowActions={{
  duplicate: (id) => { void duplicateRow(id); },
  unfreeze: (id) => { void run(() => api.unfreeze(id)); },
  remove: (row) => { void deleteRow(row); },
}}
```

Options: (a) leave this PR as the self-contained, reviewable unit and land the
three-line wiring as its own tiny follow-up once `wbs-table.tsx` is free —
recommended, since it keeps tonight's three-agent file split intact and the
diff stays reviewable in isolation; (b) hold this PR open unmerged until the
wiring can land in the same change, so "M2 shipped" means "reachable," not
just "built." Recommend (a): the component is the expensive part to get
right (matching wording, refusal, and touch sizing) and is now proven in
isolation: the follow-up is close to mechanical.
