# Plan commands

<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.plan-commands","memberships":[{"kind":"path","path":"contract.ts"},{"kind":"path","path":"plan-commands.feature.test.ts"},{"kind":"path","path":"plan-commands.feature.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."},{"section":"invariants","reason":"The project a command is bound to and the route it reaches are documented on PlanCommands and planCommandsFor; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/plan-live.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/plan-toolbar.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-estimate-drafts.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-fields.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-read.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-structure.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-reference-sets.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/composition.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/contract.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/project-runtime.ts"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->

Every request a plan gesture sends to one open project: the edits to its work items, its steps,
its settings and its schedule, undo and redo, the archival download, and the directory entries a
picker creates on the way to attaching one.

One kind, plain TypeScript, no React (rule F1 of the code organization design in
`docs/superpowers/specs/2026-09-19-code-organization-design.md`).

- `contract.ts` declares the module's **private repository port**, `PlanCommandRoutes` — the
  thirty-four routes of the HTTP client these commands write through and nothing else — and the
  **feature** surface delivery sees instead, `PlanCommands` (rule K2).
- `plan-commands.feature.ts` binds the commands to one project over that port.

## What it owns

- Which routes a plan command may reach. Listing the projects, renaming or importing one, and
  reading the plan are not among them: the first three are the project catalog's, the last the
  plan feed's.
- The project a command is about, bound once: a table cannot send a write to a project it did not
  open.
- Reaching each route at the moment of the call, and handing back the route's own promise, so a
  refusal arrives as the object the client threw.

## What it does not own

The gesture policy. What each write leaves out of date, which several requests make one gesture,
and whether the answer still belongs to the reader on screen stay with the table's hooks and the
plan writer (`modules/plan-writer/`) until the command services of the design's frontend table —
fields, structure, dependencies, estimates, references, settings, scheduling, history — are
extracted one by one, each consuming its own narrower port.

## Relationships

There is no `module.ts`: nothing in this application is composed through DI Bag yet. The one
composition site is `modules/project/composition.ts`, which hands this module the one HTTP client
as its port; delivery receives `PlanCommands` through the table and never the port.

## Checks

The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's suite is
`plan-commands.feature.test.ts`. The behaviour the move preserves is proved by the plan table's
own suites, which run in the `test` target of the same project.

Its isolated type check is the `typecheck:module` target of the same project, which `typecheck`
depends on, recorded in the index above as `check.fe-01.typecheck-module`: `tsconfig.json` here
extends `../tsconfig.module.json` and names what this module reaches beyond the shared list there.
