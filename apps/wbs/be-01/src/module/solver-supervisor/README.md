# Solver supervisor

<!-- module-index {"schemaVersion":1,"moduleId":"module.backend.solver-supervisor","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"solver-supervisor-spawner.test.ts"},{"kind":"path","path":"solver-supervisor-spawner.ts"},{"kind":"path","path":"solver-supervisor.repository.test.ts"},{"kind":"path","path":"solver-supervisor.repository.ts"}],"relationshipSelectors":[],"applicableChecks":["check.be-01.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading main.ts and the compatibility shim."},{"section":"invariants","reason":"The one-attempt-per-connection, verdict-before-kill and bounded-reply invariants are documented on connectSolverSupervisor; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/be-01/src/main.ts"},{"kind":"path","path":"apps/wbs/be-01/src/service/solver-supervisor-client.ts"}],"knowledgeLimit":"Only the production entrypoint and the compatibility shim are declared; the two Supervisor diagnostic scripts under apps/wbs/be-01/scripts reach this module through the shim and are not tracked here."}} -->

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

The applicable check is the `wbs-be-01:test` target declared in `apps/wbs/be-01/project.json`,
recorded above as `check.be-01.test` and declared in `docs/wiki-policy/relationships.json`. Its
`apps/wbs/be-01/src/module-boundaries.test.ts` refuses any route from this module into the
Optimization feature, its private support or the coordinator's compatibility path.

## Consumers

`apps/wbs/be-01/src/main.ts` installs the module and hands its launcher port to the Optimization
coordinator; `apps/wbs/be-01/src/service/solver-supervisor-client.ts` keeps the former path for the
two Supervisor diagnostic scripts under `apps/wbs/be-01/scripts/`.

## Wiki registration

A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.backend.solver-supervisor` (`docs/wiki-policy/policy.json`'s
`boundary.backend.solver-supervisor`). The boundary's `sourceSelector` binds this directory to
`solver-supervisor.repository.ts`'s own single pre-namespacing predecessor,
`solver-supervisor-client.ts`, which existed at the pilot's frozen `sourceRevision`. The mapper's
own predecessor existed then too; the registration's guarantee is one predecessor per module
directory, not one per file it holds.
