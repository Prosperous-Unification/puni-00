# Plan document

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.plan-document","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"plan-document.resource.test.ts"},{"kind":"path","path":"plan-document.resource.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading project.routes.ts, index.ts and the compatibility shim."},{"section":"invariants","reason":"The complete-directory-closure and version-header-first invariants are documented on PlanDocumentService and classifyPlanDocument; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/http/project.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/plan-document.ts"}],"knowledgeLimit":"Only the one installer call site, the core barrel and the compatibility shim are declared; import.routes.ts, the import source-contract fixture and the be-01 boundary tests reach this module through the shim or the barrel and are not tracked here."}} -->

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
and `libs/wbs/application/core/src/service/plan-document.ts` keep the former `@wbs/core` deep-import
names.

## Wiki registration

A member of `docs/wiki-policy/modules.json`'s content-review pilot, as `module.application.plan-document`
(`docs/wiki-policy/policy.json`'s `boundary.application.plan-document`). Its files postdate the pilot's
frozen `sourceRevision` and were never renamed from anything, so there is no predecessor for a
`sourceSelector` to bind. The boundary names a `creationRevision` instead: `b53693a2`, the commit
that first added this directory, and its baseline is this directory's tuples at that commit. The
trusted loader refuses a creation revision that is not that first commit or disagrees with the
baseline.
