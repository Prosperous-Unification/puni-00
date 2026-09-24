# Priority band

A sealed resource module installed per admitted scope: `servicesOver` in
`libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
admitted batch, over that scope's own stores. `module.ts` seals the graph, `check.ts` is the only
place that builds a bag, and `contract.ts` states the stores, the broadcaster and the clock a host
must supply.

`priority-band.resource.ts` (the moved `service/priority-band.service.ts`) reads a project's
priority ladder and replaces it on a `canEditProject`-gated write, announcing
`priority_bands_changed` to that project. Private bindings are named under the
`application.priority-band` label, so a DI failure says which module asked.

## Checks

The module's tests run under the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/service/priority-band.service.ts` keeps the former path for Plan
commands, `@wbs/core`'s barrel and be-01's deep-import shim.
