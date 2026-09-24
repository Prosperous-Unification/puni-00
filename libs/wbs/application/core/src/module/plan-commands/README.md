# Plan commands

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

The module's tests run under the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module once per composition as `commands`;
`libs/wbs/application/core/src/index.ts` exports it;
`libs/wbs/application/core/src/service/plan-commands.ts`,
`libs/wbs/application/core/src/service/command-bindings.ts`,
`libs/wbs/application/core/src/service/working-plan.ts` and
`libs/wbs/application/core/src/use-cases/run-command-batch.ts` keep the former paths for
`http/work-item.routes.ts`, the test fixtures, `@wbs/core`'s barrel and be-01's deep-import shim,
through which `apps/wbs/be-01/src/app.ts` still constructs a runner of its own.
