# Design

Two things here are not obvious: **which of this app's widgets get a vendored
component and which keep their own internals**, and **how one rule in the modal
wrapper reaches listeners that were written before any modal existed**.

## The routing matrix

Every interactive thing in the app, and what happens to it.

| widget                                               | where    | disposition                                    | why                                                                                                                                                                                                                                          |
| ---------------------------------------------------- | -------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auth submit, mode toggle                             | chrome   | **vendored** `Button`                          | Already carried the classes; `T` flagged that compiling Tailwind restyled them with nothing owning them. This change owns them.                                                                                                              |
| auth username / password                             | chrome   | **vendored** `Input` + `Label`                 | The label still wraps the control — `getByLabel` is the spec.                                                                                                                                                                                |
| auth panel                                           | chrome   | **vendored** `Card`                            | A signed-out page whose only content is a loose form reads as unfinished.                                                                                                                                                                    |
| Log out, Rename, New project, twelve toolbar buttons | chrome   | **vendored** `Button`                          | Outside `[data-grid]`. Sizes: `sm` in the toolbar, default elsewhere; `Add work item` is the one filled button.                                                                                                                              |
| Find box, project picker box, rename box             | chrome   | **vendored** `Input` with a width class        | `Input` is `w-full` by the registry's default; these three sit in flex rows and say how wide they are.                                                                                                                                       |
| toasts                                               | chrome   | **restyled, not replaced**                     | `useToasts` owns a lifecycle (errors persist, infos fade, identity by content, timers cleared three ways) and `ToastStack` owns an aria contract with tests. Sonner — what the registry ships — reimplements both, differently.              |
| keyboard cheat sheet                                 | chrome   | **restyled, given the modal rule**             | See below.                                                                                                                                                                                                                                   |
| project picker list (`role="listbox"`)               | chrome   | **restyled, not replaced**                     | It is an ARIA combobox driven by `aria-activedescendant`, with a `mousedown` `preventDefault` on the whole list that cross review #6 put there. A Radix popover owns focus, and owning focus is exactly what this control must not do.       |
| toolbar `input[type=date]`, `select`                 | chrome   | **native, restyled**                           | shadcn replaces these with a Calendar popover and a Radix Select. Both change the accessibility tree from the native control's to a composed one, which rewrites the tests that name them. Out of `F`; they are still native and still work. |
| ⋯ actions menu                                       | **grid** | **untouched**                                  | See below.                                                                                                                                                                                                                                   |
| dependency / team / assignee / `@` pickers           | **grid** | **untouched**                                  | See below.                                                                                                                                                                                                                                   |
| every cell                                           | **grid** | **no class, no rule — but not "untouched"**    | Inline styles, declared widths, `table-layout: fixed`. The reset stops here; **inheritance does not**, so the cells' text colour and font family are the page's. Both are asserted in `e2e/tailwind.spec.ts` rather than assumed.            |
| dialogs and sheets                                   | chrome   | **new** — `Modal`, on `@radix-ui/react-dialog` | None exist yet. `P` and `M` need them.                                                                                                                                                                                                       |

### Why the grid's menu and pickers keep their internals

Radix versions of both were considered and rejected, for three reasons that
compound:

1. **They are not free-floating popovers; they are cells.** `layout.spec.ts`
   asserts that the ⋯ menu and both pickers open _out past the bottom of their
   own cell_ by more than 8px, that a list opens wider than the column it drops
   from, and that the last row's menu at 1280px opens neither off the left of the
   window nor past its right edge. Those are assertions about a box positioned
   relative to a cell inside a scrolling frame with sticky columns. Radix
   positions with floating-ui in a portal, against the viewport.
2. **They must not own the focus.** The pickers are ARIA comboboxes: the input
   keeps the focus and the list is driven through `aria-activedescendant`, and
   the whole list `preventDefault`s `mousedown` so a click on an option — or on
   the scrollbar — cannot blur the box first. That was cross review #6's
   finding, learned twice. Radix's popover and menu take the focus by design.
