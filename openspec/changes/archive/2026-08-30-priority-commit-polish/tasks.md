<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. Enter saves the Prio cell

- [x] 1.1 `wbs-table.tsx`: the priority column's `onKeyDown` answers a bare
      Enter with `preventDefault` and `flushCell(e.currentTarget)`, before the
      four routing calls and after asking about every modifier, so the chord is
      still `onCommandKey`'s and the caret does not move. Tests in
      `wbs-table.test.tsx`, both watched failing first:
      `sends what was typed on Enter, without waiting for the cell to be left`,
      `sends one request for a priority entered with Enter and then left`.
      Negatives: the branch absent, and the flush written as a direct
      `setPriority` call that records no submission — both in verify.md's
      failure-proof table with the failures they produced.

- [x] 1.2 The modifier guard's own negative:
      `leaves Ctrl/⌘ + Enter to the chord, which saves and moves on`, watched
      failing with the four modifier tests dropped from the branch.

- [x] 1.3 `keyboard-bindings.ts`: an `Editing / Enter in Prio` entry,
      `TABLE_ONLY` because the cards renderer has no Prio cell, with the two
      tests from 1.1 named in `keyboard-cheat-sheet.test.tsx`'s `PROVEN_BY`.
      The existing `Editing / Enter` entry — Enter-is-a-newline,
      `EITHER_RENDERER` — is unchanged.

## 2. The newest refused draft is the one on screen

- [x] 2.1 `live-editing.ts`: `LiveField.submit` drops this cell's entry in
      `heldRefusals` synchronously, after rule 5's dedup and before the send,
      so the render a client-side refusal's toast causes cannot restore a
      superseded draft through `takeNode`. Two tests, both watched failing
      first — the field-level fault with both patches parked, in
      `live-editing.test.tsx`, and the live Prio gesture in
      `wbs-table.test.tsx`. Their names and the failures they produced are in
      verify.md's failure-proof table. Negative: the delete removed.

- [x] 2.2 The abandon path stays as it was: the Prio test ends by emptying the
      box and asserting the held draft is gone. That is the existing `leave()`
      delete, not a new check, and verify.md says so rather than claiming a
      proof for it.
