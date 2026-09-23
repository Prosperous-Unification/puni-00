# Plan import

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.plan-import","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"plan-import.feature.ts"},{"kind":"path","path":"prepare-import.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts and index.ts."},{"section":"invariants","reason":"The commit-then-publish and directory-names-are-authoritative invariants are documented on ImportService; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/http/import.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/import.service.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/prepare-import.ts"},{"kind":"path","path":"libs/wbs/application/core/src/testing/import-service-source-contract.ts"},{"kind":"path","path":"libs/wbs/application/core/src/testing/writes-fixture.ts"}],"knowledgeLimit":"Only the composition root, the core barrel, the two compatibility shims and the two testing fixtures that deep-import them are declared; a deep import of plan-import.feature.ts or prepare-import.ts by a test fixture elsewhere is not tracked here."}} -->

The fourth sealed DI Bag module in the core, following Plan history's, Bounded replay sweep's and
Realtime's pattern: `module.ts` seals the graph, `check.ts` is the only place that builds a bag, and
`contract.ts` states the runtime ports, the collector-backed announcement broadcaster and the
per-scope batch factory a host must supply.

`plan-import.feature.ts` (the moved `service/import.service.ts`) admits one prepared archival plan
inside a single unit of work, reconciling deployment-global directory names before writing a fresh
project tree and publishing only after commit. `prepare-import.ts` is its private support: it
validates and normalizes a plan document over pure values, asking only the `Scheduler` port whether
the requested engine is supported. Private bindings are named under the `application.plan-import`
label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts`, `libs/wbs/application/core/src/http/import.routes.ts`,
`libs/wbs/application/core/src/service/import.service.ts`,
`libs/wbs/application/core/src/service/prepare-import.ts`,
`libs/wbs/application/core/src/testing/import-service-source-contract.ts` and
`libs/wbs/application/core/src/testing/writes-fixture.ts` keep the former `@wbs/core` deep-import
names.

## Wiki registration

Not yet a member of `docs/wiki-policy/modules.json`'s content-review pilot, unlike Plan history's,
Bounded replay sweep's and Realtime's own modules. Every existing pilot boundary under this
namespaced tree carries a `sourceSelector` bound to a pre-namespacing predecessor file that existed
at the pilot's frozen `sourceRevision`; the production loader refuses any boundary whose
`baselineEntries` come back empty (`trusted boundary baseline is empty: <id>`), and this module's own
two files were both introduced after that revision — neither has a predecessor anywhere in the tree
at that point, so no `sourceSelector` can be supplied that yields even one matching entry. This is a
limit of the pilot's rename-tracking mechanism, not of this module's own boundaries; see the plan
that extracted this module for the measurement and the exact refusal observed. This directory still
declares the module layout the Burokrat rule model requires independently of the pilot (this
`module-index` block, and `contract.ts`), so it is not exempt from that separate rule.
