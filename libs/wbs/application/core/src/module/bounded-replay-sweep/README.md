# Bounded replay sweep

The bounded replay sweep, run on a schedule. This is the second sealed DI Bag module in the core,
following Plan history's pattern: `module.ts` seals the graph and exports `retention` alone,
`check.ts` is the only place that builds a bag, and `contract.ts` states the two repository ports
and the scheduling primitives a host must supply — the same preserved K3 debt Plan history's
contract records, not compliance. Private bindings are named under the
`application.bounded-replay-sweep` label, so a DI failure says which module asked.

`bounded-replay-sweep.feature.ts` (the moved `use-cases/retention-sweep.ts`) coordinates both
bounded rules; `retention-job.ts` is its private port-backed pruning pair; `retention-timer.ts` is
the lifecycle adapter that runs the sweep on a schedule — its `start()`/`stop()` stay called by
`bootBe01` exactly as before this module existed, so the module registers no disposer of its own.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts`,
`libs/wbs/application/core/src/service/retention-job.ts`,
`libs/wbs/application/core/src/service/retention-timer.ts` and
`libs/wbs/application/core/src/use-cases/retention-sweep.ts` keep the former `@wbs/core` deep-import
names. Workspace-relative paths rather than Markdown links:
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` resolves a relative link against the file
that carries it, and this listing is quoted inside a plan document at another depth.
