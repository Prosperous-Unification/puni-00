# Saved plans

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
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` will install the module (slice 2);
`libs/wbs/application/core/src/index.ts`,
`libs/wbs/application/core/src/service/saved-plan.service.ts`,
`libs/wbs/application/core/src/service/saved-plan-integrity.ts`,
`libs/wbs/application/core/src/service/saved-plan-schedule.ts` and
`libs/wbs/application/core/src/use-cases/save-plan.ts` keep the former `@wbs/core` deep-import
names.