3. **The keyboard is the spec.** `keyboard.spec.ts` and the `PROVEN_BY` table in
   `keyboard-cheat-sheet.test.tsx` name behaviour tests for chords that are inert
   while a list is open, Enter that takes the highlighted entry, Escape that
   closes the list and leaves the box, `2/3/8@kat` as one gesture. Swapping in a
   primitive with its own key handling means re-proving all of it.

The trade this accepts: the app has two menu implementations, and a later
change that wants a shared one has to solve (1) first. That is stated so it is
a known cost rather than a surprise.

## The modal rule

The page listens for `?` and Cmd+Z on `window` (`wbs-table.tsx`), and for the
command chords on each cell through React. None of them knows what a dialog is.

`usePageShortcutsSuspended(isOpen)` registers **one** `keydown` listener on
`window` **in the capture phase** and calls `stopImmediatePropagation()` for any
event `isPageShortcut` claims.

- **Capture at the window is the first thing in the propagation**, before the
  document, before React's root container, and before the bubble-phase listeners
  the table registers on `window`. That is what makes "the page's shortcuts are
  off" a fact rather than a claim about registration order.
- **The predicate is the union of the three the listeners use** —
  `opensCheatSheet`, `undoChord`, `commandChord` — so it cannot drift from them.
  `opensCheatSheet` moved into `keyboard-bindings.ts` for this; a component
  importing a component to answer a question about a keystroke is a cycle.
- **`commandChord` is asked without a typing guard.** The chords fire from
  inside cells, which are inputs; guarding by target here would let Ctrl+N create
  a work item behind an open sheet, which is the fault this was written for.
- **Nothing is `preventDefault`ed** and nothing outside the predicate is
  touched, so Escape, Tab, the arrows and ordinary typing are the modal's.

The hook is called from `ModalContent`, which Radix mounts only while the modal
is open, and from `KeyboardCheatSheet`, which is rendered only while it is open.
"Mounted" and "open" are the same fact in both, so there is no flag to keep in
step.

## Where the guard is blind, and what was done about it

The reset stops at `[data-grid]`. **Inheritance does not.** The cells carry
`font: inherit` as inline styles of their own, so the face `<main>` is given is
the face the table is laid out in — and `table-frame.ts`'s `not-before: 146` is
a number Chromium gave for an unconstrained `input[type=date]` in `sans-serif`.

Shipping shadcn's `ui-sans-serif, system-ui, …` stack turned the browser gate
red at 1280×800: _the earliest-start field is 138px where this browser wants
143px_. The token stays `sans-serif` until a change moves the face **and**
re-measures that column. That is `H header-fits-a-row`'s to do.

## The modal rule has two sides, and they ask different questions

The first version of the hook asked `isPageShortcut` of every keystroke,
wherever it was aimed. Both reviews found the same consequence: a command chord
typed into a field **inside** the dialog was swallowed before the field's own
handler ran, so no modal could ever give `Ctrl/⌘ + Enter`, or any chord, a
meaning of its own. `P phases-ui`'s dialog wants exactly that.

The fix is not "let everything on the surface through", and the difference is
worth writing down because the wrong version reads more natural:

|                         | on the surface                                                                                                                                    | outside it |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `?`, Cmd+Z, Cmd+Shift+Z | **held back** — they are on `window` and fire wherever they are aimed, including at the dialog's own ✕                                            | held back  |
| the command chords      | **let through** — they are React handlers on the cells, and no cell is an ancestor of a portal, so nothing of the page's could have acted on them | held back  |

A blanket "the surface keeps its own keyboard" would hand a dialog's Cancel
button the table's undo — the fault this hook exists for, arriving by a
different door. Both halves are watched: widening the surface branch back to
`isPageShortcut` fails the chord test, and forcing `isOnModalSurface` true for
every target fails the Ctrl+N test.

`opensCheatSheet` and `undoChord` already refuse a target somebody is typing
into, so a text box on the surface keeps the browser's own undo and can still
have a `?` typed into it. That needed nothing said here.
