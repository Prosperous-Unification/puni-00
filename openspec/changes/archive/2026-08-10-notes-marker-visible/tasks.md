<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. A marker the eye lands on

- [x] 1.1 The marker sized and coloured as ink (15px, 700, foreground, padded
      hit area) and its press forwarded to the name box — test:
      `wbs-table.test.tsx` "marks a row that has notes, and only one that
      has" extended with the style facts jsdom can see and the mousedown
      landing the focus; negative: the size put back to 11 — watched failing
      on `expected '11px' to be '15px'`

## 2. Gate

- [x] 2.1 Full gate + browser suite — test: format:check --all, run-many
      gate, openspec validate --all, playwright all green
