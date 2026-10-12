## ADDED Requirements

### Requirement: Plan-document step references use canonical sortable spelling

A plan-document export SHALL spell each derived coded step-node reference with the same ordinal-first, project-width-padded canonical reference as the work-item read. Import SHALL continue to ignore the explanatory reference and derive node identity from the structured work-item and step IDs.

#### Scenario: Export and import preserve node identity

- **GIVEN** a project with a coded second step Impl and a leaf `010`
- **WHEN** the project is exported with twelve steps and imported into a new project
- **THEN** the export spells `010.s02-impl` beside the structured node IDs, and the imported project derives its own step-node IDs from its copied work-item and step IDs
