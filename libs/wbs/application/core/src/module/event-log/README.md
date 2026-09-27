# Event log

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.event-log","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"event-log.resource.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names the current composition and feature readers."},{"section":"invariants","reason":"Durable recording and count retention are documented on EventLogService."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/module/realtime/gateway-broadcaster.ts"},{"kind":"path","path":"libs/wbs/application/core/src/module/realtime/replay-orchestrator.ts"},{"kind":"path","path":"libs/wbs/application/core/src/module/bounded-replay-sweep/retention-job.ts"}],"knowledgeLimit":"The current production readers are declared; test fixtures are not tracked here."}} -->

Durable subscription events are recorded, replayed, and pruned through `EventLogService` over one
store scope. Realtime and Bounded replay sweep consume this resource.

## Checks

`check.core.test` runs the core suite.

## Consumers

`compose.ts` installs the resource for Realtime and Bounded replay sweep.

## Wiki registration

This new resource has no predecessor at the wiki pilot's frozen source revision, so pilot
registration is deferred as in recent resource modules without a baseline entry.
