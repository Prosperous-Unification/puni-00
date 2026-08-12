# design — `capacity-ui`

The written source is `tmp/plan-capacity-2026-08-11.md` (plan v2, cross-reviewed
by codex and agy). This change is its **C3**, the row that reads: _the directory
input, the In-parallel column, cards, export and Gantt words_.

Six things here are decisions rather than transcription. Each is below because a
reader who met only the conclusion would re-open it.

## D1 — the deploy gate is the point of this change, not a side effect

`floorWordsOf` (`gantt-geometry.ts`) is a `switch` whose `default:` throws
`GanttDataError`, deliberately and by its own comment, _because a payload can
carry a sixth floor this build has never heard of_. C1 made `capacity` that
sixth. C2 shipped `PATCH /api/teams/:id/size`, which is the two HTTP requests it
takes to make be-01 emit it.

Between C2's merge and this change, therefore, every plan whose team is sized
and contended renders `GanttFaultBoundary`'s fallback where its Gantt should be.
Not a crash — the boundary works, the editor is untouched, and that is what the
boundary is for — but the chart is gone for a supported plan.

`capacity-engine/design.md`'s "Batch sequencing" section called this before
either change merged, and C2's `verify.md` carries it as a landmine with a
be-01-side test (`puts a capacity floor on the wire, which nothing this change
ships can draw`). `LLM_README.md` has held the gate armed since. **The mandatory
watched red of this change is the other side of that test**, in
`gantt-panel.test.tsx`: a plan whose slice is floored by `capacity` draws its
chart, and striking the `case 'capacity':` arm from `floorWordsOf` puts the
whole chart into the boundary. See `verify.md`.

## D2 — the Team cell, the bars, the cards and the export all read `effectiveTeamOf`

C1 put the inheritance rule in `libs/domain/src/effective-team.ts` for this
change's sake: _"it lives in `libs/domain` rather than in be-01 because C3's
four renderers read it too, and a second copy is the one that drifts"_. All four
now do, through one function computed per render from the tree — plus be-01's
scheduler adapter and its team-removal usage, which makes six consumers of one
reading.

The alternative was to show each row's **stored** label, which is what fe-01 did
until this change. It is defensible and it is wrong here: a leaf under a
labelled parent carries no label of its own, and its dates came out of that
parent's pool. Showing nothing there leaves "why did this row move when somebody
edited a team's number" with no answer anywhere in the tool.

