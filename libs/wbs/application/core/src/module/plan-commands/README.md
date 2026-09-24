# Plan commands

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.plan-commands","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"command-bindings.test.ts"},{"kind":"path","path":"command-bindings.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"plan-command-scope.test.ts"},{"kind":"path","path":"plan-commands.feature.ts"},{"kind":"path","path":"plan-commands.test.ts"},{"kind":"path","path":"run-command-batch.ts"},{"kind":"path","path":"working-plan-directory.test.ts"},{"kind":"path","path":"working-plan-directory.ts"},{"kind":"path","path":"working-plan-edges.ts"},{"kind":"path","path":"working-plan-rows.ts"},{"kind":"path","path":"working-plan-subtrees.ts"},{"kind":"path","path":"working-plan-values.ts"},{"kind":"path","path":"working-plan.resource.ts"},{"kind":"path","path":"working-plan.test.ts"},{"kind":"path","path":"working-plan.types.test.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts, index.ts and the four compatibility shims."},{"section":"invariants","reason":"The commit-then-announce and one-graph-per-batch invariants are documented on PlanCommandRunner; the Working plan's closed-state refusal is documented on createWorkingPlan."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/command-bindings.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/plan-commands.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/working-plan.ts"},{"kind":"path","path":"libs/wbs/application/core/src/use-cases/run-command-batch.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the four compatibility shims are declared; the work-item routes, the test fixtures, be-01's app and deep-import shim, and the SQLite database tests reach this module through the shims or the barrel and are not tracked here."}} -->

A sealed feature module installed once per composition, whose per-batch parts are made inside every
batch: `module.ts` seals the graph, `check.ts` is the only place that builds a bag, and
`contract.ts` states the per-batch service factory, the public graph, the unit of work and the
direct broadcaster a host must supply.

`plan-commands.feature.ts` (the moved `service/plan-commands.ts`) applies one command batch, or one
undo or redo, as a single unit of work over a service graph built for that batch alone, holds the
batch's announcements in a collector of its own until the commit has let go of its turn, and drops
them with a rollback. `run-command-batch.ts` (the moved `use-cases/run-command-batch.ts`) is its use
case: it refuses an actor without the `write` scope before a batch is admitted. `command-bindings.ts`
(the moved `service/command-bindings.ts`) is private support: the kind-indexed table that dispatches
each command to the service it belongs to. Private bindings are named under the
`application.plan-commands` label, so a DI failure says which module asked.

`working-plan.resource.ts` (the moved `service/working-plan.ts`) is the Working plan, a resource
private to this module: one project's lazily retained reads, owned by one admitted batch, which the
batch's graph writes through and which refuses every read once the batch closes it.
`working-plan-directory.ts`, `working-plan-edges.ts`, `working-plan-rows.ts`,
`working-plan-subtrees.ts` and `working-plan-values.ts` are its implementation and keep no former
path: nothing but the Working plan and its own moved tests imported them. No module export names the
Working plan; `@wbs/core`'s barrel still exports `createWorkingPlan` through the former path for one
SQLite database test.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module once per composition as `commands`;
`libs/wbs/application/core/src/index.ts` exports it;
`libs/wbs/application/core/src/service/plan-commands.ts`,
`libs/wbs/application/core/src/service/command-bindings.ts`,
`libs/wbs/application/core/src/service/working-plan.ts` and
`libs/wbs/application/core/src/use-cases/run-command-batch.ts` keep the former paths for
`http/work-item.routes.ts`, the test fixtures, `@wbs/core`'s barrel and be-01's deep-import shim,
through which `apps/wbs/be-01/src/app.ts` still constructs a runner of its own.

## Wiki registration

A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.application.plan-commands` (`docs/wiki-policy/policy.json`'s
`boundary.application.plan-commands`). The boundary's `sourceSelector` binds this directory to
`plan-commands.feature.ts`'s own single pre-namespacing predecessor, `plan-commands.ts`, which existed
at the pilot's frozen `sourceRevision` — the same mechanism `boundary.application.work-item` uses. The
other files here have no separate baseline entry: the registration's guarantee is one predecessor per
module directory, not one per file it holds. `run-command-batch.ts`'s own predecessor existed then
too and stays under `boundary.application.use-cases`'s baseline.
