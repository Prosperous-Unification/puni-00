# Names wrap, and notes are markdown you can read

## Why

Dany, 2026-08-06: "name field must be longer and must wrap instead of cutting
text", "after name add note field — it must support markdown and must not
render the full text", "notes field with markdown expands when editing", "notes
field shows a hint with rendered markdown on hover".

A work item's name is a sentence. The cell held it in a single-line `<input>`,
which scrolls it out of sight one character at a time — the row says
`ps adds shopify inf proc` and the rest is a guess. Notes had the same box and
the same problem, on a field meant to hold paragraphs.

## What Changes

**Name and Notes are wrapping cells**

- Both become `<textarea>`s: one row at rest, grown while they have the focus
  (Name to three rows, Notes to eight). A textarea wraps; an input cannot.
- Enter is still "new work item" — the table preventDefaults it, so a name
  stays one line of meaning however many lines it takes to show.
- Every structure key keeps working: Tab, Shift+Tab, Backspace and the arrows
  read `selectionStart`/`selectionEnd`/`value`, which both elements carry. The
  guards that tested for `HTMLInputElement` now accept either.

**Notes render their markdown on hover**

- The cell holds the source, cropped by its own height — one line at rest.
- Hovering a note shows it rendered in a popover beside the row.
- Rendered with `react-markdown`, **without `rehype-raw`**. Notes are written
  by one person and read by everyone else on the project, so raw HTML in a
  note renders as the text somebody typed. A test watches that rather than a
  comment claiming it.

## Non-Goals

- **No rich-text editor.** The cell holds markdown source; the popover shows
  what it becomes. A WYSIWYG is a different product decision.
- **No separate read and edit modes for Notes.** One element, always the
  source, so there is no focus swap to get wrong.
- **No markdown in the Name.** A name is a label, not a document.
- **No `rehype-raw`, ever, without a sanitizer decision made on purpose.**
