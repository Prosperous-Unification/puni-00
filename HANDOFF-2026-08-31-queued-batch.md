# Handoff — the 2026-08-31 ready-for-dev batch

Written at Dany's request mid-session. **Nothing is pushed.** Everything below
lives on local branches in `~/wd/personal/wbs-tool/wbs-tool-v1`, chained off
`main` at `2e3fb759`.

The batch is the seven asks in
`~/.claude/projects/…/memory/project_2026-08-31_ready_for_dev_batch.md`. Dany
was asked which to take and answered **"All seven"**.

## Score

| #     | Ask                                                     | State                              |
| ----- | ------------------------------------------------------- | ---------------------------------- |
| **1** | A critical row's slack must stop being red              | **done**, committed `a710fc1a`     |
| **2** | Start date hover must be an instant, non-native tooltip | **done**, committed `13ee3d48`     |
| **3** | Clicking the add field must show existing tags          | **code done**, uncommitted, gating |
| **4** | The Gantt must always use the assignee's short name     | **done**, committed `71ad0bb0`     |
| **5** | Priority cells want a Jira-style chevron                | **done**, committed `6c9758fe`     |
| **6** | `createdBy` on tag/type/service/team creation           | **not started**                    |
| **7** | Audit columns everywhere (~87 columns, 31 tables)       | **not started**                    |

## The branch chain

Each change is one commit on a branch cut from the previous one, so the tip has
all of them. **They are not independent branches** — a PR per commit needs
stacking, or squash the lot.

```
main (2e3fb759)
└── change/quiet-critical-slack        a710fc1a   item 1
    └── change/gantt-short-assignee    71ad0bb0   item 4
        └── change/priority-chevron    6c9758fe   item 5
            └── change/start-date-hover-card  13ee3d48   item 2
                └── change/picker-reopens-on-click  ← HEAD, dirty, item 3
```

`git checkout change/picker-reopens-on-click` is where to resume.

## Update, 2026-09-01

Items 1-5 are all committed. Two of Dany's three new asks are committed as well;
the third is unreproducible and is written up below.

```
main (2e3fb759)
└── change/quiet-critical-slack        a710fc1a   item 1
    └── change/gantt-short-assignee    71ad0bb0   item 4
        └── change/priority-chevron    6c9758fe   item 5
            └── change/start-date-hover-card  13ee3d48   item 2
                └── change/picker-reopens-on-click
                        57cca919   item 3
                        f81b32ef   hints + work-item naming   ← HEAD, clean
```

**Still nothing is pushed.** The branch name no longer describes its tip; a PR
wants a rename or a squash.

### Dany's three asks of 2026-08-31/09-01

1. **Hints must be the app's own, instant, not the system tooltip** — done,
   `openspec/changes/hints-are-the-page-s-own`. 94 `title` attributes became
   `data-hint`, one `HintLayer` draws them all, and `e2e/hints.spec.ts` sweeps
   the plan for `[title]` so it stays that way.
2. **A work item is referenced as `010 - name` everywhere** — done,
   `openspec/changes/work-items-named-by-number-and-name`. `rowWords` moved out
   of the chart into `work-item-words.ts` and every reader-facing reference goes
   through it. `aria-label`s deliberately untouched; the proposal says why.
3. **The linked row hover breaks moving from the table to the chart quickly** —
   **not reproduced, not changed.** See below.

### The hover bug, and why nothing was shipped for it

Dany: hovering a table row lights the chart, but moving the pointer to the chart
too quickly leaves the chart's own row unlit while the table row lights.

The one code-level asymmetry that produces exactly that is
`wbs-table.tsx`'s `pointedAt = tablePointedRow ?? pointedFromChart`: a **stale**
table reading silently outranks a live chart one, so the chart would light the
row the pointer used to be on while `data-row-lit` — which reads
`pointedFromChart` alone — correctly lights the bar's row.

