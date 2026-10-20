## ADDED Requirements

### Requirement: A written design spec

`libs/shared/adapters/ui/DESIGN.md` SHALL state the system's principles, the meaning of every token group, the type and spacing scales, and for each primitive its purpose, variants, states and anti-patterns. `LLM_README.md` SHALL link it as the document to read before generating or reviewing UI.

#### Scenario: Spec is total over primitives

- **WHEN** `design-spec.test.ts` lists the primitives `@shared/ui` exports
- **THEN** each has a section in `DESIGN.md`, and a primitive without one fails the test by name

### Requirement: Storybook renders the whole system

The lib SHALL carry a Storybook with one story file per primitive covering every variant, every size, the pressed and disabled states, in light and dark. `bunx nx run shared-ui:build-storybook` SHALL be part of the lib's `build` target so the gate proves the stories compile.

#### Scenario: Stories are total

- **WHEN** `stories.test.ts` lists the primitives and each cva variant key
- **THEN** every primitive has a story file and every variant key appears in it, and a missing story or variant fails the test by name

#### Scenario: Both palettes

- **WHEN** any story is opened
- **THEN** the toolbar offers light and dark, and switching re-points the same tokens rather than loading a second stylesheet

#### Scenario: Story build failure blocks

- **WHEN** a story imports a primitive export that no longer exists
- **THEN** `build-storybook` exits non-zero and the lib's `build` target fails
