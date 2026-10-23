# SaaS kit `@ui/saas-01`

Dense application chrome: tables you type into, toolbars, dialogs, forms. Read
[core's DESIGN.md](../ui-core-01/DESIGN.md) first. Tokens live in [`src/theme.css`](src/theme.css);
if this file and the stylesheet disagree, the stylesheet is right and this file has a bug.

## Values

Both palettes start as the values WBS was tuned on through its UI review, moved verbatim so the
kit moved no pixel; taking the brand gold as `--accent` is a later change with its own by-eye
review. Exact values: `src/theme.css`, pinned by `theme.test.ts`.

- **Light.** A white page, card and popover. Ink is a near-black blue slate; the primary is the
  same slate one step lighter with near-white text on it. Secondary, muted and accent share one
  pale slate fill, so a hover and a quiet surface read alike. Hairlines (`--border`, `--input`)
  are a pale blue-grey. Destructive is a saturated red with near-white text. The focus ring is a
  mid slate.
- **Dark.** A deep slate page, with cards and popovers one step lighter so they stand off it.
  Ink is near-white; the primary inverts to a pale slate with deep slate text on it. Secondary,
  muted and accent share a mid-dark slate fill. Hairlines are white at 10% and 15% opacity.
  Destructive is a lighter, warmer red. The focus ring is a mid-dark slate.
- **`--control-edge`.** A mid slate in both palettes, set so the edge of every control box (an
  `outline` button, a text box, a select) clears 3:1 against the page, the card and its own hover
  fill (WCAG 1.4.11). `--input` stays in the vocabulary, but no kit control draws it: as a control
  edge it measured 1.2:1.
- **Faces.** `--font-body` and `--font-display` are `sans-serif`: the WBS table's column widths
  were measured against the browser's generic face, so a font change is a geometry change.
- **Layers.** `--layer-modal` < `--layer-card` < `--layer-card-ring` < `--layer-toast`: a
  modal, a portalled card over it, the card's wait ring, and the toast stack above all of them.

## Scales

Type: `text-sm` is the working size, `text-base` for prose, `text-xs` for quiet counts and the
`sm` button, `text-lg` for card and modal titles. Spacing is Tailwind's 4px scale; chrome
controls are `h-9` (36px), `h-8` small, `h-10` large, and an administration page's form controls
are 44px below `sm` (`CONTROL_HEIGHT`). `--radius` is 0.5rem; controls are `rounded-md`, cards
and centred modals `rounded-lg`.

## Primitives

The headings are fixed: `design-spec.test.ts` checks every exported component has one, and that
a part (`CardTitle`, `ModalContent`) is named in its parent's section.

## Button

- **Purpose:** the one way to trigger an action with a click or Enter, in chrome only; nothing
  inside the WBS table carries a utility class.
- **Variants:** `variant` is `default` (filled primary, the main action), `destructive` (filled
  red, an action that cannot be undone), `outline` (page fill, `--control-edge` border; the
  unpressed face of a toggle), `secondary` (quiet fill), `ghost` (no fill until hover; menus and
  toolbars), `link` (primary text, underline on hover). `size` is `default` (`h-9`), `sm`
  (`h-8`, `text-xs`), `lg` (`h-10`), `square` (`h-8 w-8`, for a glyph or inline SVG icon).
- **States:** hover, focus-visible ring, disabled at 50% with no pointer events, pressed
  (`aria-pressed="true"`) always drawn filled in primary whatever the variant, and staying filled
  under the pointer.
- **Helpers:** `buttonVariants()` returns the merged classes, for an anchor that must look like a
  button; `MENU_ITEM` lays a `ghost` button out as one row of a menu.
- **Anti-patterns:** no icon-only button without an accessible name; no `link` variant for
  navigation (use an anchor with `buttonVariants()`); never nest a button in a link; never two
  `default` buttons on one surface; never call the cva table raw, because `cva` appends without
  merging and the base's `border-0` then beats `outline`'s `border`; `type` is not defaulted, so
  a non-submitting button inside a form says `type="button"`.

## Card

- **Purpose:** a bordered, shadowed panel for chrome that stands apart from the page rather than
  flowing down it, such as a signed-out page's single form.
- **Parts:** `Card`, `CardHeader`, `CardTitle` (`as` chooses `h2`, the default, to `h4`),
  `CardDescription`, `CardContent`, `CardFooter`.
- **Variants:** none; a different panel is a `className`, not a flag.
- **States:** none of its own; it is static.
- **Anti-patterns:** no card inside a card; no card as a layout grid cell; no `CardTitle` level
  that skips one, because a screen reader's outline then lies.

## Input

- **Purpose:** single-line text entry in chrome; an input inside the WBS table is a cell, not
  this.
- **Variants:** none. It is `w-full` and fills its container; a narrower box passes a width class.
- **States:** placeholder in muted ink, focus-visible ring, disabled at 50% with a not-allowed
  cursor, invalid via `aria-invalid`.
- **Anti-patterns:** never without a `Label` or `aria-label`; no `size` variant, since only two
  places need a narrower box.

## Label

- **Purpose:** the visible name of a field; a plain `<label>`, not Radix's.
- **Variants:** none.
- **States:** none of its own; the control it holds carries them.
- **Anti-patterns:** never beside its control without `htmlFor`; nest the control inside the
  label, which is the association every caller here uses and every test queries by
  `getByLabel`.

## Modal

- **Purpose:** a blocking surface on Radix Dialog, portalled to `<body>` on `--layer-modal`,
  and the one place a host app holds its page-level keyboard back.
- **Parts:** `Modal` (open state), `ModalTrigger`, `ModalClose`, `ModalOverlay`, `ModalContent`,
  `ModalHeader`, `ModalFooter`, `ModalTitle`, `ModalDescription`.
- **Variants:** `ModalContent`'s `side` is `centre` (a dialog, the default), `right`, `left` or
  `bottom` (sheets). `closeButton` (on by default) draws the ✕; `held` mounts whatever the app
  needs only while the surface is open.
- **States:** closed, open; focus trapped while open and returned on close; Escape and a click
  away dismiss it, except a tap on a toast, which leaves it open.
- **Anti-patterns:** never without a `ModalTitle`, or a screen reader announces "dialog"; no
  `closeButton` beside a Cancel button that already dismisses; no modal for information a toast
  or hover card can carry.

## Control helpers

Class strings from `src/control.ts` for controls the kit has no component for.

- `CONTROL_HEIGHT`: 44px below `sm`, the chrome's 36px above, so a phone can hit one control
  without its neighbour.
- `SELECT_CLASS`: a native `<select>` drawn with the `Input` tokens; the platform's list and its
  keyboard stay.
- `FORM_CLASS`: a one-line form, fields stacked over the button on a phone, side by side from
  `sm`.
- `FIELD_LABEL_CLASS`: the caption above a form field.

## For agents

- Open the Storybook, `bunx nx run shared-ui-saas-01:storybook`, to see every variant in both
  palettes.
- A new variant goes in the cva table, its story and this file in one change.
