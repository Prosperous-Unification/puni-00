# Calendar markers

<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.calendar-markers","memberships":[{"kind":"path","path":"calendar-markers.feature.test.ts"},{"kind":"path","path":"calendar-markers.feature.ts"},{"kind":"path","path":"calendar-markers.resource.test.ts"},{"kind":"path","path":"calendar-markers.resource.ts"},{"kind":"path","path":"composition.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."},{"section":"invariants","reason":"What the resource and the feature own is documented on createCalendarMarkers and calendarMarkersFor; no invariant spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/composition.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/contract.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/project-runtime.ts"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->

The dates a person marks on one project's chart, and the four edits that change them: putting a
marker on a day, renaming it, recolouring it, and taking it off.

Two kinds in one module, because the feature exclusively owns the resource. Both are plain
TypeScript and import no React, which is rule F1 of the code organization design in
`docs/superpowers/specs/2026-09-19-code-organization-design.md`.

- `calendar-markers.resource.ts` is the **resource**-service: one aggregate — this project's
  markers — the four routes that change it, and what each change leaves out of date.
- `calendar-markers.feature.ts` is the **feature**-service: the markers a reader may put on the
  chart for as long as it owns the chart, which is what a screen asks for and the only thing
  delivery may import (rule K2).
- `composition.ts` is where the feature meets its routes, `CalendarMarkerRoutes`, this module's
  private repository port. The project composition root calls it; a screen does not.

## What the resource owns

- The four calls on the project API, and nothing else it could do to a project.
- The edit as a value, so the same edit can be sent once and reasoned about twice.
- That every marker edit dirties the `markers` resource and no other — not the tree, because a
  marker moves nothing in the schedule.
- That a refusal travels as the cause it was thrown as, unworded.

## What the feature owns

Whether the write still belongs to whoever asked for it: the refresh owner it started against is
still the one answered. An owner replaced under it and a reader withdrawn from the project or the
API it was opened for both fail that, because the host answers no owner from the withdrawal on. A
refusal is said and the markers are read again only while it holds. A refused write rereads as an
accepted one does, because the marker it named may have gone.

## What neither owns

The read. The marker list on screen is the plan feed's `markers` resource, invalidated from here
and never fetched here. The words a refusal is said in, which are built where they are said. The
chart, the chips, the day sheet and the composer, which are the Gantt panel's.

## How it is read

It is not read at all: this module answers no question. Four gestures go in, a reread of the
feed's `markers` resource comes out, and every answer a person sees arrives through the plan feed.

## Relationships

There is no `module.ts`: DI Bag 0.4.0 is installed but nothing in this application is composed
through it yet, which is the rollout's lifetimes task, so `composition.ts` is a function, as
`modules/plan-feed/composition.ts` is. Its one caller is the project composition root,
`modules/project/composition.ts`, which hands it the page's one client as its routes. The project
runtime, `apps/wbs/fe-01/src/runtime/project-runtime.ts`, builds the gestures once per selected
project through the project's services and hands them the refresh owner of the plan feed it holds
while it is current, and none once it has been withdrawn; the four chart gestures reach it through
`wbs-table.tsx`.

## Checks

The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's suites are
`calendar-markers.resource.test.ts` and `calendar-markers.feature.test.ts`. The behaviour this
extraction preserves is proved by `plan-chart-seam.test.tsx`, which drives the real table through
the four gestures, and by the Gantt panel's own day-sheet suites, which run in the `test` target
of the same project.

Its isolated type check is the `typecheck:module` target of the same project, which `typecheck`
depends on, recorded in the index above as `check.fe-01.typecheck-module`: `tsconfig.json` here
extends `../tsconfig.module.json` and names what this module reaches beyond the shared list there.
