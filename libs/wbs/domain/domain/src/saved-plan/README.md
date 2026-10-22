# Saved-plan value model

<!-- module-index {"schemaVersion":1,"moduleId":"module.domain.saved-plan","memberships":[{"kind":"path","path":"connected-history.fixture.ts"},{"kind":"path","path":"connected-history.test.ts"},{"kind":"path","path":"connected-schedule.ts"},{"kind":"path","path":"dependency-history.ts"},{"kind":"path","path":"history-json.ts"},{"kind":"path","path":"canonical-plan-input.test.ts"},{"kind":"path","path":"canonical-plan-input.ts"},{"kind":"path","path":"diff-plans.test.ts"},{"kind":"path","path":"diff-plans.ts"},{"kind":"path","path":"index.ts"},{"kind":"path","path":"normalise-plan-input.test.ts"},{"kind":"path","path":"normalise-plan-input.ts"},{"kind":"path","path":"plan-fixture.ts"},{"kind":"path","path":"step-blockages.test.ts"},{"kind":"path","path":"step-parallels.test.ts"},{"kind":"path","path":"versioned-schedule.ts"},{"kind":"path","path":"versioned-schedule.test.ts"}],"relationshipSelectors":["declarations.facts","typescript.imports","typescript.public-declarations","typescript.reverse-edges"],"applicableChecks":["check.domain.test"],"inapplicableSections":[{"section":"invariants","reason":"Cross-file saved-plan invariants are stated on their owning symbols and tests."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"directory-prefix","prefix":"libs/wbs/application/core/src","exclusions":[]},{"kind":"directory-prefix","prefix":"apps","exclusions":[]}],"knowledgeLimit":"Only consumers present in the pinned repository candidate are declared."}} -->

Canonical input versions, forward normalization, and semantic plan differences live here.
The public surface is [the barrel](index.ts); each invariant stays with its symbol and test.

## Checks

The applicable check is the `wbs-domain:test` target declared in
[the domain project](../../project.json).
