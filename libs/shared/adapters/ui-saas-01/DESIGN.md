# SaaS kit `@ui/saas-01`

Dense application chrome: tables you type into, toolbars, dialogs, forms. Read
[core's DESIGN.md](../ui-core-01/DESIGN.md) first. Tokens live in [`src/theme.css`](src/theme.css);
if this file and the stylesheet disagree, the stylesheet is right and this file has a bug.

## Values

Light: white page, near-black slate ink, slate hairlines. Dark: deep slate page, off-white ink.
Both palettes start as the values WBS was tuned on through its UI review; taking the brand gold
as `--accent` is a later change with its own by-eye review. Exact values: `src/theme.css`.

## Scales

Type: `text-sm` is the working size, `text-base` for prose, `text-xs` for quiet counts. Spacing
is Tailwind's 4px scale; controls are `h-9`. `--radius` is 0.5rem.

## Primitives

The headings are fixed: `design-spec.test.ts` checks every exported primitive has one.

## Button

- **Purpose:** the one way to trigger an action with a click or Enter.
- **Variants:** `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`. Sizes
  `default`, `sm`, `lg`, `square`.
- **States:** hover, focus-visible ring, disabled at 50% with no pointer events, pressed
  (`aria-pressed="true"`) always drawn filled in primary whatever the variant.
- **Anti-patterns:** no icon-only button without an accessible name; no `link` variant for
  navigation (use an anchor); never two `default` buttons on one surface.

## Card

- **Purpose:** a bordered, shadowed panel for chrome that stands apart from the page.
- **Parts:** `Card`, `CardHeader`, `CardTitle` (`as` chooses h2 to h4), `CardContent`.
- **Anti-patterns:** no card inside a card; no card as a layout grid cell.

## Input

- **Purpose:** single-line text entry.
- **States:** focus ring, disabled, invalid via `aria-invalid`.
- **Anti-patterns:** never without a `Label` or `aria-label`.

## Label

- **Purpose:** the visible name of a field, bound by `htmlFor`.

## Modal

- **Purpose:** a blocking dialog portalled to `<body>` on the app's modal layer.
- **States:** open, closing; focus trapped and returned on close.
- **Anti-patterns:** no modal for information a toast or hover card can carry.

## For agents

- Open the Storybook, `bunx nx run ui-saas-01:storybook`, to see every variant in both palettes.
- Use `buttonVariants()` on an anchor that must look like a button; never nest a button in a link.
