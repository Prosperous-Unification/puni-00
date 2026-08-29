<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The one renderer

- [ ] 1.1 `inline-markdown.tsx`: `react-markdown` with a components map passing `em`, `strong`, `code`, `del`, `a` and text; every block element rendered as **its own source text**, not its children; `p` as a fragment — test: `inline-markdown.test.tsx` `emphasis renders`, `a heading marker is shown, not eaten` (asserting the `#` present **and** no heading element), `a list marker is shown`, `raw HTML stays text`; negative: the block map deleted so children render, watched failing on the `#` disappearing. Rendering children would strip the marker silently — that is the fault this map exists for.
- [ ] 1.2 `a` renders as styled text carrying the href in `title`, with no `href` and no tab stop — test: `a link in a name is not a tab stop`; negative: a real `<a href>` rendered, watched failing on the tab-stop assertion.

## 2. Four faces, one renderer

- [ ] 2.1 The Name cell at rest renders through `InlineMarkdown`; the textarea still holds the raw source — test: `wbs-table.test.tsx` `emphasis in a name is rendered`, `editing a name shows its source`; negative: the raw string put back in the cell, watched failing.
- [ ] 2.2 `hover-preview.tsx`: `<h1><InlineMarkdown>{name}</InlineMarkdown></h1>`, source composition still forbidden — test: `hover-preview.test.tsx` `the heading is not made by the parser` (name `# x`: literal text present, no parser-made element inside the heading), `emphasis inside the heading still renders` (name `*not*`); negative: the implementation swapped for ``<Markdown>{`# ${name}`}</Markdown>``, watched failing on the first. The name must carry punctuation a parser eats — `# not a heading` alone passed the equivalent test once (`AGENTS.md`, R5).
- [ ] 2.3 Plan cards and the chart's row label render through the same component — test: `plan-cards.test.tsx`, `gantt-panel.test.tsx` emphasis cases; negative: one face left raw, watched failing.

## 3. What must not change

- [ ] 3.1 Export writes the source; `tree-search` matches the source — test: `plan-export.test.ts` `an export carries the markdown source`, `tree-search.test.ts` `a search matches the source`; negative: the export routed through the renderer, watched failing.

## 4. Row height, in a browser

- [ ] 4.1 Chromium: three rows — plain, inline-emphasis, and `# heading` plus a list marker — measured to the same `getBoundingClientRect().height`, in both palettes; the same for a plan card and a chart row label — negative: the block allowlist removed, watched failing on the third row. **jsdom computes no layout and cannot be this test's oracle** (`AGENTS.md`, R5 #14/#15, `M mobile-cards`).

## 5. Gate

- [ ] 5.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, the whole `CI=1` Playwright gate on shifted ports.
