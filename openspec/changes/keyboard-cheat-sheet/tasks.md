## 1. The registry and its cross-check

- [x] 1.1 `keyboard-bindings.ts`: `KeyBinding {keys, does, where}`, the
      registry itself, `WHERE_ORDER`, and the `Alt`/`⌥` label helper.
      Tests (`keyboard-cheat-sheet.test.tsx`): the registry is non-empty, every
      entry is filled in, `where` values are all in `WHERE_ORDER` and no group
      is empty, and `(where, keys)` is unique — the key the mapping is by.
- [x] 1.2 The cross-check: a literal mapping from each entry to the behaviour
      test names that prove it, checked against `wbs-table.test.tsx` read from
      disk. **Negative test:** one mapped name changed to one that does not
      exist — the cross-check fails naming it. A registry entry with no mapping
      entry, and a mapping entry for no binding, both fail too.

## 2. The overlay

- [x] 2.1 `keyboard-cheat-sheet.tsx`: a labelled `aria-modal` dialog rendering
      the registry grouped by `where`, with a ✕, Escape, and a click away.
      Focus moves in on open and returns to the stored element on close.
      Tests: the dialog is labelled; every group heading and every `does` line
      is on screen; ✕ / Escape / backdrop each close it; a click inside does
      not. **Negative test:** the stored-element restore removed — the focus
      test fails.
- [x] 2.2 `opensCheatSheet`: `?`, no other modifier, and the event target not
      an input, textarea or contenteditable. **Negative test:** the editable
      guard dropped — the "types a question mark" test fails.

## 3. Wiring it into the table

- [x] 3.1 A window `keydown` listener, the `⌨` toolbar button titled
      "Keyboard shortcuts (?)", and the overlay rendered while open.
      Tests (`wbs-table.test.tsx`): `?` at the table opens it; `?` in a Name
      cell does not and is left to the browser; Escape closes it and gives the
      focus back; the button opens it.

## 4. Gate

- [x] 4.1 Format, the run-many gate uncached, and `openspec validate` over
      every change — recorded in `verify.md` with the fault table.
