<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. Hover preview reads as one document

- [x] 1.1 Rename `NotesPreview` / `notes-preview.tsx` to `HoverPreview` /
      `hover-preview.tsx` (glossary term), add a `name` prop, render the name
      as text inside a level-one heading element above the notes' markdown,
      and wire `wbs-table.tsx` to pass the name — test: `hover-preview.test.tsx`
      "renders the name as a level-one heading over the notes' markdown"
      (asserts an h1 whose textContent is the name and an h2 produced by
      `## Risks` in the notes)
- [x] 1.2 A name containing markdown or HTML stays text — test:
      `hover-preview.test.tsx` "a name containing markdown and HTML reads as
      typed" (a name reading hash-space-script-tag yields an h1 with that
      literal text, no script element, notes HTML still text); negative: the
      heading switched to rendering the name through concatenated markdown
      source — watched failing on the leading hash being eaten into a heading

## 2. The Name cell at rest is the name alone

- [ ] 2.1 `CellInput` gains the opt-in at-rest first-line clamp (prop name per
      R2, e.g. `restShowsFirstLineOnly`): at rest the height is the measured
      wrapped height of the first line with overflow hidden; focused it is the
      full content height with overflow auto; `maxRestRows` untouched for the
      card face; the Name column in `wbs-table.tsx` passes the prop — test:
      unit coverage of the prop wiring where jsdom can see it (`cell-input`
      renders with the prop, value still the composed text; the
      `wbs-table.test.tsx` suite stays green — value and commit semantics
      unchanged)
- [ ] 2.2 Browser proof of the clamp — test: `e2e/name-cell.spec.ts` "at rest
      the cell is as tall as its wrapped name" (row with a ten-line note vs a
      note-less twin: equal cell heights; long name: full text visible, height
      above one line) and "the notes cannot be scrolled into view at rest";
      negative: clamp deliberately removed (prop not passed) — watched failing
      on the noted row being taller
- [ ] 2.3 Focus reveals, blur re-hides, nothing is sent by a look — test:
      `e2e/name-cell.spec.ts` "focus shows the notes and blur hides them
      again" (focused height grows, notes text visible in the box, blur
      returns to the name height; the network log shows no PATCH from a focus
      and blur with nothing typed); negative: the blur-path clamp removed —
      watched failing on the cell staying tall after blur

## 3. Audit and gate

- [ ] 3.1 Audit existing browser specs that assert Name-cell or row heights
      with notes at rest (`e2e/layout.spec.ts`, `e2e/keyboard.spec.ts`, the
      mobile specs) and update expectations that encoded the old four-line
      rest cap — test: the full `bun run e2e` green on dedicated ports
- [ ] 3.2 Full gate plus verify.md with the R5 failure-proof table (every
      negative above watched failing, command output recorded) — test:
      `bunx nx format:check --all`, the run-many gate with test lint typecheck
      build, and `openspec validate --all --json` all green
