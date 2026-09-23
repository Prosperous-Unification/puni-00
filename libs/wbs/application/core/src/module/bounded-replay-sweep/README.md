# Bounded replay sweep

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.bounded-replay-sweep","memberships":[{"kind":"path","path":"bounded-replay-sweep.feature.ts"},{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"retention-job.ts"},{"kind":"path","path":"retention-timer.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts and index.ts."},{"section":"invariants","reason":"The read-before-events and single-timer-loop invariants are documented on RetentionTimer and retentionSweep; none spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/retention-job.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/retention-timer.ts"},{"kind":"path","path":"libs/wbs/application/core/src/use-cases/retention-sweep.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the three compatibility shims are declared; a deep import of bounded-replay-sweep.feature.ts, retention-timer.ts or retention-job.ts by a test fixture elsewhere is not tracked here."}} -->

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

## Wiki registration

This module is a full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.application.bounded-replay-sweep` (`docs/wiki-policy/policy.json`'s
`boundary.application.bounded-replay-sweep`). The boundary's `sourceSelector` binds this new
directory to the single pre-namespacing use case it was extracted from, the file
`docs/code-organization/kinds.json` classified `capability: bounded-replay-sweep` before the move,
which existed at the pilot's frozen `sourceRevision` — the same mechanism
`boundary.application.plan-history` uses for its own predecessor. `retention-timer.ts` and
`retention-job.ts` are not separately named in the source
selector: the wiki registration's guarantee is narrower than "every file in this module has a
pilot-tracked predecessor", exactly as Plan history's own README says of its label agreement — see
the plan's "Deferred: label agreement" for why, and what a later change needs before it can be.
