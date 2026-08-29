# design — `project-picker-flow`

Three independent faults in one component. This file is only about the two
places where the obvious fix is wrong.

## D1 — the card is anchored to the listbox, not to the option

`ProjectOptionCard` today takes an `AnchorRect` measured from the hovered
`<li>` and `HoverCard` places itself against it. Moving the card right by a
fixed offset is the wrong fix: the offset would have to be the listbox's width,
which the option does not know, and a long project name makes the listbox wider
than any constant.

The anchor becomes **the listbox element's own rect, with the hovered option's
`top`**. One measurement of the `<ul>` (already in a ref for the scroll
listener), one of the option, and the card is placed at `ul.right` on the
option's row. The card follows the pointer vertically and never horizontally,
which is what "expands to the right of the dropdown" means when the dropdown is
one column of equal-height rows.

**The fallback is a side flip, not a clamp.** Where `ul.right + cardWidth`
exceeds the viewport the card is placed at `ul.left - cardWidth`. Clamping to
the viewport instead would slide the card back over the list at exactly the
window widths where the list is hardest to read — the failure the change is
about, reappearing only for narrow windows. Where **neither** side fits (a
window narrower than two card widths plus the list) the card is suppressed: the
list is the thing being chosen from, and a card that must cover it to exist has
no claim on the space.

## D2 — a pick blurs; the box stays a combobox

The temptation is to swap the closed state for a `<button>` and render the
`<Input>` only while searching. Rejected: the accessible name, `role="combobox"`,
`aria-expanded`, `aria-controls` and `aria-activedescendant` are all on that one
node and every existing test and screen reader path goes through it. Swapping
the element on selection would mean two nodes with one accessible identity and a
focus that has to be handed between them.

Instead `choose` calls `blur()` on the input after clearing the search. At rest
the box carries `readOnly` — it still focuses, still opens the list on focus and
still accepts typing once open, but a click that lands on it while closed does
not place a caret in the project's name. The rename remains reachable only
through `✎`, unchanged.

**Why `readOnly` and not `disabled`.** A disabled combobox is out of the tab
order and cannot be opened from the keyboard at all; `readOnly` keeps every
route in and only removes the caret. The `onFocus` that opens the list clears
`readOnly` in the same commit, so the first keystroke after focusing types.

## D3 — create arms the rename, and the arming is the create's own state

`create` currently does `setRename(null)` first, with a comment explaining that
a draft armed for one project must not follow the click to another. That reason
still holds — the fix is not to delete the line but to **re-arm after the
create resolves**, on the new project's id:

```
setRename(null)                       // the old draft, for the old project
→ POST /api/projects { name: 'New project' }
→ setSelected(id); rememberProject(id); await load()
→ setRename({ projectId: id, draft: 'New project' })
```

The re-arm is after `load()` because the rename field renders in place of the
picker, and arming it before the list has the new project in it puts a commit
target on screen for a project the list cannot yet name.

`draft` is `'New project'` rather than `''`, and the field selects its whole
value on mount. An empty draft would commit as a cancel — `commitOrCancelRename`
treats an empty typed value as a cancel — so a reader who clicked create, saw
an empty box and pressed Enter would get a project called `New project` anyway
and no explanation. Selected-not-cleared means the first keystroke replaces it
and Enter on an untouched field is a no-op rename.

## What is deliberately not changed

- The `✎` button. Renaming an already-open project is unchanged.
- The literal `'New project'` sent to be-01. The server still names the row; the
  client only offers to change it immediately.
- `openProject` on selection, which stays on the effect rather than the click.
