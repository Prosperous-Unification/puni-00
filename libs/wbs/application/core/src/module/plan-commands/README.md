# Plan commands

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.plan-commands","memberships":[{"kind":"path","path":"admitted-scope.resource.ts"},{"kind":"path","path":"admitted-write.test.ts"},{"kind":"path","path":"admitted-write.ts"},{"kind":"path","path":"check.ts"},{"kind":"path","path":"command-bindings.test.ts"},{"kind":"path","path":"command-bindings.ts"},{"kind":"path","path":"composition.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"plan-command-admission.test.ts"},{"kind":"path","path":"plan-command-scope.test.ts"},{"kind":"path","path":"plan-command-graph.ts"},{"kind":"path","path":"plan-commands.feature.ts"},{"kind":"path","path":"plan-commands.test.ts"},{"kind":"path","path":"run-command-batch.ts"},{"kind":"path","path":"tsconfig.json"},{"kind":"path","path":"working-plan-directory.resource.ts"},{"kind":"path","path":"working-plan-directory.test.ts"},{"kind":"path","path":"working-plan-edges.resource.ts"},{"kind":"path","path":"working-plan-rows.resource.ts"},{"kind":"path","path":"working-plan-subtrees.resource.ts"},{"kind":"path","path":"working-plan-values.resource.ts"},{"kind":"path","path":"working-plan.resource.ts"},{"kind":"path","path":"working-plan.test.ts"},{"kind":"path","path":"working-plan.types.test.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every production reader a module-specifier scan found on 2026-09-29, when the compatibility shims were retired."},{"section":"invariants","reason":"The commit-then-announce and one-graph-per-batch invariants are documented on PlanCommandRunner; the Working plan's closed-state refusal is documented on createWorkingPlan."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/be-01/src/app.ts"},{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/http/work-item.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"}],"knowledgeLimit":"The composition root, the core barrel, the work-item routes and be-01's app are declared; the test fixtures and database tests that import this module directly are not tracked here."}} -->

A sealed feature module installed once per composition. `composition.ts` binds the raw unit of work
and per-scope graph factory into a command transaction before constructing the runner; `module.ts`
seals the DI Bag graph, `check.ts` builds the bag, and `contract.ts` states what the host supplies. The runner itself
receives only mapped command resources, the public graph, and the direct broadcaster.

`plan-commands.feature.ts` (the moved `service/plan-commands.ts`) applies one command batch, or one
undo or redo, as a single unit of work over a service graph built for that batch alone, holds the
batch's announcements in a collector of its own until the commit has let go of its turn, and drops
them with a rollback. `run-command-batch.ts` (the moved `use-cases/run-command-batch.ts`) is its use
case: it refuses an actor without the `write` scope before a batch is admitted. `command-bindings.ts`
(the moved `service/command-bindings.ts`) is private support: the kind-indexed table that dispatches
each command to the service it belongs to. Private bindings are named under the
`application.plan-commands` label, so a DI failure says which module asked.

`admitted-write.ts` runs the two route writes that check the combined step-node dependency graph —
a project `depReach` change and a step removal — as one unit of work each. `composition.ts` privately
binds their raw unit of work and graph factory into a mapped route-write transaction, with
`NO_ADMISSION`; be-01's app uses `createAdmittedWrites` to bind the project and step routes.

`working-plan.resource.ts` (the moved `service/working-plan.ts`) is the Working plan, a resource
private to this module: one project's lazily retained reads, owned by one admitted batch, which the
batch's graph writes through and which refuses every read once the batch closes it.
`working-plan-directory.resource.ts`, `working-plan-edges.resource.ts`,
`working-plan-rows.resource.ts`, `working-plan-subtrees.resource.ts` and
`working-plan-values.resource.ts` are its implementation, suffixed as the resource parts they are
(WBS 040.11): nothing but the Working plan and its own moved tests imports them.
`admitted-scope.resource.ts` owns organization admission and cross-reference questions over a
private scope. Composition opens each Working plan, builds the fixed `PlanCommandServices` graph
from `plan-command-graph.ts`, and maps rollback repair through the fresh surviving scope. The
feature chooses commit, refusal and repair without receiving raw scope or a generic graph factory.
No module export names the
Working plan; `@wbs/core`'s barrel still exports `createWorkingPlan` through the former path for one
SQLite database test.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module once per composition as `commands`;
`libs/wbs/application/core/src/index.ts` exports it;
`libs/wbs/application/core/src/http/work-item.routes.ts` imports the runner and `runCommandBatch`
directly, and `apps/wbs/be-01/src/app.ts` constructs its runner through `createPlanCommandRunner` in
`composition.ts`.

## Wiki registration

A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.application.plan-commands` (`docs/wiki-policy/policy.json`'s
`boundary.application.plan-commands`). The boundary's `sourceSelector` binds this directory to
`plan-commands.feature.ts`'s own single pre-namespacing predecessor, `plan-commands.ts`, which existed
at the pilot's frozen `sourceRevision` — the same mechanism `boundary.application.work-item` uses. The
other files here have no separate baseline entry: the registration's guarantee is one predecessor per
module directory, not one per file it holds. `run-command-batch.ts`'s own predecessor existed then
too and stays under `boundary.application.use-cases`'s baseline.
