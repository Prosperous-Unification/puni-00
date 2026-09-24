# Optimization

<!-- module-index {"schemaVersion":1,"moduleId":"module.backend.optimization","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"optimization.feature.ts"},{"kind":"path","path":"optimized-schedule-reader.test.ts"},{"kind":"path","path":"optimized-schedule-reader.ts"},{"kind":"path","path":"solver-child-lifecycle.ts"}],"relationshipSelectors":[],"applicableChecks":["check.be-01.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading services.ts, the Supervisor module and the three compatibility shims."},{"section":"invariants","reason":"The admit-before-spawn, heartbeat-before-release and commit-then-push invariants are documented on OptimizationCoordinator and runSolverChildLifecycle; apps/wbs/be-01/src/module-boundaries.test.ts checks the import routes the contract must not take."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/be-01/src/module/solver-supervisor/contract.ts"},{"kind":"path","path":"apps/wbs/be-01/src/module/solver-supervisor/module.ts"},{"kind":"path","path":"apps/wbs/be-01/src/module/solver-supervisor/solver-supervisor-spawner.ts"},{"kind":"path","path":"apps/wbs/be-01/src/service/optimization-coordinator.ts"},{"kind":"path","path":"apps/wbs/be-01/src/service/optimized-schedule-reader.ts"},{"kind":"path","path":"apps/wbs/be-01/src/service/solver-child-lifecycle.ts"},{"kind":"path","path":"apps/wbs/be-01/src/services.ts"}],"knowledgeLimit":"Only the composition root, the Supervisor module's production files and the three compatibility shims are declared; app.ts, the local solver launcher, the controller tests and the optimization database tests reach this module through the shims and are not tracked here."}} -->

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

The applicable check is the `wbs-be-01:test` target declared in `apps/wbs/be-01/project.json`,
recorded above as `check.be-01.test` and declared in `docs/wiki-policy/relationships.json`. Its
`apps/wbs/be-01/src/module-boundaries.test.ts` refuses the repository-schema and repository-hash
routes back into this module and any adapter route into `contract.ts`.

## Consumers

`apps/wbs/be-01/src/services.ts` installs the module once per composition; `bootBe01` starts and
stops the coordinator it returns. `apps/wbs/be-01/src/service/optimization-coordinator.ts`,
`service/solver-child-lifecycle.ts` and `service/optimized-schedule-reader.ts` keep the former paths
for `app.ts`, the local solver launcher, the controller tests and the optimization database tests.
The Solver supervisor module imports `contract.ts` for the launcher port it implements.

## Wiki registration

A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.backend.optimization` (`docs/wiki-policy/policy.json`'s `boundary.backend.optimization`).
The boundary's `sourceSelector` binds this directory to `optimization.feature.ts`'s own single
pre-namespacing predecessor, `optimization-coordinator.ts`, which existed at the pilot's frozen
`sourceRevision` — the same mechanism `boundary.backend.solver-launcher` uses. The other files here
have no separate baseline entry: the registration's guarantee is one predecessor per module
directory, not one per file it holds.
