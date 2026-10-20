## ADDED Requirements

### Requirement: One token stylesheet

`libs/shared/adapters/ui/src/theme.css` SHALL define every semantic colour, radius, font and spacing token the shared primitives read, under shadcn's custom-property names, in a light and a dark palette, each declaring `color-scheme`, and SHALL expose them to Tailwind through `@theme inline`.

#### Scenario: Both palettes are complete

- **WHEN** the stylesheet is parsed
- **THEN** `:root` and `.dark` each declare the same set of token names, and a name present in one and absent from the other fails `theme.test.ts`

### Requirement: The values are the PUNI brand

The light palette SHALL be paper and ink with the warm gold accent, the dark palette night and on-night with the same gold, the display face Inter Tight and the body face Geist.

#### Scenario: Brand values, not shadcn defaults

- **WHEN** `theme.test.ts` reads `--primary`, `--accent` and `--font-sans` from the light palette
- **THEN** none equals shadcn's slate default and the accent is the PUNI gold

### Requirement: Every app paints from the shared theme

`apps/wbs/fe-01` and `apps/website/fe-01` SHALL import the shared theme and SHALL NOT redeclare a token it defines. App-specific tokens (the WBS status hues, grid surfaces and layer order) remain in the app's own stylesheet.

#### Scenario: WBS reads the shared palette

- **WHEN** the WBS sign-in page renders in light and dark
- **THEN** the page background, text and primary button computed colours equal the shared theme's values, and `styles.test.ts` finds no shared token name redeclared in `apps/wbs/fe-01/src/styles.css`

#### Scenario: Website app reads the shared palette

- **WHEN** `/manual` renders at desktop and mobile widths
- **THEN** its ink, paper and accent colours and its two font families come from the shared theme, with no horizontal overflow and visible focus states

### Requirement: Contrast claims survive the repaint

Every WBS browser check that measures a contrast ratio (`control-edge.spec.ts`, `status.spec.ts`, `plan-table-review.spec.ts`, `header.spec.ts`, `dark-mode.spec.ts`) SHALL pass on the PUNI values in both palettes.

#### Scenario: A token below threshold fails the gate

- **WHEN** `--control-edge` is set to a value that measures under 3:1 against `--background`
- **THEN** `control-edge.spec.ts` fails naming the ratio, in both palettes
