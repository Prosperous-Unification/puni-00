# Capacity

A sealed resource module installed per admitted scope: `servicesOver` in
`libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
admitted batch, over that scope's own stores. `module.ts` seals the graph, `check.ts` is the only
place that builds a bag, and `contract.ts` states the stores, the broadcaster and the clock a host
must supply.

`capacity.resource.ts` (the moved `service/capacity.service.ts`) lists how many of each team a
project may have at work at once and gates the write on `canEditProject`, announcing
`capacity_changed` to that project alone. Private bindings are named under the
`application.capacity` label, so a DI failure says which module asked.

## Checks

The module's tests run under the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/service/capacity.service.ts` keeps the former path for Plan commands,
`@wbs/core`'s barrel and be-01's deep-import shim.