Sixteen gestures were driven in Chromium and **the two faces never disagreed**:
row→bar by `hover()` and by a single raw `mouse.move`, row→label→bar, with a
card open, bar→row→bar, a wheel scroll and a window scroll between the two, a
click-to-navigate then a hover, bar→bar, label→bar, the pointer resting on a bar
past the surface's timer, and twenty rapid round trips. Event order at the seam
was logged and is always `pointerout`/`pointerleave` **then**
`pointerover`/`pointerenter`, so the chart's two unguarded clears never fire
late. Latency was measured on a 33-row plan: 7-13ms each way.

R5 forbids shipping a guard whose removal cannot be watched, so the state
machine was left alone. **What would settle it**: what Dany had done immediately
before — clicked a bar, collapsed a branch, had a filter on, or had someone else
editing the plan at the time.

## Superseded: item 3, `picker-reopens-on-click` (done, `57cca919`)

**The code is written and every negative has been watched.** What is left is
the gate and the commit.

Uncommitted files:

- `apps/fe-01/src/components/wbs/creatable-picker.tsx` — the box opens its list
  on `click` when the list is closed, guarded on `typed === null`; the picker's
  own `+` focuses **then** clicks.
- `apps/fe-01/src/components/wbs/reference-set-field.tsx` — the strip's `+` does
  the same.
- `apps/fe-01/src/components/wbs/creatable-picker.test.tsx` — two jsdom cases.
- `apps/fe-01/e2e/reference-cells.spec.ts` — the browser case for the gesture.
- `openspec/changes/picker-reopens-on-click/` — proposal, delta spec, tasks.
  **`verify.md` is not written yet** — it is the last artifact, and it needs the
  gate's own figures.

### To finish it

```sh
git checkout change/picker-reopens-on-click
bun install                                     # if the worktree was rebased
E2E_PORT_SHIFT=1900 bunx playwright test --config apps/fe-01/playwright.config.ts
bunx nx test fe-01 && bunx nx lint fe-01 && bunx nx typecheck fe-01
bunx nx format:check --all
bunx openspec validate picker-reopens-on-click --json
```

Last measured before this handoff: **fe-01 2003 passed / 64 files**, lint 0
errors (1 pre-existing `wbs-table.tsx` `useMemo` warning, landmine #1,
deliberate), typecheck exit 0. The whole browser gate was **270 passed / 1
failed** — see the next section before believing that red.

### The cause, confirmed in Chromium before anything was changed

Three correct facts meet:

- `CreatablePicker`'s list opens from the box's `onFocus`;
- a take closes it (`setTyped(null)`, at once or once `closeWhen` is satisfied);
- a take deliberately does **not** move the focus — the list's own `mousedown`
  calls `preventDefault` precisely so the box keeps the keyboard.

So after adding a value the box holds the focus with no list under it, and a
click on an already-focused node fires no focus event. Nothing could reopen it;
the reader had to leave the cell and come back. The `+` was the same dead press,
because all it did was `focus()` a box that was already focused. Measured:
`clicking the focused add field offered nothing · Expected: 2 · Received: 0`.

One fix in the shared component, so Teams, Tags, Services and Types all get it —
which is Dany's own "it likely applies to Types, Services and Teams too".

### Watched negatives (all observed, comments already written from the output)

| Check                                  | Fault injected                        | Observed                                                                         |
| -------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| a click reopens the closed list        | the box's `onClick` deleted           | Chromium `Expected: > 0 · Received: 0`; jsdom `Unable to find … role "option"`   |
| the `+` reopens it too                 | its `click()` dropped, `focus()` kept | `the + offered nothing on a focused box · Expected: 2 · Received: 0`             |
| a click never eats a half-typed search | the `typed !== null` guard deleted    | `expected [ 'Platform', …(2) ] to deeply equal [ 'QA infra', 'Add “qa”', …(1) ]` |

## Read this before calling the last browser red a regression

