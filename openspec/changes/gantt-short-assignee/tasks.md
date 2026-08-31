<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. One short name, one function

- [x] 1.1 `gantt-panel.tsx`'s own `initialsOf` is deleted and the chart imports
      `initials.ts`' — the folded step cell's. The two disagreed on every
      one-word name, which is nearly every person this app has (`vadym` → `V`
      here, `VA` there). Test: `gantt-panel.test.tsx` `names a person the way the
table names them, from one function`, which asserts against `initialsOf`
      itself rather than against a literal — a literal here would be a third copy
      of the rule. Negative: the chart's copy restored, watched failing on
      `expected 'V' to be 'VA'` and on four rendered `K · strip - strip` cases.

## 2. Always the short name

- [x] 2.1 `barLabelFor` answers the short name at every width, and null only
      where nothing fits or nobody is on it. Test: `names its assignee by their
short name at every width a bar can be`; negative: the old whole-name
      candidate restored, watched failing on `expected 'Kat Bloom' to be 'KB'`
      plus the four rendered cases — 6 failed | 281 passed, with every narrow bar
      still green, which is the shape of the fault.
- [x] 2.2 The blank-name guard is load-bearing now that `initialsOf` **throws**
      rather than answering `''`. Test: the `'   '` case in the same test;
      negative: `personName.trim() === ''` deleted, watched failing on `an
assignee with no name cannot be initialled` — 1 failed | 159 passed.
- [x] 2.3 `assumedLabelFor` drops its whole-name candidate for the same reason
      and keeps the bare `?` as the fallback. Covered by the four rendered cases
      and by the existing assumed-bar cases, all green.

## 3. Gate

- [x] 3.1 fe-01's jsdom suite, the whole browser gate, lint, typecheck, format.
      Results and the one thing **not** covered in a browser are in `verify.md`.
