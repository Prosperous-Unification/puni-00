# Work item

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.work-item","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"work-item.resource.test.ts"},{"kind":"path","path":"work-item.resource.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts, index.ts and the compatibility shim."},{"section":"invariants","reason":"The one-stamp-per-act and stale-undo rules are documented on WorkItemService; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/work-item.service.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the compatibility shim are declared; the project and work-item routes, Plan commands, Plan import, Saved plans, the core test harness and the be-01 shim, controller and database tests reach this module through the shim or the barrel and are not tracked here."}} -->

A sealed resource module installed per admitted scope: `servicesOver` in
`libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
admitted batch, over that scope's own stores. `module.ts` seals the graph, `check.ts` is the only
place that builds a bag, and `contract.ts` states the twelve stores, the broadcaster, the scheduler
and the clock a host must supply.

`work-item.resource.ts` (the moved `service/work-item.service.ts`) reads a project's numbered,
scheduled tree, gates its writes on `canEditProject`, journals the reversible ones for undo and
redo, and announces the rebuilt tree after a write. Private bindings are named under the
`application.work-item` label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/service/work-item.service.ts` keeps the former path for delivery,
Plan commands, Plan import, Saved plans, the test harness, `@wbs/core`'s barrel and be-01's
deep-import shim.

## Wiki registration

A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.application.work-item` (`docs/wiki-policy/policy.json`'s `boundary.application.work-item`).
The boundary's `sourceSelector` binds this directory to `work-item.resource.ts`'s own single
pre-namespacing predecessor, `work-item.service.ts`, which existed at the pilot's frozen
`sourceRevision` — the same mechanism `boundary.application.saved-plans` uses for its
`saved-plan.service.ts` predecessor. The other files here have no separate baseline entry: the
registration's guarantee is one predecessor per module directory, not one per file it holds. The
moved `work-item.resource.test.ts` has no baseline entry either, although its own predecessor
existed then too.