So an inherited label is shown **and marked**: `↳ Name` in the picker's own
placeholder ink in the table (a placeholder already means "shown, not stored",
and it is gone the moment somebody types a label of this row's own), the same
glyph on a card, and `Name (inherited from 010 Backend)` in the export, where
there is room for the sentence. The `title` names the source row on every face.

**No write copies a label down.** This is a reading, recomputed every render.

## D3 — the In-parallel column is 32px, and C0 is why

The plan drew a 48px column. `capacity-engine`'s C0 measurement — recorded in
that change's `verify.md`, and constraining this change rather than that one —
found a 48px column overflowing the 1280px folded table by 19px.

The 32 is `∥` for a heading and three right-aligned digits. 1000 is C2's
ceiling, so `999` is the widest value any plan can hold; a four-digit
parallelism cannot be stored. `e2e/layout.spec.ts` measures `999` in the cell in
Chromium and compares it against the declared width — 30px needed, 32 declared —
and the negative was watched at 24.

Where the 32px came from is the second half of the decision. The folded table
had none to spare, so it came out of the **date columns**, which had measured
slack nobody had taken: `spreadsheet-geometry` took the body type from 16px to
13px and left the columns deliberately over-wide, its own stated non-goal. The
`DAY_ENVELOPE` measures 94.02px at 13px (86.02 of text, 8 of chrome, Chromium on
h2puni), against a declared 114 — 20px of slack in each of two columns.

`DATE_COLUMN_WIDTH` is now **98**, which clears the envelope by 3.98px and is
still the browser's judgement rather than an argument: the assertion fails at 94
(`needs 95`) and passes at 95. Two columns × 16px recovered = the 32px the new
column takes, so **the fixed-column total is unchanged at 827px** and the
"fits every laptop width with the roles folded" equation is arithmetically the
same as before this change.

## D4 — three cell states, because three different things are true

- **A parent** holds no slices, so `slicesOf` skips it and a number on it
  schedules nothing. C2 answers 400 `has_children`. The cell is **printed, not
  editable** — offering an edit be-01 refuses is worse than not offering it —
  and it still shows an inert number a leaf was given before it gained a child,
  which C2 deliberately leaves standing.
- **A named assignee** collapses the item to width 1 whatever the column says
  (C1's D3: one human cannot work beside themselves). The number is still stored
  and applies the moment the assignment goes, so it is shown **muted** with a
  `title` saying so, rather than hidden or blanked.
- **Anything else** is an ordinary editable number.

Rejected: hiding the number in either inert case. A reader who typed 3 and finds
the cell empty concludes the write was lost.

## D5 — the export carries what was asked for **and** what was placed

`People at once` is the stored `maxParallel`. `Ran at` is the widths be-01
actually scheduled, read off the slices.

Both, because neither answers the other's question, and the gap between them is
the only explanation a CSV can offer for a six-day estimate spanning two days.
Width is decided per slice, so `Ran at` is a **set** — a row of `maxParallel: 3`
with one phase assigned to somebody reads `1, 3`. Printing only the largest
would claim the whole row ran three-up; only the smallest, that it never did.

Empty where the plan has no slices at all, which is the same absence the dates
report as `—`. A `1` there would be the document inventing a placement, and it
is the state every export taken before the first chart read is in.

The header block gains a **People** line saying the figures are effort. Without
it a reader handed the table alone has no reading of a 6-day row spanning 2 days
except that the export is wrong.

## D6 — validation stays at be-01's boundary, and the two exceptions are named

Both new boxes send what was typed: `0`, `-1`, `1.5` and `1001` all go and are
answered on. The rule about what these numbers may be lives in
`capacity-write-paths` at be-01's boundary, and a second copy in a React
component is a rule free to disagree with it. This is the Prio column's own
bargain, one column back.

Two things the boxes do decide, because be-01 cannot see either:

1. **An empty box.** `Number('')` is `0`, which is a _refusal_ — and a width of
   0 is `Infinity` days. An emptied In-parallel cell means one at a time
   (`maxParallel: null`, a reset to 1); an emptied size box means _unstated_
   (`size: null`, which constrains nothing). Both watched.
2. **A non-finite draft.** JSON has no literal for `NaN` or `Infinity`, so a
   typed `1e999` arrives as `null` — which in both routes is the reset. Sending
   it would silently put a widened row back to 1, or unstate a sized team, while
   looking to the reader like a refusal. Refused locally instead. Both watched.

The refusal sentences are the page's, not the wire's: `directoryRefusalSentence`
gains an arm for be-01's floor code and reads the **ceiling out of the code
itself** (`size_must_be_at_most_` + the number), because a literal 1000 here
would be a second copy of `MOST_PEOPLE_AT_ONCE` free to drift.

## Plan versus reality

| the plan said                                                     | what is true                                                                                                               | what shipped                                                                                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A 48px In-parallel column                                         | C0 measured that overflowing the folded 1280 table by 19px                                                                 | 32px, with the room taken out of the date columns' measured slack. D3.                                                                      |
| The directory input is a size **and** a members count             | The two are different facts and neither implies the other — a team of five nobody has sized bounds nothing                 | Both shown, side by side, and the box's `title` says which is which.                                                                        |
| fe-01 shows the stored team label                                 | A leaf's dates come out of an ancestor's pool                                                                              | The **effective** team on all four faces, marked as inherited and naming the source row. D2.                                                |
| C3 would fix `gantt-geometry.test.ts`'s invented sixth floor name | `'resourceCalendar' as BindingFloor` was a seventh name nobody sends; the real sixth is `capacity` (C2 cross-review, P3-1) | Fixed in the first commit of this branch: the unknown floor is now plainly invented (`phaseOfTheMoon`) and `capacity` has tests of its own. |
| The export gains a parallelism column                             | One column cannot say both what was asked for and what was placed, and width is per **slice**                              | Two columns, `Ran at` a set. D5.                                                                                                            |
| Nothing about the cards                                           | A phone is the only face some readers have, and the plan's own C3 row names "cards"                                        | Team (inherited marked) and a parallelism line, both read off the row.                                                                      |

## What this change does **not** do

- **No optimism anywhere.** Every write refetches; a refused change leaves the
  screen as it was with the refusal on it. That is both pages' existing rule.
- **No undo for the directory.** Nothing about the directory is journalled;
  C2 said the same.
- **No per-project team allocation.** C1 built the seam and this change does not
  use it. A size is global, so two projects labelled `Platform` each get its full
  size — the stated cost, recorded in C1's D6.
- **The directory concurrency test C2 owed is still owed.** C2's `verify.md`
  names it as "C3's half": one editor's response held in flight, a peer write
  landing, the older response refused the chance to overwrite the newer number
  on screen. This change does not add it — the directory page is non-optimistic
  and re-reads after every write, so the shape the plan described does not exist
  on it. Recorded rather than quietly dropped.
