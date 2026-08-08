# Verification

## The gate

Run on h1claw, 2026-08-08, on `change/keys-notes-and-fit`.

```
$ bunx nx format:check --all
(no files listed, exit 0)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      fe-01 (vitest)   24 files   546 pass  0 fail   (23 files / 507 before this change, +39)

$ bunx nx run-many -t test --projects=fe-01 --skip-nx-cache
      Test Files  24 passed (24)
      Tests       546 passed (546)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
{"items": 37, "passed": 37, "failed": 0}
```

The 39 new tests: **19** in the new `name-notes.test.ts`, **13** in
`wbs-table.test.tsx`, **6** in `cell-navigation.test.ts` and **1** in
`table-frame.test.ts`. Nine existing tests were rewritten rather than deleted —
the walk of a row's fields, the grid's edges, the date cell's neighbours, the
markdown-on-hover pair, the empty-row veto, the popover-clip test, the
column-order test and the cell-chrome loop all lost a Notes cell and gained
whatever now sits where it did. One was replaced: `grows the notes box while it
is being written in, and shrinks after` was about a box that no longer exists,
and `makes room for a note written under the name, focus or no focus` asks the
same question of the box the note is written in now.

**The two Playwright tests in `apps/fe-01/e2e/layout.spec.ts` have not been
run.** There is no browser on this machine. They are written, they are
type-checked and linted by `fe-01:typecheck` and `fe-01:lint` through
`tsconfig.e2e.json`, and their faults are recorded below as **expectations, not
observations** — the same wording is in the spec's own footer so nobody reads it
as evidence.

## The checks, and the faults that broke them

Every row below was watched failing with the fault in place and passing again
with it removed, one fault at a time, on h1claw on 2026-08-08.

### The commit — who wins when two people are in one row (`wbs-table.test.tsx`)

| Check                                                          | Fault injected                                                                            | What the run reported                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The diff's third point is the focus-time baseline, not the row | `was` re-pointed at the current row props, `splitNameCell(composeNameCell(…))` off `flat` | **2 failed** — `keeps a peer’s note when the name is what was being typed` on `expected 'measure twice' to be 'their note'`, and `keeps a peer’s name when the notes are what was being typed` on `expected 'Strip' to be 'Rewire the shed'` |
| Only the name that changed is sent                             | `now.name === was.name ? {} : …` replaced with `{ name: now.name }`                       | **1 failed** — `sends only the field that changed`, on a patch carrying a name nobody retyped                                                                                                                                                |
| Only the notes that changed are sent                           | the same, for `now.notes`                                                                 | **1 failed** — the same test, on the other half: `expected [['w1', { …(2) }]] to deeply equal [['w1', …(1)]]`                                                                                                                                |
| A note stored with `\r\n` is not rewritten by a click-through  | `normalizeNewlines` dropped from both sides of the diff                                   | **1 failed** — `does not rewrite a note that was stored with Windows line endings`, on `expected [['w1', …(1)]] to deeply equal []`                                                                                                          |
| An empty diff asks be-01 for nothing                           | the `Object.keys(patch).length === 0` return deleted                                      | **1 failed** — the same test, on `expected [['w1', {}]] to deeply equal []`                                                                                                                                                                  |

Both peer tests go through the real render path: a subscription is opened, the
peer's edit is written into the fake's row, `notify()` delivers it as a refetch
while the focus is held in the textarea, the held-back value is asserted on
screen, and only then does the blur happen. Nothing reaches into the component.

### The arrows, and which box owns Up and Down

| Check                                                    | Fault injected                                                       | What the run reported                                                                                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A multiline box keeps Up and Down until the caret is out | the `if (caret.multiline)` block deleted from `nextCell`             | **1 failed** — `keeps ↑ and ↓ in the name until the caret has run out of text`, on `expected false to be true`: the key taken and the focus gone from a note being read |
| …and only a multiline box does                           | `caretOf`'s `input instanceof HTMLTextAreaElement` hard-coded `true` | **1 failed** — `still walks a column of one-line boxes from any caret position`, on `expected true to be false`                                                         |
| …and every multiline box does                            | the same hard-coded `false`                                          | **1 failed** — `keeps ↑ and ↓ in the name until the caret has run out of text` again, on `expected false to be true`                                                    |

### The empty-row veto, both halves

| Check                               | Fault injected                            | What the run reported                                                                                                     |
| ----------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A committed note vetoes the removal | the `row.notes === ''` conjunct dropped   | **1 failed** — `a note that has not been deleted yet still vetoes the removal`, on `expected [['w1']] to deeply equal []` |
| A note in the box vetoes it too     | the `input.value === ''` conjunct dropped | **1 failed** — `anything the item holds vetoes the backspace removal`, on `expected [['w3']] to deeply equal []`          |

