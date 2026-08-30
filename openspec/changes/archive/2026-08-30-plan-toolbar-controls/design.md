# design — `plan-toolbar-controls`

## D1 — the accessible name is the thing that does not change

Every one of these controls is found by name in the existing suites — jsdom's
`getByRole('button', { name: 'Collapse all' })` and Playwright's
`getByRole`. The whole change is that the **visible** label shrinks; the
accessible name is held constant on purpose, through `aria-label`.

This is the same bargain `project-page.tsx`'s `✎` already made and documents:
"an icon button in a one-row header is a smaller thing with the same accessible
name, and `aria-label` is what makes those two facts one."

The consequence for `Freeze #` is that the two writes keep their names
`Freeze numbering` and `Unfreeze all` — as menu items now rather than buttons.
Tests that clicked a button must open the menu first, which is a real change to
those tests and is listed in `verify.md` rather than waved past as a rename.

## D2 — glyphs are drawn, not named

`⌨` (U+2328) has no colour emoji presentation on macOS and falls back to a hairline
outline in the UI font. The fix is not a different codepoint — the next one has
the same class of problem on the next platform — it is to stop depending on font
coverage at all.

`toolbar-icons.tsx` exports three components: `KeyboardIcon`, `ExpandIcon`,
`CollapseIcon`. Each is an inline `<svg>` with `fill="none"`,
`stroke="currentColor"`, `width="1em"`, `aria-hidden="true"` and
`focusable="false"`. `currentColor` and `em` are what make them inherit the
button's variant and size rather than needing a variant of their own.

`aria-hidden` on the SVG matters: the button already has an `aria-label`, and an
SVG with a `<title>` inside a labelled button gives the control two names.

**The chevrons say direction, not state.** `ExpandIcon` is a chevron pair
pointing apart, `CollapseIcon` a pair pointing together. Not a single
down/right chevron, which is what a _row's_ disclosure control uses in this
table — two controls with one shape, one meaning per row and one per plan,
is a shape a reader has to disambiguate by position.

## D3 — `Freeze #` is a menu, and menus in this table have a history

`actions-menu.tsx` shipped a guard that refused a modified Enter by returning
**without** `preventDefault`, so the browser fired the button's own click and
took the item anyway (`AGENTS.md`, R5 #14). The proof that guarded it dispatched
synthetic keys into jsdom, which performs no default action, so it could see the
guard deleted and never see it left half-done.

The new menu inherits that. Concretely:

- it reuses `actions-menu.tsx`'s item-key handling rather than writing a second
  copy — one guard, already fixed, one place to fix it again;
- its negative test is a **browser** test in `e2e/keyboard.spec.ts`, pressing
  Shift+Enter on `Unfreeze all` with rows on screen and asserting no unfreeze
  happened. jsdom cannot be the oracle for this. R5 #14/#15's fault class.

The menu also joins `commandChordIn`'s inert-while-open set, the same as a row's
`⋯`: a chord aimed at the plan while a toolbar menu is open must not reach it.

## D4 — the two writes are not symmetric and the menu says so

`Freeze numbering` freezes every current number; `Unfreeze all` releases every
frozen row. They are not a toggle and the control must not look like one — an
`aria-pressed` button, or one label that swaps, would claim a state the project
does not have (a plan can be partly frozen; `actions-menu` unfreezes one row).

So: a menu with two items, both always present, both always enabled while not
`busy`. `Unfreeze all` on a plan with nothing frozen is a no-op write, which is
what it is today as a button, and making it conditional would need a
"is anything frozen" read the toolbar does not have.

## D5 — the width claim is measured

The point of the change is bar width, so the change is only done if the bar got
narrower. `e2e/layout.spec.ts` measures the toolbar's `scrollWidth` at 1280
before and after, with the pre-change figure pinned as a number in the test.

A percentage or a "should be less" assertion would pass on a one-pixel
improvement and on a regression that happened to land under the old figure. The
pinned number is what makes it falsifiable.
