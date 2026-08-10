# The keyboard the table is driven by, written down

## Why

Both UX reviews, 2026-08-06, said the same thing at SHOULD/MUST: this table is
unusually keyboard-heavy — Enter, Tab, Shift+Tab, Backspace, four arrows, four
Alt+arrows, a trio shorthand and three pickers — and **none of it is
discoverable**. Everything is learnable in a minute and knowable in no other
way than being told. A tool whose fastest path is invisible is a tool most
people use the slow way.

Codex's requirement, kept: the sheet must be **derived from the bindings**, not
retyped beside them, or it drifts into a lie the first time a key changes.

## What Changes

**A cheat sheet, opened by `?`, listing the keys this table actually has**

- A binding registry — `{keys, does, where}` — is the one place the keyboard is
  written down in prose. The overlay renders it; nothing else re-states it.
- **The registry is cross-checked against the behaviour tests.** Every entry
  names the test(s) in `wbs-table.test.tsx` that prove the behaviour, and the
  check reads that file and fails when a named test is renamed or deleted.
  Its limit is stated where it lives: it proves the named test exists, not that
  it tests that binding. The mapping is reviewed by people.
- `?` opens the sheet — but only when the keystroke is not in a text box, so
  `?` typed into a name or a Find box stays a question mark. A `⌨` toolbar
  button opens the same sheet for people who did not know about `?`.
- The sheet is a modal dialog: labelled, `aria-modal`, closed by Escape, by its
  ✕, or by clicking away. Focus moves into it on open and **returns to whatever
  had it** on close.
- `Alt` renders as `⌥` on a Mac, `Alt` on a PC, and `⌥/Alt` when the browser
  will not say which.

## Non-Goals

- **No rebinding.** The sheet reads the keyboard out; it does not change it.
- **No new bindings** beyond `?` itself. This change documents; it does not
  design.
- **No focus trap.** Tab may leave the dialog. A trap needs its own change and
  its own tests; Escape and the ✕ are the ways out this one proves.
- **No per-cell hints or tooltips.** One sheet, one place.
