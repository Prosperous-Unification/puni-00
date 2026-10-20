# PUNI design system

Read this before generating or reviewing any UI. Terms are in [CONTEXT.md](CONTEXT.md); the
behaviour contract is `openspec/changes/design-system-foundation`. Tokens live in
[`src/theme.css`](src/theme.css); if this file and the stylesheet disagree, the stylesheet is
right and this file has a bug.

## Principles

1. **One vocabulary.** Colour is named for its role (`primary`, `muted`, `destructive`), never
   for its hue. A component reads tokens; it never carries a literal colour.
2. **Two palettes, one set of names.** Dark mode re-points the same tokens under `.dark`.
   Nothing is written twice.
3. **Primitives are owned.** Every component is source in this repo, with its rationale in
   JSDoc. Nothing is installed at runtime from a UI package.
4. **Measured, not assumed.** Every contrast claim is a browser test. A value changes until the
   test passes; the threshold never moves.
5. **Quiet by default.** Chrome recedes, content leads. The accent is for the one action that
   matters on a surface, not for decoration.

## Tokens

### Colour

| Token                                        | Role                                            |
| -------------------------------------------- | ----------------------------------------------- |
| `--background` / `--foreground`              | the page and its text                           |
| `--card` / `--card-foreground`               | a surface that stands apart from the page       |
| `--popover` / `--popover-foreground`         | a floating surface over the page                |
| `--primary` / `--primary-foreground`         | the one main action; filled                     |
| `--secondary` / `--secondary-foreground`     | a supporting action; quiet fill                 |
| `--muted` / `--muted-foreground`             | de-emphasised surfaces and secondary text       |
| `--accent` / `--accent-foreground`           | PUNI gold; hover and selection, one per surface |
| `--destructive` / `--destructive-foreground` | an action that cannot be undone                 |
| `--border`, `--input`                        | hairlines on surfaces and fields                |
| `--ring`                                     | the keyboard focus ring                         |

Light: paper white, ink near-black, warm gold accent. Dark: night violet-black, on-night
off-white, the same gold. Exact values: `src/theme.css`.

### Type

Display face Inter Tight, body face Geist, both variable and self-hosted. Scale: TODO, carried
over from the website's `--text-*` ramp when slice 2 lands.

### Radius and spacing

`--radius` is the base; components derive `rounded-md`, `rounded-lg` from it. Spacing is
Tailwind's default 4px scale. TODO: confirm the card radius after the WBS repaint review.

## Primitives

Each section names purpose, variants, states and anti-patterns. The headings are fixed:
`design-spec.test.ts` checks every exported primitive has one.

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

- **Purpose:** a blocking dialog portalled to `<body>` on `--layer-modal`.
- **States:** open, closing; focus trapped and returned on close.
- **Anti-patterns:** no modal for information a toast or hover card can carry.

## For agents

- Compose from `@shared/ui`; do not re-implement a primitive in an app.
- Use token utilities (`bg-primary`, `text-muted-foreground`), never arbitrary colours.
- A new variant goes in the cva table, its story and this file, in one change.
- Open the Storybook (`bunx nx run shared-ui:storybook`) to see every variant in both palettes.
