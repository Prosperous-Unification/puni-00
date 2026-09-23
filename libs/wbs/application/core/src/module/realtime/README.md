# Realtime

The third sealed DI Bag module in the core, following Plan history's and Bounded replay sweep's
pattern: `module.ts` seals the graph, `check.ts` is the only place that builds a bag, and
`contract.ts` states the two runtime ports and the buffer/replay limits a host must supply — the
same preserved K3 debt Plan history's and Bounded replay sweep's contracts record for their own
repository ports, not compliance. Private bindings are named under the `application.realtime`
label, so a DI failure says which module asked.

`realtime.feature.ts` (the moved `use-cases/replay.ts`) admits an internal principal before
replaying resume points; `replay-buffer.ts` is the bounded, per-subscription fast-path cache;
`gateway-broadcaster.ts` is the durable-then-push adapter of the neutral `Broadcaster` port
(`ports/project-event.ts`), exported as the concrete class rather than the port itself because
`apps/wbs/be-01/src/services.ts` calls its `pushRecorded` method, one level beyond the port
contract. `replay-orchestrator.ts` answers a reconnecting client's resume from the buffer, falling
back to the log. Composition still decorates the returned `broadcaster` with
`OptimizerTriggerBroadcaster` exactly as before this module existed — that stays root-private
wiring, not part of this module.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts`, `libs/wbs/application/core/src/service/gateway-broadcaster.ts`,
`libs/wbs/application/core/src/service/replay-buffer.ts`,
`libs/wbs/application/core/src/service/replay-orchestrator.ts` and
`libs/wbs/application/core/src/use-cases/replay.ts` keep the former `@wbs/core` deep-import names.
Workspace-relative paths rather than Markdown links:
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` resolves a relative link against the file
that carries it, and this listing is quoted inside a plan document at another depth.
