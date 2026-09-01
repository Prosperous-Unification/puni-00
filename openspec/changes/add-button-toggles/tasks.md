<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The reference strip's `+`

- [x] 1.1 `reference-set-field.tsx`'s `+` reads the box's own `aria-expanded`
      and, when it says the list is open, blurs the box instead of focusing and
      clicking it. `aria-expanded` and **not** `editing`, and not
      `document.activeElement`: both are "the focus is in this cell", which is
      true in the state `picker-reopens-on-click` was written for — the moment
      after a value is taken, box focused and list closed — and closing there is
      the opposite of what that change fixed.
      Test: `reference-set-field.test.tsx` — `a second press of the add button
closes the list`, and `a press after a value is taken still opens it`.
      Negative: the `aria-expanded` branch removed; watched failing on the list
      still open after the second press.

## 2. The Depends on cell's `+`

- [x] 2.1 `wbs-table.tsx`'s deps `+` reads the cell's own `picker` state, which
      is what that cell has instead of a `CreatablePicker`, and closes it rather
      than focusing the box when it names this row.
      Test: `wbs-table.test.tsx` — `a second press of the deps add button closes
the picker`.
      Negative: the open branch removed; watched failing on the picker still
      naming the row.

## 3. The browser says the focus never lands on the button

- [x] 3.1 Both presses leave the focus off the `+`. A browser and not jsdom: a
      press moving the focus is a **default action** and jsdom performs none —
      `AGENTS.md`'s R5 #14 and #17 are this exact seam, and both buttons already
      carry a `preventDefault` written against it.
      Test: `e2e/reference-cells.spec.ts` — `the add button toggles without ever
taking the keyboard`.
      Negative: the `onMouseDown` `preventDefault` removed; watched failing on
      the button holding the focus.

## 4. Words

- [x] 4.1 Both buttons' JSDoc carries the rule and why the predicate is the list
      rather than the focus, naming `picker-reopens-on-click`. `CONTEXT.md`'s
      **Reference cell** entry says the `+` toggles.

## 5. Gate

- [x] 5.1 fe-01's jsdom suite, the whole browser gate on shifted ports, lint,
      typecheck, format, `openspec validate --all`. Results and the
      failure-proof table in `verify.md`.
