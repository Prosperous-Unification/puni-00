# Plan event

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.plan-event","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"plan-event.resource.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names the current composition and feature readers."},{"section":"invariants","reason":"Retention cutoff and newest-first ordering are documented on PlanEventService."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/module/plan-history/plan-history.feature.ts"},{"kind":"path","path":"libs/wbs/application/core/src/module/bounded-replay-sweep/retention-job.ts"}],"knowledgeLimit":"The current production readers are declared; test fixtures are not tracked here."}} -->

Retained plan events are read and pruned through `PlanEventService` over one store scope. The
feature modules for History and Bounded replay sweep consume this resource.

## Checks

`check.core.test` runs the core suite.

## Consumers

`compose.ts` installs the resource for History and Bounded replay sweep.

## Wiki registration

This module is a full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.application.plan-event`. It postdates the pilot's frozen `sourceRevision`, so its
`boundary.application.plan-event` boundary names `creationRevision` `36d5fa69c`, the commit that first
added this directory, with that commit's tuples as its baseline.
