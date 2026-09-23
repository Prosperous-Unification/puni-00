# Saved plans

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.saved-plans","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"save-plan.ts"},{"kind":"path","path":"saved-plan-integrity.test.ts"},{"kind":"path","path":"saved-plan-integrity.ts"},{"kind":"path","path":"saved-plan-schedule.ts"},{"kind":"path","path":"saved-plans.feature.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts, index.ts and the four compatibility shims."},{"section":"invariants","reason":"The write-order, fail-fast and verify-on-read invariants are documented on SavedPlanService and the integrity functions; none spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/saved-plan-integrity.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/saved-plan-schedule.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/saved-plan.service.ts"},{"kind":"path","path":"libs/wbs/application/core/src/use-cases/save-plan.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the four compatibility shims are declared; the saved-plan routes, the portable composition, the admission and composition tests and the be-01 shims and database tests reach this module through those shims or the barrel and are not tracked here."}} -->

The sixth sealed DI Bag module in the core, following Plan history's, Bounded replay sweep's,
Realtime's, Plan import's and Authentication's pattern: `module.ts` seals the graph, `check.ts` is
the only place that builds a bag, and `contract.ts` states the digest, scheduler, id and clock
callbacks, optional quota and two saved-plan stores a host must supply.

`saved-plans.feature.ts` (the moved `service/saved-plan.service.ts`) saves, lists, reads, compares,
renames and deletes saved plans. `save-plan.ts` (the moved `use-cases/save-plan.ts`) admits one
save for an authenticated actor and announces it after it is written. `saved-plan-integrity.ts`
and `saved-plan-schedule.ts` are the feature's private support: stored-body verification, and the
detached scheduling of a captured plan. Private bindings are named under the
`application.saved-plans` label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts`,
`libs/wbs/application/core/src/service/saved-plan.service.ts`,
`libs/wbs/application/core/src/service/saved-plan-integrity.ts`,
`libs/wbs/application/core/src/service/saved-plan-schedule.ts` and
`libs/wbs/application/core/src/use-cases/save-plan.ts` keep the former `@wbs/core` deep-import
names.

## Wiki registration

A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.application.saved-plans` (`docs/wiki-policy/policy.json`'s
`boundary.application.saved-plans`). The boundary's `sourceSelector` binds this directory to
`saved-plans.feature.ts`'s own single pre-namespacing predecessor, `saved-plan.service.ts`, the
file `docs/code-organization/kinds.json` classified as the Saved plans feature before the move,
which existed at the pilot's frozen `sourceRevision` — the same mechanism
`boundary.application.authentication` uses for its `auth.service.ts` predecessor. The other files
here have no separate baseline entry: the registration's guarantee is one predecessor per module
directory, not one per file it holds.
