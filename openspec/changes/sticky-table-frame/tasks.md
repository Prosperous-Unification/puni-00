## 1. The frame

- [x] 1.1 `table-frame.ts`: the pinned columns and their widths, each offset
      the running total of the widths in front of it; the sticky heading cell;
      the frame's own style, with why its height is bounded written down.
- [x] 1.2 The `<table>` is wrapped in that frame, `borderSpacing: 0` so the
      offsets are not two pixels out per column.
- [x] 1.3 Every `<th>` sticky at the top; the pinned three sticky on both axes,
      layered over the header row and over the pinned body cells.

## 2. The pinned columns

- [x] 2.1 Name moves to third, ahead of "Depends on", so the pinned three are
      contiguous from the left edge. The order test and its justifying comment
      are rewritten, and the reversal is named in the proposal.
- [x] 2.2 Pinned cells carry an opaque background and `box-sizing: border-box`.
- [x] 2.3 The Number column's indent caps at four levels, so its content cannot
      outgrow the width the offsets are computed from.

## 3. Tests

- [x] 3.1 `table-frame.test.ts` — offsets, contiguity, opacity, layers, the
      indent cap, the frame's overflow and bound.
- [x] 3.2 `wbs-table.test.tsx` — the frame wraps the table and scrolls, every
      heading is sticky, the first three cells of a row are pinned at 0/28/196
      and the fourth is not, the pinned heading outranks both.
- [x] 3.3 Six faults injected and watched; the table is in `verify.md`.

## 4. Gate

- [x] 4.1 Format, run-many gate uncached, `openspec validate --all --json`.
- [ ] 4.2 Deploy to dev; Dany looks at it on the screen that started this.
