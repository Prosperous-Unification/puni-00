# design — `markdown-work-item-names`

## D1 — inline-only is a component allowlist, not a regex

`react-markdown` parses the whole grammar; what decides the output is the
`components` map and what it refuses to render. `InlineMarkdown` passes
`em`, `strong`, `code`, `del`, `a` and text through, and maps every block
element — `h1`–`h6`, `ul`, `ol`, `li`, `blockquote`, `pre`, `table`, `hr` — to a
component that renders **the element's original source text**, not its children.

Rendering children would silently strip the marker: `# Ship it` would become the
words `Ship it` in the cell and the reader would never know a `#` had been
eaten. Rendering the source keeps the cell honest — a name that is not inline
markdown reads exactly as it was typed.

The `p` wrapper markdown always makes is rendered as a fragment, so the cell
gets no block box and no margin. That is what keeps the row one line high.

**Links do not navigate from a table cell.** An `<a>` inside the Name cell would
put a click target inside a cell whose click opens the editor, and a keyboard
tab stop inside the grid. So `a` renders as its text with the link's styling and
its `title` carrying the href; the hover preview is where a link is followable.

## D2 — the heading is structure, the emphasis is content, and they never meet

The rejected implementation is `<Markdown>{`# ${name}`}</Markdown>`. It is
rejected for the reason `hover-preview.tsx` already gives, and for a second one
the repo learned the hard way: the test written to catch it used the name
`# not a heading <script>`, and with the fault injected it **passed**, because
`# # x` is a heading whose content is the literal `# x` (`AGENTS.md`, R5).

The implementation is:

```tsx
<h1 style={NAME_SIZE}>
  <InlineMarkdown>{name}</InlineMarkdown>
</h1>
```

The `<h1>` is a React element this file writes. Nothing the name contains can
produce, close or escape it.

**The negative that proves it uses punctuation a parser eats**, per the same R5
entry: the name `*not*` — asserted to render an `<em>` — plus a name containing
`# x`, asserted to render the literal `#` and **no element the parser made**
inside the heading. The first fails if inline parsing is absent; the second
fails if the source is being composed.

## D3 — the row's height is the measurable claim, and jsdom cannot see it

Every argument above is about a row staying one line high. jsdom computes no
layout, so a `p` margin, a `pre` block or a wrapped `<h1>` costs it nothing and
every DOM test passes through the fault. This is the `M mobile-cards` /
`T2 compact-columns` fault class.

So the height claim is a Chromium assertion: a plan with one plain name, one
name of `**bold** and *italic*`, and one name of `# heading\n- list` — all three
rows measured to the same `getBoundingClientRect().height`, in both palettes.
Its negative is the block allowlist removed, watched failing on the third row.

## D4 — the export and the search stay raw

The export writes the name's source, unchanged: a spreadsheet cell is not a
markdown surface, and a reader pasting `**blocked**` into Jira wants the
asterisks. `tree-search` matches against the source too — a reader searching
`blocked` should find a row named `**blocked**`, and a search over rendered text
would also have to decide what a link's href is.

Both are "no change", and both are asserted rather than assumed, because "we
did not touch it" is how a shared helper quietly gets touched.
