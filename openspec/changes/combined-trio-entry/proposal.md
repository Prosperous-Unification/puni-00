# One cell takes the whole trio

## Why

Both UX reviewers put this in their top three. Estimating a row today means
unfolding a role, then type-tab-type-tab-type across three boxes — and folding
back, because a role costs five columns and `role-columns-fold` folded them
for the good reason that the dates were off the screen. The loop a whole
estimating session is made of is "three numbers for this row, next row".

The folded column already has exactly one cell per row and role: be-01's final
figure, read-only. Letting it take `2/3/8` puts the whole trio where the eye
already is, with the role still folded and the dates still on screen.

## What Changes

**The folded role column's cell is editable on leaf rows**

- It shows be-01's computed final figure at rest and takes shorthand when
  typed into: `2/3/8`, spaces allowed around the numbers, decimals allowed,
  and one number meaning all three. Leaving the cell sends **one** atomic
  `setEstimate`. Its content is selected on arrival, because there is no
  sensible edit to make inside a computed `4`.
- A single `5` is the estimator typing three equal numbers in one keystroke
  sequence. It is not the tool inventing two.
- Unparseable, negative, wrong count, out of order: nothing is sent, the cell
  is marked `aria-invalid` and red, the reason is in its title, and what was
  typed stays as a draft. Out of order is a complaint, never a reorder — this
  is `estimate-draft.ts`'s existing discipline, extended.
- Emptying it against a stored trio clears it through `clearEstimate`
  (`clear-estimate`). Emptying it against nothing stored asks for nothing.
- Unfolded, the cell goes back to being the read-only figure and the three
  boxes are the editor. Two editors of one trio side by side is two places to
  disagree.
- **One draft per row and role, last edit wins.** A folded entry drops what the
  boxes were holding unsent, and a box drops what the folded cell was. Nothing
  is translated between them.

## Non-Goals

- **No shorthand in the three boxes.** They take one number each, as now.
- **No parsing `2-3-8`, `2,3,8` or `2 3 8`.** One separator, learnable, and a
  comma is a decimal point in half of Europe.
- **No editing a parent's figure.** It is a sum of what is below it.
- **No autocomplete, history or unit suffixes.** Days, as everywhere else.
