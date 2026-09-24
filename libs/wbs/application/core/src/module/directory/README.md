# Directory

A sealed resource module installed per admitted scope: `servicesOver` in
`libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
admitted batch, over that scope's own store. `module.ts` seals the graph, `check.ts` is the only
place that builds a bag, and `contract.ts` states the store, the broadcaster and the clock a host
must supply.

`directory.resource.ts` (the moved `service/directory.service.ts`) keeps the global vocabulary —
teams, people, services, tags, work item types and external systems — adding, renaming and removing
its rows, refusing a removal that is still in use unless it cascades, and announcing a rename or a
removal to every project it touches. Private bindings are named under the `application.directory`
label, so a DI failure says which module asked.

## Checks

The module's tests run under the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/service/directory.service.ts` keeps the former path for delivery,
Plan import, Plan commands, `@wbs/core`'s barrel and be-01's deep-import shim.
