# Plan import

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.plan-import","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"imported-plan.resource.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"plan-import.feature.ts"},{"kind":"path","path":"prepare-import.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts and index.ts."},{"section":"invariants","reason":"The commit-then-publish and directory-names-are-authoritative invariants are documented on ImportService; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/http/import.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/testing/import-service-source-contract.ts"},{"kind":"path","path":"libs/wbs/application/core/src/testing/writes-fixture.ts"}],"knowledgeLimit":"Only the composition root, the core barrel, the import routes and the two testing fixtures that deep-import it are declared; a deep import of plan-import.feature.ts or prepare-import.ts by a test elsewhere is not tracked here."}} -->

The fourth sealed DI Bag module in the core, following Plan history's, Bounded replay sweep's and
Realtime's pattern: `module.ts` seals the graph, `check.ts` is the only place that builds a bag, and
`contract.ts` states the runtime ports, the collector-backed announcement broadcaster and the
per-scope batch factory a host must supply.

`plan-import.feature.ts` (the moved `service/import.service.ts`) admits one prepared archival plan
inside a single unit of work, reconciling deployment-global directory names before writing a fresh
project tree and publishing only after commit. `prepare-import.ts` is its private support: it
validates and normalizes a plan document over pure values, asking only the `Scheduler` port whether
the requested engine is supported. `imported-plan.resource.ts` is its private resource:
`ImportedPlanResource` makes every repository write of one admitted import over the scope its unit of
work supplies, so the feature never names a repository port (WBS 040.11). Private bindings are named under the `application.plan-import`
label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts` re-exports its files from the `@wbs/core` barrel;
`libs/wbs/application/core/src/http/import.routes.ts`,
`libs/wbs/application/core/src/testing/import-service-source-contract.ts` and
`libs/wbs/application/core/src/testing/writes-fixture.ts` import `plan-import.feature.ts` directly.

## Wiki registration

A member of `docs/wiki-policy/modules.json`'s content-review pilot, as `module.application.plan-import`
(`docs/wiki-policy/policy.json`'s `boundary.application.plan-import`). Its files postdate the pilot's
frozen `sourceRevision` and were never renamed from anything, so there is no predecessor for a
`sourceSelector` to bind. The boundary names a `creationRevision` instead: `5a99d244`, the commit
that first added this directory, and its baseline is this directory's tuples at that commit. The
trusted loader refuses a creation revision that is not that first commit or disagrees with the
baseline.
