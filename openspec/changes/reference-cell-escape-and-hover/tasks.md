<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The editor can be left

- [x] 1.1 `CreatablePicker`'s box is `readOnly` while a write is in flight
      rather than `disabled`, so the focus survives the take — test:
      `e2e/reference-cell-panel.spec.ts` `a landed take keeps the focus, and
the panel closes when the focus leaves`; negative: `readOnly` put back to
      `disabled`, watched failing on `Expected: "Tags for 020" / Received:
"<none>"`, and — with that line lifted out of the way — on `Expected:
false / Received: true` for the panel itself.
- [x] 1.2 The two jsdom cases that asserted the box was `disabled` mid-write
      restate the same claim as `readonly` + `aria-busy`, in
      `reference-set-field.test.tsx`.
- [x] 1.3 Escape closes an open list and, with the list already closed, leaves
      the box — test: `escape closes the list, and escape again leaves the
cell`; negative: the `blur()` branch deleted, watched failing on
      `Expected: "<none>" / Received: "Tags for 020"`.

## 2. The card

- [x] 2.1 `referenceSetLines` builds the card's lines: stated members first,
      carried ones naming their row, and the overriding dimension's reading only
      while the row states none of its own — test: three cases in
      `reference-set-field.test.tsx`; negative: the `own.length === 0 &&` guard
      dropped, watched failing on `↳ Core` drawn under a row stating `Platform`.
- [x] 2.2 `ReferenceSetStrip` opens a `HoverCard` from its anchor while the
      pointer is on a resting cell that has something to say — tests: `a
clipped reference cell says its whole set on hover` and `the card names
the row an inherited tag was written on`; negatives: the `{carded && …}`
      block deleted, watched failing on `Expected: visible … element(s) not
found`; and the carried line's `↳ … — from …` dropped, watched failing
      on `Set { - "↳ Review — from 010 Reference 010", … + "Review", … }`.
- [x] 2.3 The card stands down for its own open editor — test: `the card keeps
out of the way of the open editor`; negative: `carded` widened to
      `pointed && lines.length > 0`, watched failing on `Expected: 0 /
Received: 1`.

## 3. The Types cell

- [x] 3.1 `type` joins `POPOVER_COLUMNS` — test: `the Types cell offers what is
typed into it, on top of the row below`; negative: `'type'` taken back
      out, watched failing on `Expected: "Add “Bug”" / Received: "Types for
010.1"`.
- [x] 3.2 `types-cell.spec.ts`'s clip case reads the rest clip where it now
      lives — the strip, not the `<td>` — and its height case is measured at
      rest, which is what makes the `flex-wrap: wrap` negative visible for the
      first time. Both faults watched; a third, a paint probe that passed with
      the fault in, was deleted rather than shipped. See `verify.md`.

## 4. Gate

- [x] 4.1 `bunx nx run fe-01:typecheck` (passed), `fe-01:test` in the detached
      worktree where this change is the only diff (1954 passed, 61 files), and
      `eslint` over the five files this change touches (clean). The shared
      checkout's own `test` and `lint` are red on a neighbouring agent's
      in-flight work; every failure is named in `verify.md` and none is this
      change's.
- [x] 4.2 `bunx openspec validate reference-cell-escape-and-hover`.
- [x] 4.3 The **whole** `CI=1` Playwright gate on shifted ports — 251 passed,
      0 failed, 1 pre-existing `test.fixme`. Not the filtered run:
      `linked-row-hover`'s lesson is that a change to a shared component has no
      business believing one, and the first whole run is what found
      `types-cell.spec.ts` asserting the very `<td>` clip slice 3.1 lifts.
- [ ] 4.4 Dany looks at it in Chrome.
