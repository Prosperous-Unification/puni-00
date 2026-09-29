# Plan document

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.plan-document","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"plan-document.resource.test.ts"},{"kind":"path","path":"plan-document.resource.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every production reader a module-specifier scan found on 2026-09-29, when the compatibility shims were retired."},{"section":"invariants","reason":"The complete-directory-closure and version-header-first invariants are documented on PlanDocumentService and classifyPlanDocument; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/http/import.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/http/project.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/testing/import-service-source-contract.ts"}],"knowledgeLimit":"The one installer call site, the core barrel, the import routes and the import source-contract fixture are declared; the be-01 boundary tests reach this module through the barrel and are not tracked here."}} -->

The first sealed resource module in the core, following the six feature modules' pattern:
`module.ts` seals the graph, `check.ts` is the only place that builds a bag, and `contract.ts`
states the directory reads, the owner-neutral marker read and the clock a host must supply.

`plan-document.resource.ts` (the moved `service/plan-document.ts`) builds the versioned archival
document around a project tree, naming every directory row the tree references, and classifies an
incoming document by its version header before validating it. Private bindings are named under the
`application.plan-document` label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/http/project.routes.ts` installs the module once per route set, over
the Directory and Calendar marker resources it is handed; `libs/wbs/application/core/src/index.ts`
re-exports `plan-document.resource.ts` from the `@wbs/core` barrel, and
`libs/wbs/application/core/src/http/import.routes.ts` and
`libs/wbs/application/core/src/testing/import-service-source-contract.ts` import it directly.

## Wiki registration

A member of `docs/wiki-policy/modules.json`'s content-review pilot, as `module.application.plan-document`
(`docs/wiki-policy/policy.json`'s `boundary.application.plan-document`). Its files postdate the pilot's
frozen `sourceRevision` and were never renamed from anything, so there is no predecessor for a
`sourceSelector` to bind. The boundary names a `creationRevision` instead: `b53693a2`, the commit
that first added this directory, and its baseline is this directory's tuples at that commit. The
trusted loader refuses a creation revision that is not that first commit or disagrees with the
baseline.
