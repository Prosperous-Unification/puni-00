## Context

The Name cell is one uncontrolled `<textarea>` (`cell-input.tsx`), the DOM face
of a `LiveField`. Its value is always the composed text — name, newline, notes
(`name-notes.ts`) — and `resize()` sets its height: content height, capped at
rest by `maxRestRows * 1.4em`, uncapped while focused. The hover preview
(`notes-preview.tsx`) renders the notes alone. The table's focus machinery
(`focusIntent`, the `columns` remount landmine, Enter-Enter-Enter) depends on
this being the same node across focus changes.

## Goals / Non-Goals

**Goals:**

- At rest the box is exactly as tall as its wrapped name, and the notes under
  it are invisible — clipped, not scrollable into view.
- Focused, the box shows the full composed text, as today.
- The hover preview reads as one document: the name as a level-one heading,
  the notes as markdown under it.

**Non-Goals:**

- The card face (`plan-cards.tsx`): keeps `maxRestRows={8}`, notes at rest.
- Any affordance marking "this row has notes" at rest. Hover is the reveal;
  deliberate, per the intent.
- Changing what the box holds, sends, or diffs (`LiveField` untouched).

## Decisions

- **Clamp height, keep the node and its value.** At rest, the height comes
  from measuring what the first line alone would occupy at the box's width —
  measured, not counted: the name wraps. Mechanism is the implementer's choice
  (transient value swap inside `resize()`, or a mirror element with identical
  metrics), under two constraints: nothing observable changes while the cell
  is focused, and `node.value` still holds the composed text whenever any
  other code can run (a transient swap is safe only because it is synchronous).
- **`overflow: hidden` at rest, `auto` focused.** A clamped box with `auto`
  lets a wheel scroll the notes into view, which reintroduces the height cap's
  old behavior by another door.
- **New `CellInput` opt-in prop** (suggested: `restShowsFirstLineOnly`),
  orthogonal to `maxRestRows`, which the card face keeps. Name cell passes it;
  `maxRestRows` no longer binds the Name cell at rest (a name is shown whole
  however long).
- **The preview becomes the Hover preview** (glossary term): component renamed
  `HoverPreview` in `hover-preview.tsx`, takes `name` and `notes`, renders the
  name as text inside a heading element — not concatenated into markdown
  source, so a name containing `#` or `<script>` shows as typed. Notes render
  through `react-markdown`, still without `rehype-raw`.

## Risks / Trade-offs

- **jsdom is blind to all of this.** `scrollHeight` is 0 there; the clamp, the
  clip and the focus expansion are provable only in a browser. The negative
  tests live in `e2e/` (R5 tally #14–16 are exactly this shape). Unit tests
  cover the preview's DOM and the prop wiring only.
- Existing `e2e/layout.spec.ts` and others may assert current row heights with
  notes visible — audit before changing, or the suite reports the feature as a
  regression.
- Transient value swap resets the textarea's selection; acceptable only
  because the swap happens exclusively while unfocused.

## Migration Plan

None. `apps/fe-01` render-path only; no storage, API, or deploy change.

## Open Questions

None blocking. Prop name final call is the implementer's, per R2.
