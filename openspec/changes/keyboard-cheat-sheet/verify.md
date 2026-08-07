# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects

$ bunx nx run fe-01:test --skip-nx-cache
Test Files  20 passed (20)
     Tests  430 passed (430)          # 407 before this change, 23 new

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
"totals": { "items": 31, "passed": 31, "failed": 0 }
```

23 new tests: 18 in `keyboard-cheat-sheet.test.tsx` (registry, cross-check,
`Alt`/`⌥` labels, the overlay, the `?` guard) and 5 in `wbs-table.test.tsx`
(the sheet from inside the table).

## The checks, and the faults that broke them

| Check                                                               | Fault injected                                                             | What the run reported                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The registry names a test that exists (`keyboard-cheat-sheet.test`) | `'Escape closes the list'` → `'Escape shuts the list'` in `PROVEN_BY`      | `names, for every binding, a test that is in wbs-table.test.tsx` failed: `Pickers: Escape names a test wbs-table.test.tsx does not have: Escape shuts the list`. Restored, 18 pass                                        |
| The registry names a test **at all**                                | a `Ctrl + K` binding added to `KEY_BINDINGS`, nothing mapped to it         | the same test failed: `Anywhere: Ctrl + K names no behaviour test`. Restored, 18 pass                                                                                                                                     |
| The editable-target guard (`isTypingInto`)                          | `return false` first thing in `isTypingInto`                               | `a question mark typed into a name stays a question mark` failed on a dialog where it asserts none, and the guard's own unit test failed. Restored, both pass                                                             |
| The focus returns on close (`KeyboardCheatSheet`)                   | the stored element dropped — `const back = null` in the effect's cleanup   | 4 failed: `takes the focus on open and gives it back on close`, `closes on its ✕`, `closes on Escape and gives the focus back to what had it`, `gives the focus back to the cell that had it` — the focus was on `<body>` |
| Only the backdrop closes it                                         | `if (event.target === event.currentTarget)` narrowed to a bare `onClose()` | `stays open when the click lands inside it` failed — clicking the sheet's own heading closed it. Restored, 18 pass                                                                                                        |

All five watched failing on 2026-08-07, each restored and re-run before the
next fault.

## What the cross-check proves, and what it does not

The sheet's prose is `KEY_BINDINGS` and nothing else, so **sheet vs registry**
cannot drift — there is only one copy. The cross-check is about the other gap,
**registry vs code**: `PROVEN_BY` in `keyboard-cheat-sheet.test.tsx` maps every
`(where, keys)` entry to the behaviour tests that prove it, and the test reads
`wbs-table.test.tsx` from disk and looks for `itDom('<name>'` verbatim.

It catches, watched above: a mapped test renamed or deleted; a binding added
with no test named for it; a mapping entry for a binding that no longer exists.

It does **not** prove that the named test tests that binding. A test rewritten
to assert something else keeps its name and keeps this passing. The pairing of
binding to test is a human review judgement, and this check's whole claim is
the narrower one: the behaviour tests this sheet leans on are still there,
under the names it leans on. That is the drift that actually happens — tests
get renamed and deleted far more often than they get quietly gutted — but it
is a smaller claim than "the sheet is true", and it is written down here
rather than implied.

Two smaller honesty notes: the search is for the `itDom(` declaration rather
than the bare words, so a name that only appears in a comment does not satisfy
it; and the source is read with `readFileSync`, which throws if the file moves
— read as "no tests named" it would pass vacuously, which is the R5 failure
this repo has shipped thirteen times.

## Decisions worth naming

- **`?` is guarded by the event's target, not by the focus.** A keystroke on
  its way into an `input`, `textarea` or contenteditable is left alone. This
  means a read-only estimate cell also swallows `?` — it is still a text field,
  and treating it as one is simpler than a rule about which inputs accept text.
- **`⌥/Alt` when the browser will not say.** `altStyleOf` answers `mac`, `pc`
  or `unsure`, and `unsure` renders both. A sheet that says `⌥` to a Windows
  reader is wrong in a way that is hard to recover from; one that says both is
  merely wordy. `navigator.platform` is deprecated, so it is read through
  `Reflect.get` and type-checked rather than accessed as a property.
- **`Tab` and `Backspace` are one entry each**, not two, because they are one
  key with a caret-position rule. Each maps to both tests.
- **The list corrects the brief in three places**, from reading the code:
  Enter/Tab/Shift+Tab/Backspace fire in the **Name cell only** (that is the one
  cell wired to `onKeyDown`); Up/Down move between cells regardless of the
  caret, only Left/Right wait for it to run out; and the arrows move a
  highlight in the **Depends on** picker only — `CreatablePicker` (assignee,
  team) handles Enter and Escape and nothing else, so its Enter takes the first
  match rather than a highlighted row.

## Browser gaps — what jsdom did not watch

- **No layout.** The fixed backdrop, the panel's `80vh` scroll, the `⌥` glyphs
  and whether any of this is legible on a phone are unasserted. Dany's screen
  is the test.
- **jsdom does not focus a clicked button.** Both focus-return tests call
  `.focus()` before the click; a browser does it itself. What is asserted — the
  stored `document.activeElement` being focused again on unmount — is the same
  either way.
- **`isContentEditable` is not implemented by jsdom**, so the guard reads the
  `contenteditable` attribute beside the property and only the attribute path
  is exercised. A browser also reports `true` for a child of an editable
  element; that path is unwatched. The table has no contenteditable today.
- **AltGr layouts.** `opensCheatSheet` refuses a `?` carrying Ctrl, Meta or
  Alt. On Windows, AltGr reports both Ctrl and Alt, so on a layout where `?`
  needs AltGr the key will not open the sheet. The `⌨` button is the way in
  there. Not reproducible in jsdom, and stated rather than guessed at.
- **No focus trap**, by decision: Tab leaves the dialog into the table behind
  it. A trap needs its own change and its own tests; Escape, the ✕ and the
  backdrop are the ways out this one proves.
- **The listener lives in `WbsTable`**, so `?` does nothing on a page that has
  no table on it — the project picker, for one.
- **Not deployed.** No dev deploy was run from here; this is source-verified
  only.
