# Plan history

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.plan-history","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"plan-history.feature.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts and index.ts."},{"section":"invariants","reason":"Read-before-events, append-only and the no-view rule are documented on HistoryService and installPlanHistory; none spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/history.service.ts"}],"knowledgeLimit":"Only the composition root, the core barrel and the compatibility shim are declared; a deep import of plan-history.feature.ts by a test fixture elsewhere is not tracked here."}} -->

The plan's history, read. This is the first sealed DI Bag module in the core: `module.ts` seals
the graph and exports `history` alone, `check.ts` is the only place that builds a bag, and
`contract.ts` states the two repository ports a host must supply — preserved K3 debt, not
compliance. Private bindings are named under the `application.plan-history` label, so a DI failure
says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts` and
`libs/wbs/application/core/src/service/history.service.ts` keep the former
`@wbs/core/service/history.service` names. Workspace-relative paths rather than Markdown links:
`tools/tool-devsync/src/repo-namespacing-handoff.test.ts` resolves a relative link against the
file that carries it, and this listing is quoted inside a plan document at another depth.
