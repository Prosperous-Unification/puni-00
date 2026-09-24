# Project

<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.project","memberships":[{"kind":"path","path":"composition.test.ts"},{"kind":"path","path":"composition.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."},{"section":"invariants","reason":"That one client sits under all three ports and each module sees only its own is documented on projectServicesOver; it spans no other file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/project-page.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-read.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/project-runtime.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/session-runtime.ts"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->

The project composition root: the one place in the frontend that holds the plan's HTTP client
and cuts each plan module's private repository port from it.

Plain TypeScript, no React (rule F1 of the code organization design in
`docs/superpowers/specs/2026-09-19-code-organization-design.md`).

- `contract.ts` declares `ProjectServices`, what a plan screen may build for the project it shows —
  its feed, its calendar-marker gestures and its commands — as feature-services only (rule K2).
- `composition.ts` is `projectServicesOver`, which builds that surface over one client: the plan
  feed reads through `PlanReadRoutes` (`src/lib/plan-refresh.ts`), the calendar markers write
  through `CalendarMarkerRoutes` (`modules/calendar-markers/contract.ts`), and the commands write
  through `PlanCommandRoutes` (`modules/plan-commands/contract.ts`).

## What it owns

- That there is one client under all three ports, and that each module sees only its own port.
- That nothing is built or called until a factory is asked, and every port reaches the client at
  the moment of each call.

## What it does not own

When anything is opened or closed. `contract.ts` also declares `ProjectRuntime`, the services of
one selected project, and the source a runtime is built over; the runtime itself and its owner
are `apps/wbs/fe-01/src/runtime/project-runtime.ts`, which calls these factories once per selected
project and gives what they built back when the project is left. The project catalog —
listing, creating, opening, renaming and importing projects — is the page's, on the same client,
and is not a plan module's.

## Relationships

There is no `module.ts`: nothing in this application is composed through DI Bag yet, so the
composition is a function, as `modules/directory-management/composition.ts` is.

## Checks

The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's suite is
`composition.test.ts`. The behaviour it preserves is proved by the plan table's and the project
page's own suites, which run in the `test` target of the same project.

Its isolated type check is the `typecheck:module` target of the same project, which `typecheck`
depends on, recorded in the index above as `check.fe-01.typecheck-module`: `tsconfig.json` here
extends `../tsconfig.module.json` and names what this module reaches beyond the shared list there.
