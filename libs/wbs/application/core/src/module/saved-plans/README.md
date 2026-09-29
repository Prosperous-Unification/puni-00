# Saved plans

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.saved-plans","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"save-plan.ts"},{"kind":"path","path":"saved-plan-integrity.test.ts"},{"kind":"path","path":"saved-plan-integrity.ts"},{"kind":"path","path":"saved-plan-schedule.ts"},{"kind":"path","path":"saved-plan-values.ts"},{"kind":"path","path":"saved-plan.resource.ts"},{"kind":"path","path":"saved-plans.feature.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every production reader a module-specifier scan found on 2026-09-29, when the compatibility shims were retired."},{"section":"invariants","reason":"The write-order, fail-fast and verify-on-read invariants are documented on SavedPlanService and the integrity functions; none spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/http/saved-plan.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/saved-plan-schedule.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/saved-plan.service.ts"}],"knowledgeLimit":"The composition root, the core barrel, the saved-plan routes and the two compatibility adapters are declared; the portable composition, the admission and composition tests and the be-01 database tests that import this module directly are not tracked here."}} -->

The sixth sealed DI Bag module in the core, following Plan history's, Bounded replay sweep's,
Realtime's, Plan import's and Authentication's pattern: `module.ts` seals the graph, `check.ts` is
`check.ts` builds the bag, and `contract.ts` states the digest, scheduler, id and clock callbacks,
optional quota and two saved-plan stores a host must supply. The bag constructs one private
SavedPlanResource over those stores.

`saved-plans.feature.ts` orchestrates capture, scheduling, serialization, hashing and comparison.
`saved-plan.resource.ts` owns capture, persistence, integrity, list projection, quota inside the
write transaction and principal-based touch authorization. `saved-plan-values.ts` holds their shared
read and touch outcomes. The compatibility service accepts direct store-based construction. `save-plan.ts` (the moved `use-cases/save-plan.ts`) admits one
save for an authenticated actor and announces it after it is written. `saved-plan-integrity.ts`
and `saved-plan-schedule.ts` provide stored-body verification and detached scheduling of a captured
plan. Private bindings are named under the
`application.saved-plans` label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts` re-exports its files from the `@wbs/core` barrel;
`libs/wbs/application/core/src/http/saved-plan.routes.ts` imports `save-plan.ts` and
`saved-plan-integrity.ts` directly; `libs/wbs/application/core/src/service/saved-plan.service.ts`
and `libs/wbs/application/core/src/service/saved-plan-schedule.ts` remain compatibility adapters for
direct store-based construction.

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
