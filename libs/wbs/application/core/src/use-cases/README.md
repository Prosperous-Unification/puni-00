# Core use cases

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.use-cases","memberships":[{"kind":"path","path":"admission.test.ts"}],"relationshipSelectors":["declarations.facts","typescript.imports","typescript.public-declarations","typescript.reverse-edges"],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"invariants","reason":"Transaction and replay invariants live on the use-case symbols and their conformance tests."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"directory-prefix","prefix":"libs/wbs/application/core/src/http","exclusions":[]},{"kind":"directory-prefix","prefix":"libs/wbs/application/core/src/service","exclusions":[]},{"kind":"directory-prefix","prefix":"libs/wbs/application/core/testing","exclusions":[]}],"knowledgeLimit":"The bootstrap mapping's consumers are kept: every use case this directory held moved into its sealed module, so nothing in the selected repository imports from here any more."}} -->

The use cases that coordinated framework-free application work across core ports moved into their
sealed modules: `replay` into Realtime, `retentionSweep` into Bounded replay sweep,
`runCommandBatch` into Plan commands and `savePlan` into Saved plans. The
[core barrel](../index.ts) still publishes each of them. `admission.test.ts` stays here: it checks
that every one of those entry points admits its principal before it writes or reads.

## Checks

The applicable check is the `wbs-core:test` target declared in
[the core project](../../project.json).
