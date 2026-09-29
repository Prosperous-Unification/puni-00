# Calendar marker

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.calendar-marker","memberships":[{"kind":"path","path":"calendar-marker.resource.test.ts"},{"kind":"path","path":"calendar-marker.resource.ts"},{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts, index.ts and the compatibility shim."},{"section":"invariants","reason":"The single-clock-reading `createdAt` and announce-after-write rules are documented on CalendarMarkerService; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/be-01/src/app.ts"},{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/http/calendar-marker.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/http/project.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"}],"knowledgeLimit":"The composition root, the core barrel, the calendar-marker and project routes and be-01's app are declared; the writes fixture, the organization harness, the sideways-type boundary test and the be-01 controller tests are not tracked here."}} -->

A sealed resource module installed per admitted scope: `servicesOver` in
`libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
admitted batch, over that scope's own stores. `module.ts` seals the graph, `check.ts` is the only
place that builds a bag, and `contract.ts` states the stores, the clock and the optional broadcaster
a host must supply.

`calendar-marker.resource.ts` (the moved `service/calendar-marker.service.ts`) lists a project's
markers and gates their four writes on `canEditProject`, announcing `calendar_markers_changed` after
each. Private bindings are named under the `application.calendar-marker` label, so a DI failure says
which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/index.ts` re-exports `calendar-marker.resource.ts` from the
`@wbs/core` barrel; `libs/wbs/application/core/src/http/calendar-marker.routes.ts`,
`libs/wbs/application/core/src/http/project.routes.ts` and `apps/wbs/be-01/src/app.ts` import it
directly.

## Wiki registration

A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.application.calendar-marker` (`docs/wiki-policy/policy.json`'s `boundary.application.calendar-marker`). The
boundary's `sourceSelector` binds this directory to `calendar-marker.resource.ts`'s own single
pre-namespacing predecessor, `calendar-marker.service.ts`, which existed at the pilot's frozen
`sourceRevision` — the same mechanism `boundary.application.saved-plans` uses for its
`saved-plan.service.ts` predecessor. The other files here have no separate baseline entry: the
registration's guarantee is one predecessor per module directory, not one per file it holds. The moved `calendar-marker.resource.test.ts` has no baseline entry either, although its own
predecessor existed then too.
