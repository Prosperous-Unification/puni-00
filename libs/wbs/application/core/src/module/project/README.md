# Project

A sealed resource module installed per admitted scope: `servicesOver` in
`libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
admitted batch, over that scope's own store. `module.ts` seals the graph, `check.ts` is the only
place that builds a bag, and `contract.ts` states the store, the clock, the broadcaster and the
optional optimizer availability a host must supply.

`project.resource.ts` (the moved `service/project.service.ts`) creates a project with its starting
steps, lists and reads projects, and updates their settings on a `canEditProject`-gated write,
refusing to switch an optimizer on where the deployment has none and announcing
`project_settings_changed` when a setting moved. Private bindings are named under the
`application.project` label, so a DI failure says which module asked.

## Checks

The module's tests run under the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/service/project.service.ts` keeps the former path for delivery, Saved
plans, test fixtures, `@wbs/core`'s barrel and be-01's deep-import shim.
