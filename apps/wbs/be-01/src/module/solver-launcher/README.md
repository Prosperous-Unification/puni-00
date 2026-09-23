# Solver launcher

The first sealed DI Bag module under `apps/wbs/be-01`, following the core modules' pattern:
`module.ts` seals the graph, `check.ts` is the only place that builds a bag, and `contract.ts`
states the two optional process seams a host may supply.

`solver-launcher.repository.ts` (the moved `service/solver-launcher-process.ts`) reads the installed
`wbs-solver-launcher` version, reads the source module's version in the source-run development
container, and spawns the launcher child with its one-byte verdict transport. Private bindings are
named under the `backend.solver-launcher` label, so a DI failure says which module asked.

## Checks

The module's tests run under the `wbs-be-01:test` target declared in `apps/wbs/be-01/project.json`.

## Consumers

`apps/wbs/be-01/src/main.ts` and `apps/wbs/be-01/src/dev/main.ts` install the module to read the
solver version; `apps/wbs/be-01/src/service/solver-launcher-process.ts` keeps the former path for
`dev/local-solver-spawner.ts`, `services.db.test.ts` and `solver-child-lifecycle.db.test.ts`.
