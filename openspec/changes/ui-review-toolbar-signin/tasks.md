## 1. Sign-in page (F-052)

- [x] 1.1 Failing e2e `sign-in.spec.ts`: centred column at 1440, 1024 and 375; no empty error line; product line at 4.5:1 in both palettes; the refusal drawn whole
- [x] 1.2 Centre the column, add the product line, open the refusal row only with text

## 2. Toolbar end group (F-056)

- [x] 2.1 Failing e2e `toolbar-panels.spec.ts` at 1024, 1280 and 1440: one end group, contiguous, at the right edge, alone on its row
- [x] 2.2 Group Undo, Redo, Keyboard shortcuts, Export / Import and the schedule group
- [x] 2.3 Rewrite the two budget specs' control-count premise to count by role, with a watched negative

## 3. Quiet ink (F-071)

- [x] 3.1 Failing pixel e2e in `plan-table-review.spec.ts` for `+1` and `search` on a banded row, light and dark
- [x] 3.2 Add `--quiet-ink`; use it for the count and the grid's placeholders
