<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. Copy as Mermaid

- [x] 1.1 `copyAsMermaid` handler beside `copyAsMarkdown` — the patch
      `mermaid-gantt`'s own `verify.md` left drafted, taken as-is: refuses via
      toast on `!diagram.drawn`, otherwise the same clipboard-absent /
      write-refused / done outcomes `copyAsMarkdown` already has. Button placed
      immediately after `Copy as Markdown`. Tests: `offers all four ways of
taking the plan out of the tool` (button present), `copies the chart as a
Mermaid gantt, and says it did`, `says so when there is no diagram to
draw, and copies nothing`.

## 2. Download as Markdown

- [x] 2.1 `downloadMermaidDocument` handler beside `downloadCsv` — same
      blob-and-anchor shape, refuses via toast on `!bundle.drawn` (the outcome
      `downloadCsv` itself cannot have, since a CSV never refuses), named
      `planFileName(plan, 'md')`. Button placed immediately after
      `Download CSV`. Tests: `downloads the bundled Markdown document, the
fence and the table together`, `says so when there is nothing to bundle,
and downloads nothing`.

## 3. Verification the regression could not run

- [x] 3.1 A real fence, from a real plan, pasted into mermaid.live and watched
      draw. Recorded in `verify.md` with what it looked like — not inferred.
- [x] 3.2 Confirm the downloaded `.md`'s header states whether it is the whole
      plan or only the shown rows (it already does — `SCOPE_FIELD` in
      `plan-mermaid.ts`, unchanged by this branch) and that the button's test
      above asserts the literal sentence, not just the file's presence.

## 4. The record

- [x] 4.1 `proposal.md`, this file, the delta spec (`MODIFIED` requirements on
      both existing Mermaid-export requirements, adding the toolbar-reachable
      scenario each was missing), `verify.md` with gate numbers, CI run id and
      conclusion, and the wall-clock timings. PoC-mode contract
      (`notes/delivery-modes.md`): no `design.md`, no citation table.
