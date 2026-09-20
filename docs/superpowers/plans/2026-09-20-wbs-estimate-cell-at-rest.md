# WBS: the estimate cell at rest shows the result, not the slashes

Status: proposal to schedule, written 2026-09-20 from Dany's request. Small and separate from the agentic planning research, though it should not contradict it (see "Fit").

## Intent

**Problem.** On a big plan the step columns are a wall of `1/2/4`, `0.5/1/2`, `3/5/8`. The slashes and three numbers per cell blur into texture, and the number a reader actually wants, what this step comes to, is the smallest thing in the cell. Today a folded step cell is an input holding the typed trio at full strength, and the result follows it as `· 5` at 10 pixels in the muted colour; when the trio is flat the result is not drawn at all (`apps/wbs/fe-01/src/components/wbs/plan-columns/estimates.tsx`, `finalSaysMore`).

**Outcome.** At rest the cell draws attention to the step's result and lets the trio recede. Editing is unchanged: Dany likes the slash form for typing, so focusing the cell still gives `optimistic/realistic/pessimistic` exactly as now.

**Non-goals.** Changing what is stored, how the result is computed, the unfolded three-column layout, the hover card, keyboard navigation, or the `@` mention of an assignee in the same box.

**Constraint.** The trio lives in a real `<input>`, and an input's text cannot be styled in parts. So "numbers strong, slashes faint" inside the box is not available without replacing the box at rest, and the box carries a great deal of tested behaviour (focus, cards, keyboard moves, drafts, mentions). The chosen direction avoids that.

## Direction Dany chose

"Make the whole slash thing less visible and instead draw attention to the result number for this step."

1. **The result becomes the cell's main reading.** Drawn at the table's normal size and foreground colour, with tabular numerals, in the right-hand slot it already occupies, so results line up down a column and can be scanned like a ledger. No leading `·`.
2. **The trio recedes while the cell is not focused.** The same input, with its text in the muted colour and a smaller size when not focused, and back to full strength on focus. One CSS state, no second element, nothing for the keyboard or the cards to learn.
3. **The result is always drawn when the step has an estimate.** Today it is hidden when it equals the trio's text (a flat `5`), which was right while the result was the footnote. With the result as the main reading, the flat case shows the result and hides the repeated trio text at rest instead, so a cell never reads `5 5`.
4. **A parent's rolled-up cell follows the same rule**, so a parent and its leaves still read as one column: result strong, summed trio quiet.
5. **An unestimated step stays empty**, and a typed trio the server refused keeps its invalid styling at full strength: a complaint must not recede.

The alternative Dany named first, stronger numbers with fainter slashes, is kept as a fallback only if (2) tests badly: it needs the box replaced by styled text at rest and swapped for the input on focus, which is the expensive version.

## What has to be decided while building

- Whether the quiet trio stays visible at all at the narrowest column width (96 pixels, shared with the assignee), or yields to the result and lives in the hover card, which already shows it.
- Whether uncertainty deserves a mark of its own once the trio is quiet: a reader scanning results loses the sense of which steps are wide guesses. A small spread mark (for example the pessimistic to optimistic ratio shown as one to three dots) is cheap; it is also scope, so it is a question, not a plan.
- Dark mode contrast for the muted trio: it must stay legible, since it is still the only place the three numbers are without a hover.

## Proof and gates

- Behaviour is observable, so this is one small OpenSpec change on the table's capability, with scenarios for: result drawn for a flat trio; trio quiet at rest and full on focus; a refused trio not receding; a parent reading like its leaves.
- The R5 negatives are per scenario: remove the focus rule and the "full on focus" case fails; restore the `finalSaysMore` guard and the flat-trio case fails.
- The pixel suites will change on purpose. CI's `pixels` shards compare screenshots, so the baselines for every view with step columns are regenerated in the same change and reviewed by eye, light and dark.
- `plan-estimates.test.tsx` pins the existing pair (`2/2/3 · 2.2`) and the parent-leaf alignment (`Expected: 858`); both are expected to change and each change is named in the packet, not discovered.

## Fit

- Files: `plan-columns/estimates.tsx`, `plan-number-format.ts`, their tests, the e2e pixel baselines. None is in a refactoring lane (040.4 and 040.5 edit the plan read hook and the command services; 040.7 the lifetimes), so this can be built as soon as it is specified.
- The agentic planning research will add units shorter than a day and other measures (tokens, points, sizes). A cell whose main reading is "the result" takes those more easily than one whose main reading is a days trio, so this change goes first and the research builds on it.

## Work item

| Ref | Item                                                                                                                                              | Depends on | Days (O / R / P) | Tokens  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------- | ------- |
| U1  | Estimate cell at rest: the result is the main reading and the trio recedes; OpenSpec change, tests with negatives, pixel baselines light and dark | —          | 0.5 / 1 / 2      | 800,000 |
