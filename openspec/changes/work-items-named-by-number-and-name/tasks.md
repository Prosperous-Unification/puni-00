<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. One function for the join

- [x] 1.1 `rowWords` and its two halves move out of `gantt-panel.tsx` into
      `work-item-words.ts`. The chart re-exports `rowWords`, because
      `gantt-panel.test.tsx` imports it from there and the chart is still the
      place the label is drawn.

## 2. Every reference goes through it

- [x] 2.1 `namedInTheTree` in `wbs-table.tsx`, which was `${number} ${name}` — a
      space — and feeds every `inherited from …` sentence in the table and the
      cards.
- [x] 2.2 `dependsLine` in `depends-card.tsx`, which was already `${number} -
${name}` and is now the same function as the rest rather than a second
      spelling that happens to agree.
- [x] 2.3 The two row toasts and the Start cell's card in `wbs-table.tsx`, and
      the four sheet headings in `plan-cards.tsx` — all of which named a row by
      its number alone, which is the ask.

## 3. The oracles follow

- [x] 3.1 The two toasts are asserted by `toContainEqual(stringMatching(…))`
      against `/^020 - .+ /` rather than against the fixture's own name: the
      claim is the join, and a literal would pin this test to a fixture it does
      not own.
- [x] 3.2 The sheet headings are matched by their opening — `/^Priority for 010
  - /` — for the same reason.

## 4. The negative

- [x] 4.1 `rowWords` reduced to `(number, _name) => number`, which is the
      spelling these places used before. **61 tests failed**, across the chart,
      the cards and the table. The outputs are in `verify.md` and in the
      function's own `Proof:` comment, written from them.

## 5. Gate

- [x] 5.1 fe-01's jsdom suite, the whole browser gate, lint, typecheck, format,
      `openspec validate`. Results in `verify.md`.
