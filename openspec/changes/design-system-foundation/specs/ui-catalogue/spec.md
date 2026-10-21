## ADDED Requirements

### Requirement: Written design specs

Core SHALL carry `DESIGN.md` stating the principles, the meaning of every vocabulary token group and the list of kits with their purpose. Each kit SHALL carry `DESIGN.md` stating its values, its type and spacing scales, and for each primitive its purpose, variants, states and anti-patterns. `LLM_README.md` SHALL link core's as the document to read before generating or reviewing UI.

#### Scenario: Kit spec is total over primitives

- **WHEN** `design-spec.test.ts` lists the primitives `@ui/saas-01` exports
- **THEN** each has a `## <Name>` section in the kit's `DESIGN.md`, and a primitive without one fails by name

#### Scenario: Core spec lists every kit

- **WHEN** `design-spec.test.ts` lists the `ui-*-01` projects other than core
- **THEN** each is named in core's `DESIGN.md`, and a kit without a line fails by name

### Requirement: Storybook renders a whole kit

Each kit SHALL carry a Storybook with one story file per primitive covering every variant, every size and the pressed and disabled states, with a light and dark toolbar that toggles `.dark` on the same stylesheet. `build-storybook` SHALL be part of the kit's `build` target.

#### Scenario: Stories are total

- **WHEN** `stories.test.ts` lists the kit's primitives and each cva variant key
- **THEN** every primitive has a story file and every variant key appears in it, and a missing story or variant fails by name

#### Scenario: Story build failure blocks

- **WHEN** a story imports a primitive export that no longer exists
- **THEN** `build-storybook` exits non-zero and the kit's `build` target fails