The final whole-gate run reported **270 passed / 1 failed**, and the failure was
`hover-cards.spec.ts:686` `the tint moves the same way on both surfaces, in both
palettes` — **which took 26.9 minutes on its own**, against a whole-suite normal
of ~7m (that run took 35.2m). Re-run alone on a quiet machine it passes in
**2.3s**. That is the capacity-bound signature recorded in
`project_ci_has_a_browser_gate` / the 2026-08-31 handoff, not a fault in this
change — the picker touches no row tint.

A clean whole-gate run was started to confirm it and had reached 109 of 270 with
no failures when this file was written. **Finish that run before committing**, and
if it is green put both figures in `verify.md`.

## Three wrong oracles this session, worth not repeating

All three were mine, all three were caught by running the **whole** gate rather
than the new test, and all three are recorded in
`openspec/changes/picker-reopens-on-click/tasks.md` §3.

1. **`getByRole('option')` counts the toolbar's native `<select>`s.** The Mermaid
   axis and the estimate point contribute seven `<option>` elements that are in
   the document at all times. `expect.poll(optionsOpen).toBe(0)` on a closed
   list failed on `Expected: 0 · Received: 7` with nothing wrong. Scope to
   `[data-picker-list] [role="option"]`.
2. **A page-wide `[data-reference-chip=…]` wait waits for nothing.**
   `reference-cells.spec.ts`' `seed` already puts `tags[0]` on row **010**, so
   the locator matched in the first frame and the test clicked before row 020's
   write had left the browser. Passed alone, failed at case 252 of 270 on
   `Expected: 2 · Received: 3`. Scope waits to the row's own cell.
3. **The directory is global, so a literal count of what a picker offers is not
   a claim about the code.** `mobile.spec.ts` leaves `mobile e2e tag` in it, so
   the same case failed again on the same numbers with the fix working
   perfectly. Assert open-ness as `> 0` (that is what goes to zero when the fix
   is removed — watched) and assert membership **by name**.

## What items 6 and 7 need, and why they were left

Item 7 is one OpenSpec change of its own and is multi-day: `schema.ts` has **31
tables**, 6 have `created_at`, **0 have `updated_at` or `created_by`** — ~87
columns. Item 6 is its narrow case and falls out of it; building 6 alone means
revisiting every table 7 touches.

Constraints already established and not to be rediscovered:

- Forward migrations stay **additive** (blue and green share one SQLite file
  mid-swap), so the columns arrive **nullable with no default**. A `NOT NULL`
  audit column on an existing table is not additive.
- Every migration ships a `down.sql` beside its `migration.sql`.
- `updatedAt` needs a **writer discipline**, not just a column: decide once
  whether every repository sets it or a trigger does, and write that decision
  down.
- `createdBy` needs a `users` reference on tables that record no writer today.
- See `project_migration_ledger_merge_traps` for the ledger merge trap, and
  `AGENTS.md` "Migrations" for the rollback contract.

## Things about this session's environment

- The browser gate runs on **`E2E_PORT_SHIFT=1900`** (5000/5100/6100) and never
  on the shared dev server — 1800 puts fe-01 on 6000, which Chromium refuses.
- `bin/h2puni-gate.sh` exits **127** on this macOS host, as it has all session.
  Excluded and said so in every `verify.md`.
- `tool-bootstrap:test` times out on this host (pre-existing). Excluded.
- Two stray scratch specs sit in `apps/fe-01/e2e/` on `main` —
  `zz-scratch.spec.ts` and `zz-toolbar-measure.spec.ts` — and the LSP flags
  errors in both. Not this batch's, but somebody should decide whether they stay.
- Running two Playwright suites, or a suite plus a polling loop, starves this
  Mac badly enough to produce a 27-minute single case. One at a time.

## Dev

Dev is `origin/main` within a minute (ADR 0005), so **a branch cannot be shown
to Dany**. Items 1, 2, 4 and 5 reach a screen he can judge only once they land
on `main`, and every one of them is a change he said he would judge on a real
screen — see `project_dany_judges_rendered_output`.
