# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      fe-01 (vitest)     264 pass  0 fail  (was 236; 28 new)
      be-01 (bun:test)   287 pass  0 fail  (unchanged — nothing server-side moved)
      libs/domain         22 pass  0 fail  (unchanged)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
24 items, 24 passed, 0 failed — combined-trio-entry valid
```

The 28 new tests: 12 in `estimate-draft.test.ts` for `parseTrioShorthand`, and
16 in `wbs-table.test.tsx` under `one cell for the whole trio`. The 236
baseline is what the same command printed on this branch before the change.

## The shape chosen for the cell, and why it is honest

The folded role column's cell is a plain `CellInput` that **shows be-01's
computed final figure at rest and takes trio shorthand when it is typed into**.
It is the only cell in the table whose resting value is not what typing into it
means, and the alternatives were worse:

- _Three cramped boxes in one column_ is the unfolded view, narrower — it does
  not save the width the fold exists to save.
- _A figure with an edit affordance_ is a click before every row, in the one
  loop that is all typing.
- _Showing the trio `2/3/8` at rest instead of the figure_ loses the number a
  plan is read by, which is precisely what `role-columns-fold` kept.

Two things make the asymmetry safe rather than a trap. `CellInput`'s
commit-on-leave already sends **only what differs from what the cell was last
showing**, so focusing a cell reading `4` and leaving it writes nothing — the
`4/4/4` misreading cannot happen by accident. And the content is selected on
focus, because there is no meaningful edit to make _inside_ a computed `4`; a
caret dropped into it is how `2/3/8` becomes `2/3/84`. The title carries the
syntax on every cell, and the placeholder `o/r/p` shows on the empty ones.

The cell is only there while the role is **folded**. Unfolded, it is the
read-only figure again and the three boxes are the editor. One trio never has
two editors on screen at once, which is what keeps "last edit wins" a rule
about time rather than about which of two visible boxes to believe.

## The interplay rule

**One pending draft per work item and role, whichever way it was typed. Last
edit wins, and nothing is translated between the two forms.**

Typing into the folded cell drops the three boxes' drafts for that trio;
typing into a box drops the folded cell's. The refused `8/3/2` is not
unpacked into three boxes — the parser's output for text that was refused is
not three numbers anybody typed — and a `7` sitting in the optimistic box is
not rendered back as shorthand.

The complaint follows the same precedence: the folded cell reports its own
pending entry if there is one, and otherwise the boxes' `trioProblem`, so
`role-columns-fold`'s "a folded role cannot hide a complaint" still holds
through the new input (`aria-invalid`, red, reason in the title) and through
the `!` marker on the figure beside it.

This is only observable when the newer entry is **refused** — a successful
write drops every draft for that trio anyway — so both interplay tests are
built around a refused entry. The first drafts of them passed with the rule
deleted; that is recorded in the table below as the reason they were rewritten.

## The checks, and the faults that broke them

Every fault was injected, run, and reverted. Counts in the last column are
what the run printed for the file or the `components/wbs` subset named.

| Check                                                              | Fault injected                                                                  | What the run reported                                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Out of order is refused, never sorted (`estimate-draft.ts`)        | returned `[first, second, third].sort(...)` as the trio                         | 2 failed: `complains about an out-of-order trio instead of sorting it`, `refuses exactly what the three boxes refuse`. Restored: 22 pass                       |
| Three numbers, or one — never two (`estimate-draft.ts`)            | `if (parts.length === 2) parts.push(parts[1])`                                  | 2 failed: `refuses a count that is neither one number nor three` and `sends nothing for two numbers where three were needed`. Restored: 229 pass               |
| A refused entry is held as a draft (`wbs-table.tsx`)               | `setDrafts` in `commitCombinedEstimate` reduced to `{ ...current }`             | 4 failed, including `keeps a refused entry through somebody else’s refetch` — the correction vanished on the next refetch. Restored: 229 pass                  |
| Last edit wins: folded over boxes (`wbs-table.tsx`)                | the `dropDrafts` of the three point keys removed                                | 1 failed: `lets a folded entry replace what the boxes were holding` — the box still held a `7` nobody could see. Restored: 230 pass                            |
| Last edit wins: box over folded (`wbs-table.tsx`)                  | the `dropDrafts` of the combined key removed from `commitEstimate`              | 1 failed: `lets a box replace what the folded cell was holding` — the refused `8/3/2` came back over the boxes' own complaint. Restored: 230 pass              |
| A written trio forgets **every** draft of itself (`wbs-table.tsx`) | the combined key dropped from `estimateDraftKeys`                               | 2 failed: `goes back to showing be-01’s final figure once the trio lands`, `leaves a parent’s rolled-up figure to be read, not typed into`. Restored: 230 pass |
| Emptying clears only against a stored trio (`wbs-table.tsx`)       | the `hasOwn(row.estimates, roleId)` guard inverted                              | 2 failed at once: `clears the stored trio when the cell is emptied` and `asks for nothing when a cell with no estimate is emptied`. Restored: 230 pass         |
| The cell is in the keyboard grid (`wbs-table.tsx`)                 | `data-cell` dropped from the new input                                          | 1 failed: `is a cell of the keyboard grid, so a column can be typed down` — Down went nowhere. Restored: 230 pass                                              |
| A folded role cannot hide the boxes' complaint (`wbs-table.tsx`)   | `combinedProblem` returning null instead of `trioProblemFor(...)` when no draft | 3 failed, including `role-columns-fold`'s own `a folded role cannot hide a complaint`. Restored: 230 pass                                                      |

## Two tests that could not fail, caught by the injection pass

The first version of the interplay tests typed a **valid** trio last — box
`7`, then `2/3/10` in the folded cell — and asserted the box afterwards read
`2`. Both directions passed with both `dropDrafts` calls deleted, because a
successful write calls `forgetEstimateDrafts` and clears all four keys anyway.
The rule was never under test; the cleanup was.

Rewritten so the last entry is one that is **refused** (`8/3/2` in one
direction, a lone `1` in a box in the other), each now fails with its own
`dropDrafts` removed and passes with it — rows four and five above. Same class
as the two 2026-08-06 entries in `AGENTS.md`: a test guarding a real behaviour
that could not see it break. It did not leave this branch.

## What is not watched here

- **The browser.** jsdom fires `change` and `blur` and asserts what
  `ProjectApi` was asked for. Nobody has typed `2/3/8` into a real cell,
  watched the select-on-focus behave, or seen whether the `o/r/p` placeholder
  reads as a hint or as clutter across a table of unestimated rows. Standing
  browser gap; `tasks.md` 4.3 is open.
- **Whether the shorthand is discoverable at all.** The syntax lives in the
  cell's `title` and its placeholder. Whether anyone finds it without being
  told is Dany's screen, not a test.
- **Two peers.** The write is the same `setEstimate`/`clearEstimate` the boxes
  send, so the announce path is unchanged and was not re-exercised.
- **Dev deploy.** Not deployed. Work stops at the gate, per the prod-phase rule.

## Decisions worth arguing with

1. **`5` means `5/5/5`.** It is one keystroke sequence meaning one trio, said
   by the estimator — not the tool filling two boxes, which is what the old
   `keepOrdered` did and what this table was rewritten to stop. The line is:
   the tool never supplies a figure for text that says nothing about it. `5`
   says something about all three. `2/3` says nothing about the third, and is
   refused.
2. **Only `/` separates.** `2 3 8` and `2,3,8` are refused. A comma is a
   decimal point in half of Europe, and a space is what people leave around
   the numbers rather than between them (`2 / 3 / 8` is accepted).
3. **The combined cell is folded-only.** Showing it beside the unfolded boxes
   would put two editors of one trio on screen, and "last edit wins" would
   then need a story about which visible box is real.
4. **The draft is the text, not the parse.** A refused `8/3/2` stays `8/3/2`;
   it is never unpacked into boxes and never repaired. The corollary is that
   folding while a box holds a half-typed trio shows an empty cell with a red
   `!` rather than the half-trio itself — the boxes' complaint reaches the
   folded column, but their partial content does not.
