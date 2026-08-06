## 1. Cells that wrap

- [x] 1.1 `CellInput` gains `multiline` and `expandedRows`, rendering a
      `<textarea>` that grows on focus; the commit-on-leave rule is shared by
      both elements rather than written twice.
- [x] 1.2 The keyboard guards and `editableGrid` accept either element
      (`CellElement`), so Tab, Backspace and the arrows keep working.
- [x] 1.3 Name and Notes use it; failing tests first.

## 2. Markdown

- [x] 2.1 `react-markdown` added (no `rehype-raw`), `NotesPreview` renders on
      hover, and only when there is a note.
- [x] 2.2 **Negative test:** swap the renderer for `dangerouslySetInnerHTML`
      and watch the HTML-in-a-note test fail.

## 3. Gate and verification

- [x] 3.1 Format, the run-many gate, `openspec validate` — recorded in
      `verify.md` with the fault table.
- [x] 3.2 Deploy to dev; the pixels need Dany's screen.
