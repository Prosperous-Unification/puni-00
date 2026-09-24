# Solver supervisor

The host Solver supervisor's client as a sealed DI Bag repository module under `apps/wbs/be-01`:
`module.ts` seals the graph, `check.ts` is the only place that builds a bag, and `contract.ts`
states the socket, caller identity and resource requests a host must supply.

`solver-supervisor.repository.ts` (the moved `service/solver-supervisor-client.ts`) speaks the
bounded, non-multiplexed Supervisor protocol over one Unix socket per attempt.
`solver-supervisor-spawner.ts` is its private support: the request/attempt mapper that adapts the
Optimization contract's reserved spawn request to one Supervisor request and the returned attempt
to the contract's solver child. The module exports that adapted launcher port and nothing else.
Private bindings are named under the `backend.solver-supervisor` label, so a DI failure says which
module asked.

## Checks

The module's tests run under the `wbs-be-01:test` target declared in `apps/wbs/be-01/project.json`.

## Consumers

`apps/wbs/be-01/src/main.ts` installs the module and hands its launcher port to the Optimization
coordinator; `apps/wbs/be-01/src/service/solver-supervisor-client.ts` keeps the former path for the
two Supervisor diagnostic scripts under `apps/wbs/be-01/scripts/`.
