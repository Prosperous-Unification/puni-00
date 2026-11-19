# Accepted plan reference

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.accepted-plan-reference","memberships":[{"kind":"path","path":"accepted-plan-reference.feature.ts"},{"kind":"path","path":"accepted-plan-reference.resource.ts"},{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"The reference module has no configured relationship extractor. Consumers lists its direct production readers."},{"section":"invariants","reason":"The existing writer turn and scoped operations are documented on createReferenceTransaction."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/be-01/src/app.ts"},{"kind":"path","path":"libs/wbs/application/core/src/http/accepted-plan-reference.routes.ts"}],"knowledgeLimit":"The mounted app installs the feature and the HTTP routes consume it. Tests that install it are outside this production consumer list."}} -->

The WBS application accepts a verified plan reference and preserves the exact artifacts
behind each retained version. `check.ts` installs the feature. Its resource maps the
existing WBS writer turn to the authorized project and reference address, without exposing
SQLite stores or starting another transaction.

## Checks

`wbs-core:test` checks the closed feature boundary. The module TypeScript config covers the
feature, resource and installation. The mounted reference tests check that registration,
refusal and historical reads use the same admitted writer.

## Consumers

`apps/wbs/be-01/src/app.ts` installs the module. The accepted plan reference HTTP routes
use its registration and read methods.

## Wiki registration

The content-review pilot uses `module.application.accepted-plan-reference` and `boundary.application.accepted-plan-reference`.
The creation commit `ab628956` introduced the feature, and its committed file is the
boundary's baseline.
