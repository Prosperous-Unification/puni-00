# Dependency lookup

<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.dependency-lookup","memberships":[{"kind":"path","path":"contract.ts"},{"kind":"path","path":"dependency-lookup.feature.test.ts"},{"kind":"path","path":"dependency-lookup.feature.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory; externalConsumers declares the production importers checked by frontend-module-graph.test.ts."},{"section":"invariants","reason":"Request lifetime and endpoint evidence invariants live on openDependencyLookup and AddressCandidate."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/dependency-draft.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/dependency-navigation.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/dependency-selection.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/plan-cards.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/plan-live.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/remote-dependency-editor.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-dependency-search.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/composition.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/contract.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/project-runtime.ts"}],"knowledgeLimit":"Production imports are checked; tests and shared fixtures are excluded from externalConsumers."}} -->

Read-only project discovery, endpoint search and reference resolution for dependency editing.
The project composition opens this plain-function module for the current project runtime.

The public contract is in [contract.ts](contract.ts); request cancellation and endpoint evidence
validation are owned by [openDependencyLookup](dependency-lookup.feature.ts).

The module type check is `wbs-fe-01:typecheck:module`. Its lifetime and observation cases run
in `wbs-fe-01:test:unit`; `tool-devsync:test` checks its declared consumers and registration.
