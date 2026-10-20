## ADDED Requirements

### Requirement: A kit owns a complete theme

A kit SHALL ship `theme.css` that imports core's vocabulary and assigns every vocabulary token a value in a light palette under `:root` and a dark palette under `.dark`, each declaring `color-scheme`. It carries no reset and no `@source`.

#### Scenario: Both palettes are complete

- **WHEN** `theme.test.ts` parses the kit's `theme.css` against core's vocabulary
- **THEN** `:root` and `.dark` each assign every vocabulary token, and a token assigned in one and missing from the other fails by name

#### Scenario: SaaS kit starts on WBS's values

- **WHEN** `theme.test.ts` reads `--primary`, `--background` and `--ring` from `@ui/saas-01` in both palettes
- **THEN** they equal the values `apps/wbs/fe-01/src/styles.css` carried at `a1a33b2cc`, so no WBS pixel moves

### Requirement: A kit owns its primitives

`@ui/saas-01` SHALL export `Button`, `buttonVariants`, `Card` with its parts, `Input`, `Label`, `Modal` and the control helpers, each keeping its cva variant table and JSDoc from `apps/wbs/fe-01/src/components/ui`. Kits do not share components; a kit that needs one copies and owns it.

#### Scenario: WBS imports the kit

- **WHEN** `apps/wbs/fe-01` builds
- **THEN** no file under `apps/wbs/fe-01/src/components/ui` defines a primitive the kit exports, and every former import resolves to `@ui/saas-01`

#### Scenario: A primitive without preflight

- **WHEN** `Button` renders in a document with no reset applied
- **THEN** its computed border width is 0 and its background is the variant's token, not the platform `ButtonFace`

### Requirement: Every app paints from its kit's theme

An app SHALL import exactly one kit's `theme.css` and SHALL NOT redeclare a vocabulary token. App-only tokens stay in the app's stylesheet, and the app's Tailwind `@source` list SHALL include the kit's sources.

#### Scenario: WBS reads the kit's theme

- **WHEN** `styles.test.ts` reads `apps/wbs/fe-01/src/styles.css`
- **THEN** it imports `@ui/saas-01/theme.css`, names the kit's `src` in `@source`, and redeclares no vocabulary token

#### Scenario: Missing kit source leaves a button unpainted

- **WHEN** the kit's `@source` entry is removed from the WBS stylesheet
- **THEN** `control-edge.spec.ts` fails on the sign-in page's outline button with no painted edge

### Requirement: A kit publishes a registry

Each kit SHALL carry `registry.json` naming every primitive with its files and dependencies, and `bunx nx run ui-saas-01:registry` SHALL build the per-item JSON with the shadcn CLI and validate it.

#### Scenario: Registry is total

- **WHEN** `registry.test.ts` lists the primitive files the kit exports
- **THEN** every one appears in `registry.json`, and removing an entry fails by name

#### Scenario: Registry build is validated

- **WHEN** a `registry.json` entry names a file that does not exist
- **THEN** the registry target exits non-zero and the gate fails
