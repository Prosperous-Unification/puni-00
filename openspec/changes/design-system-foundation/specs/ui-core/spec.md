## ADDED Requirements

### Requirement: Core carries the vocabulary and nothing else

`@ui/core-01` SHALL export `vocabulary.css`, which maps every shadcn semantic token name (`--background`, `--foreground`, `--primary`, `--border`, `--ring`, `--radius` and the rest) into Tailwind utilities through `@theme inline` without assigning a value, plus `brand.css` holding the PUNI constants (gold, night, paper, ink, the Geist and Inter Tight faces and their files) and the `cn` helper. It SHALL export no component.

#### Scenario: Vocabulary assigns no value

- **WHEN** `vocabulary.test.ts` parses `vocabulary.css`
- **THEN** every declaration under `@theme inline` is a `var()` reference and none is a literal colour, length or font

#### Scenario: Core has no component

- **WHEN** `surface.test.ts` lists the exports of `@ui/core-01`
- **THEN** none is a React component, and adding a `.tsx` export fails the test by name

### Requirement: Kits build on core only

A kit SHALL import the vocabulary and the brand constants from core and SHALL NOT import from another kit, from an app or from a non-browser lib.

#### Scenario: Boundary refusal

- **WHEN** a `@ui/saas-01` source file imports from `@wbs/core`, from `apps/wbs/fe-01` or from a `runtime:bun` project
- **THEN** `@nx/enforce-module-boundaries` reports the import and lint fails
