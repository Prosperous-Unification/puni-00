# Solver launcher

<!-- module-index {"schemaVersion":1,"moduleId":"module.backend.solver-launcher","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"solver-launcher.repository.test.ts"},{"kind":"path","path":"solver-launcher.repository.ts"}],"relationshipSelectors":[],"applicableChecks":["check.be-01.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading main.ts, dev/main.ts and the compatibility shim."},{"section":"invariants","reason":"The verdict-before-request stdin framing and the one-authority version read are documented on spawnSolverLauncher and readRuntimeSolverVersion; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/be-01/src/dev/main.ts"},{"kind":"path","path":"apps/wbs/be-01/src/main.ts"},{"kind":"path","path":"apps/wbs/be-01/src/service/solver-launcher-process.ts"}],"knowledgeLimit":"Only the two entrypoints and the compatibility shim are declared; the local solver spawner and the two database tests reach this module through the shim and are not tracked here."}} -->

The first sealed DI Bag module under `apps/wbs/be-01`, following the core modules' pattern:
`module.ts` seals the graph, `check.ts` is the only place that builds a bag, and `contract.ts`
states the two optional process seams a host may supply.

`solver-launcher.repository.ts` (the moved `service/solver-launcher-process.ts`) reads the installed
`wbs-solver-launcher` version, reads the source module's version in the source-run development
container, and spawns the launcher child with its one-byte verdict transport. Private bindings are
named under the `backend.solver-launcher` label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-be-01:test` target declared in `apps/wbs/be-01/project.json`,
recorded above as `check.be-01.test` and declared in `docs/wiki-policy/relationships.json`.

## Consumers

`apps/wbs/be-01/src/main.ts` and `apps/wbs/be-01/src/dev/main.ts` install the module to read the
solver version; `apps/wbs/be-01/src/service/solver-launcher-process.ts` keeps the former path for
`dev/local-solver-spawner.ts`, `services.db.test.ts` and `solver-child-lifecycle.db.test.ts`.

## Wiki registration

A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.backend.solver-launcher` (`docs/wiki-policy/policy.json`'s
`boundary.backend.solver-launcher`). The boundary's `sourceSelector` binds this directory to
`solver-launcher.repository.ts`'s own single pre-namespacing predecessor,
`solver-launcher-process.ts`, which existed at the pilot's frozen `sourceRevision` — the same
mechanism `boundary.application.saved-plans` uses for its `saved-plan.service.ts` predecessor. The
other files here have no separate baseline entry: the registration's guarantee is one predecessor
per module directory, not one per file it holds.
