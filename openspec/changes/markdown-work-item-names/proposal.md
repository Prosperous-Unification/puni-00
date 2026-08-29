<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

A work item's name is drawn as plain text everywhere. Notes are markdown; the
name is not, and `hover-preview.tsx` says why: "Composing `# ${name}` into the
markdown source would be a second parser over a field nobody writes markdown
in."

People do write markdown in it. Dany's call (2026-08-29): a name carrying
`**blocked**` or a link should read as one. The old reasoning was sound about
the _composition_ — `# # x` parses as a heading whose content is the literal
`# x`, which is exactly how that decision's negative test came to be vacuous
(`AGENTS.md`, R5, `N name-title-body`). It was wrong about the field.

## What Changes

**Names render inline markdown, and only inline.** Emphasis, strong, inline
code, strikethrough and links parse. Block syntax — `#`, `-`, `>`, fences,
tables — renders as the literal characters it is. A table row is one line high
at rest and stays one line high; nothing a name contains may change a row's
height.

**One renderer, four faces.** The Name cell at rest, the hover preview's
heading, the plan cards and the Gantt row label all render the name through one
`InlineMarkdown` component. A rule spread across four renderers is four rules
that agree until one is edited.

**The hover preview still shows the name as a level-one heading**, and still
never composes it into markdown source. The inline rendering happens _inside_
the `<h1>` element — the heading is structure the component makes, the emphasis
is content the parser makes, and the two never meet as a string.

**Editing is unchanged.** The Name cell's textarea holds the raw source, as it
does for notes today. What changes is only the at-rest reading.

## Non-Goals

- Block markdown anywhere a name is drawn.
- Raw HTML. `react-markdown` renders to React elements and passes no HTML
  through; that stays true.
- Any change to notes, to the notes marker, or to how name and notes are split
  in storage.
- Markdown in any other short field — a team's name, a tag, a step.

## Capabilities

### Modified Capabilities

- `wbs-domain`: how a work item's name is read.

## Domain Terms

Name cell; Hover preview.

## Impact

A new `inline-markdown.tsx`; `wbs-table.tsx`'s Name cell, `hover-preview.tsx`,
`plan-cards.tsx`, `gantt-panel.tsx`'s row label, and the export (which stays
raw). Their tests. No wire, schema or command change.