The second conjunct was already there and is not redundant, which is why it has
a row: emptying the box is not the same as having emptied the work item, and
the blur that would commit the emptying has not happened.

### The column that went, and the cell that took its popover

| Check                                                     | Fault injected                               | What the run reported                                                                                                                                                                         |
| --------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Name cell does not clip the preview that hangs off it | `'name'` dropped from `POPOVER_COLUMNS`      | **2 failed** — `does not clip the cells whose popovers open over the rows` and `gives every cell the chrome its declared width is measured with`, both on `expected 'hidden' to be 'visible'` |
| No width is left behind for a column nobody renders       | `['notes', 260]` put back in `COLUMN_WIDTHS` | **1 failed** — `has no width for a Notes column, because there is no Notes column`, on `expected function to throw an error, but it didn't`                                                   |

### The contract module

All 19 tests in `name-notes.test.ts` were watched failing before the module
existed — `Failed to resolve import "./name-notes"`. They pin the semantics the
plan's reviewers asked to have chosen rather than guarded away: delete-line-1
renames, an empty first line commits no name, `'name\n'` is no notes at all,
and a blank line with something under it stays inside the notes.

### The browser spec — expectations, not observations

Written on a machine with no browser. Both faults are named in the footer of
`apps/fe-01/e2e/layout.spec.ts` as instructions for the h2puni run, and neither
has been seen to fail:

- **Fault G** — `'name'` dropped from `POPOVER_COLUMNS`. Expected: `opens the
notes preview out past the bottom of the name cell` fails on
  `ownsPixelBelow`, naming what shows through instead. The overhang assertion
  is expected _not_ to fail, for the reason fault D already recorded:
  `getBoundingClientRect` reports a clipped box at its full unclipped size.
- **Fault H** — the caret rule written against logical lines rather than the
  ends of the value, which is what v1 of the plan proposed. Expected: `moves the
caret through a wrapped name before it leaves the row` fails at
  `await expect(name).toBeFocused()`, the row above having taken the focus while
  the caret still had visual lines to climb.

Fault D's second observation — `4px below the notes cell is <textarea> in the
notes column, not the preview` — was made on 2026-08-08 while a Notes column
still existed. The preview hangs off the Name cell now and that fault has not
been re-run against it; the footer says so where the observation is recorded.

## What is proven, and by what

**Proven by the repo gate, on this machine:** the compose/split/normalize
contract including every destructive edit it makes possible; that the Name cell
shows both fields and writes back only the changed ones, in one request, diffed
against what the box was showing rather than against the row; that a peer's
edit to either field survives a local edit to the other, delivered through the
real render path; that a refused patch changes neither field; that ↑ and ↓ stay
in the Name cell until the caret runs out and leave from the extremes, while
one-line cells are untouched; that a note vetoes the empty-row Backspace from
either side; that the Notes column is gone from the header row, the tab walk,
the width table and the clip exemptions, and that the Name cell took the
exemption over. 546 fe-01 tests, the fault tables above.

**Checked rather than assumed:** the cheat sheet's `PROVEN_BY` map. The arrows
entry gained a sentence about the Name cell and the Backspace entry gained a
clause, so both new arrow tests were added to the map and
`keyboard-cheat-sheet.test.tsx` re-run — 21 passed. No named test left
`wbs-table.test.tsx`; the ones this change rewrote kept their names, which was
checked rather than hoped for.

**Not verified here:** anything needing a rendering engine. That the preview is
really unclipped in pixels now that it hangs off a _pinned_ column — a
combination this table has never had — and that ↑ in a wrapped name moves the
caret rather than the focus. Both are the browser spec's, and the browser spec
has not run. h1claw has no browser and does not build.

**Deliberately not covered:** typing a newline. Enter is still "new work item"
in this change — the chord that makes it a newline is `command-keys`, section 4
of the plan — so a note is written here by pasting one, by editing one that
exists, or by an API client. Every test in this change writes the two lines as
one `change` event, which is what a paste is.

## One thing the unit tests cannot say

`does not rewrite a note that was stored with Windows line endings` is the only
place `normalizeNewlines` earns its place on the production path, and it gets
there through be-01 rather than through the keyboard: a `<textarea>` normalises
what is assigned to it, so nothing typed or pasted into this box can hold a
`\r`. jsdom implements that normalisation, which is how the test can set up the
disagreement at all — but it means the paste case the plan named as the vector
is one neither jsdom nor a browser can produce. The vector is data from another
client, and that is what the test uses.
