## ADDED Requirements

### Requirement: Shared primitives package

`libs/shared/adapters/ui` SHALL export `Button`, `buttonVariants`, `Card` with its parts, `Input`, `Label`, `Modal`, `cn` and the control helpers through `@shared/ui`, tagged `scope:shared ring:adapter runtime:browser product:shared type:ui`. Each primitive SHALL keep its cva variant table and JSDoc from `apps/wbs/fe-01/src/components/ui`.

#### Scenario: WBS imports the shared primitives

- **WHEN** `apps/wbs/fe-01` builds
- **THEN** no file under `apps/wbs/fe-01/src/components/ui` defines a primitive the lib exports, and every former import resolves to `@shared/ui`

#### Scenario: Boundary refusal

- **WHEN** a lib source file imports from `@wbs/core` or any `runtime:bun` project
- **THEN** `@nx/enforce-module-boundaries` reports the import and lint fails

### Requirement: Primitives neutralise their own platform styling

Every primitive SHALL render correctly whether or not the host document applies a global reset, so the WBS `data-grid` guard and the website app's own reset both stay valid.

#### Scenario: A button without preflight

- **WHEN** `Button` renders in a document with no reset applied
- **THEN** its computed border width is 0 and its background is the variant's token, not the platform `ButtonFace`

### Requirement: A registry describes the primitives

The lib SHALL carry a `registry.json` naming every primitive with its files, dependencies and registry dependencies, and `bunx nx run shared-ui:registry` SHALL build the per-item JSON files with the shadcn CLI and validate them.

#### Scenario: Registry is total

- **WHEN** `registry.test.ts` lists the primitive files exported by `@shared/ui`
- **THEN** every one appears in `registry.json`, and removing an entry fails the test naming the missing primitive

#### Scenario: Registry build is validated

- **WHEN** a `registry.json` entry names a file that does not exist
- **THEN** the registry target exits non-zero and the gate fails
