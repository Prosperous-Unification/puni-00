# Realtime

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.realtime","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"gateway-broadcaster.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"realtime.feature.ts"},{"kind":"path","path":"replay-buffer.ts"},{"kind":"path","path":"replay-orchestrator.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts and index.ts."},{"section":"invariants","reason":"The durable-before-push and buffer-then-log-fallback invariants are documented on GatewayBroadcaster and ReplayOrchestrator respectively; none spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/gateway-broadcaster.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/replay-buffer.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/replay-orchestrator.ts"},{"kind":"path","path":"libs/wbs/application/core/src/use-cases/replay.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the four compatibility shims are declared; a deep import of realtime.feature.ts, gateway-broadcaster.ts, replay-buffer.ts or replay-orchestrator.ts by a test fixture elsewhere is not tracked here."}} -->

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

## Wiki registration

This module is a full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.application.realtime` (`docs/wiki-policy/policy.json`'s `boundary.application.realtime`).
The boundary's `sourceSelector` binds this new directory to the single pre-namespacing use case it
was extracted from, the file `docs/code-organization/kinds.json` classified `capability: realtime`
before the move, which existed at the pilot's frozen `sourceRevision` — the same mechanism
`boundary.application.plan-history` and `boundary.application.bounded-replay-sweep` use for their
own predecessors. `gateway-broadcaster.ts`, `replay-buffer.ts` and `replay-orchestrator.ts` are not
separately named in the source selector: the wiki registration's guarantee is narrower than "every
file in this module has a pilot-tracked predecessor", exactly as Plan history's and Bounded replay
sweep's own READMEs say of their label agreement — see the plan's "Deferred: label agreement" for
why, and what a later change needs before it can be.
