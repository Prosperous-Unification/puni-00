# Calendar marker

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

The module's tests run under the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/service/calendar-marker.service.ts` keeps the former path for
delivery, `@wbs/core`'s barrel and be-01's deep-import shim.
