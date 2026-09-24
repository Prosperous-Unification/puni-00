# Optimization

The optimized-schedule feature as a sealed DI Bag module under `apps/wbs/be-01`: `module.ts` seals
the graph, `check.ts` is the only place that builds a bag, and `contract.ts` states what a host must
supply and the neutral port types Optimization shares with its launchers — the reserved spawn
request, the solver child and the spawner — the cache-key port it hashes an input through, and the
three outcome events it publishes, projected from the neutral `ProjectEvent`.

`optimization.feature.ts` (the moved `service/optimization-coordinator.ts`) admits, queues, launches,
heartbeats and records solver attempts for the plan read and for Retry. `solver-child-lifecycle.ts`
and `optimized-schedule-reader.ts` are its private support: the one drains, heartbeats and releases
a bound child, the other names the plan read's question of the optimized cache. Private bindings are
named under the `backend.optimization` label, so a DI failure says which module asked.

## Checks

The module's tests run under the `wbs-be-01:test` target declared in `apps/wbs/be-01/project.json`.

## Consumers

`apps/wbs/be-01/src/services.ts` installs the module once per composition; `bootBe01` starts and
stops the coordinator it returns. `apps/wbs/be-01/src/service/optimization-coordinator.ts`,
`service/solver-child-lifecycle.ts` and `service/optimized-schedule-reader.ts` keep the former paths
for `app.ts`, the local solver launcher, the controller tests and the optimization database tests.
