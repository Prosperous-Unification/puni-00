# Work item

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

The module's tests run under the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/service/work-item.service.ts` keeps the former path for delivery,
Plan commands, Plan import, Saved plans, the test harness, `@wbs/core`'s barrel and be-01's
deep-import shim.
