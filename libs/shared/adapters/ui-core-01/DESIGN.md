# PUNI design system

Read this before generating or reviewing any UI, then the `DESIGN.md` of the kit the app uses.
Terms are in [CONTEXT.md](CONTEXT.md); the behaviour contract is
`openspec/changes/design-system-foundation`; the decision is
[ADR 0041](../../../../docs/adr/0041-ui-kits-own-their-primitives.md).

## Principles

1. **One vocabulary, many looks.** Colour is named for its role (`primary`, `muted`,
   `destructive`), never for its hue. Core names the roles; a kit assigns the values.
2. **An app uses one kit.** It imports that kit's theme and primitives and nothing from another
   kit. A different purpose is a different kit, not a flag.
3. **Kits own their primitives.** Every component is source in this repo with its rationale in
   JSDoc. Nothing is installed at runtime from a UI package, and nothing is shared between kits
   until two of them carry the same code.
4. **Two palettes, one set of names.** Dark mode re-points the same tokens under `.dark`.
   Nothing is written twice.
5. **Measured, not assumed.** Every contrast claim is a browser test. A value changes until the
   test passes; the threshold never moves.

## Vocabulary

Every kit assigns all of these, in both palettes. Utilities are the shadcn names (`bg-primary`,
`text-muted-foreground`, `border-input`, `ring-ring`).

| Token                                        | Role                                                             |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `--background` / `--foreground`              | the page and its text                                            |
| `--card` / `--card-foreground`               | a surface that stands apart from the page                        |
| `--popover` / `--popover-foreground`         | a floating surface over the page                                 |
| `--primary` / `--primary-foreground`         | the one main action; filled                                      |
| `--secondary` / `--secondary-foreground`     | a supporting action; quiet fill                                  |
| `--muted` / `--muted-foreground`             | de-emphasised surfaces and secondary text                        |
| `--accent` / `--accent-foreground`           | hover and selection; one per surface                             |
| `--destructive` / `--destructive-foreground` | an action that cannot be undone                                  |
| `--border`, `--input`                        | hairlines on surfaces and fields                                 |
| `--ring`                                     | the keyboard focus ring                                          |
| `--radius`                                   | the base corner; `rounded-md` and `-lg` derive                   |
| `--font-body`, `--font-display`              | body and display faces; utilities `font-sans` and `font-heading` |

## Brand constants

`brand.css` holds what every kit may draw its values from and no kit may redefine.
`design-spec.test.ts` checks every constant is named here.

| Constant                                            | What it is                                            |
| --------------------------------------------------- | ----------------------------------------------------- |
| `--brand-paper`, `--brand-paper-2`                  | the light page and its second surface                 |
| `--brand-ink`, `--brand-ink-2`, `--brand-muted`     | light text, its second weight, its quiet weight       |
| `--brand-line`, `--brand-line-strong`               | hairline, and the 3:1 control edge on paper           |
| `--brand-night`, `--brand-night-2`                  | the dark page and its second surface                  |
| `--brand-on-night`, `--brand-on-night-muted`        | dark text and its quiet weight                        |
| `--brand-gold`, `--brand-gold-ink`, `--brand-focus` | the accent, text on it, the focus ring on paper       |
| `--brand-font-display`, `--brand-font-body`         | Inter Tight and Geist, self-hosted under `src/fonts/` |

## Kits

| Kit                  | Purpose                                                     | Status  |
| -------------------- | ----------------------------------------------------------- | ------- |
| `@ui/saas-01`        | dense application chrome: WBS and future product UIs        | planned |
| `@ui/agency-site-01` | the agency site look: big radius, display type, gold accent | later   |

## Designing screens

Screens are explored on Claude Design, settled as screen stories and built in the app:
[runbook](../../../../docs/runbook-screen-design.md).

## For agents

- Find the app's kit in its `styles.css` import, then read that kit's `DESIGN.md`.
- Compose from the kit; never re-implement a primitive in an app and never import across kits.
- Use token utilities, never arbitrary colours or fonts.
- A new variant goes in the cva table, its story and the kit's `DESIGN.md`, in one change.
