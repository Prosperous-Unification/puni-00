<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, 2026-08-31: **"make sure that everywhere where the work item is referenced
it is referenced by its number and its title going together like `010 - heh
hah`"**.

The Gantt has said it that way since `gantt-view`, in a function of its own
called `rowWords`, with the argument written down beside it: a chart of names
alone made the two drawings of one plan read as two plans, and the number is what
a person says out loud about a row. Nothing else in the app used it. The rest
spelled the join for themselves and disagreed about it:

- the table's tree named a row `010 Strip the walls` — a **space**;
- the Depends on card named one `010 - Strip the walls` — a **dash**;
- the toasts, the phone's modal headings and the Start card named a row by its
  **number alone**: `Deleted 020 — Cmd+Z restores`, `Priority for 010`.

Three spellings of one thing is the drift a shared function exists to end, and
the number-alone one is the ask.

## What Changes

- `rowWords` moves out of `gantt-panel.tsx` into `work-item-words.ts`, which is
  now where the app says how a work item is named. The chart keeps drawing its
  label from the two halves and re-exports the whole for its own tests.
- Every reader-facing reference goes through it: the table's `namedInTheTree`
  (which feeds every `inherited from …` sentence), `dependsLine`, the two row
  toasts, the Start cell's card, and the four modal headings on the phone.

## Non-goals

- **`aria-label`s are left alone.** They are the accessible _names of controls_,
  already scoped by the row they sit in — `Tags for 010` on a cell inside row
  010's card — and lengthening them to `Tags for 010 - Strip the walls` on every
  control of every row makes a screen reader read the row's name back on each
  one. They are also the handles ~300 tests take hold of.
- No wording is otherwise changed, and no card gains or loses a fact.

## Constraints

- An unnamed row still has a number, so the empty name keeps words of its own —
  `010 - (unnamed)` rather than `010 - `.
- One function, not two spellings: the chart's label **draws** its second half
  through `InlineMarkdown` and still **says** the whole of it in its hint, so
  both halves stay separately exported.
