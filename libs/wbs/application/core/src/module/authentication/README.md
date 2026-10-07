# Authentication

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.authentication","memberships":[{"kind":"path","path":"account.resource.test.ts"},{"kind":"path","path":"account.resource.ts"},{"kind":"path","path":"authentication.feature.ts"},{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"login-throttle.test.ts"},{"kind":"path","path":"login-throttle.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every reader this packet verified by reading compose.ts and index.ts."},{"section":"invariants","reason":"The commit-then-issue and fail-closed-verifier invariants are documented on AuthService and LoginThrottle; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/be-01/src/app.ts"},{"kind":"path","path":"apps/wbs/be-01/src/controller/auth-oidc-endpoints.ts"},{"kind":"path","path":"apps/wbs/be-01/src/controller/auth-password-endpoints.ts"},{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/auth.service.ts"}],"knowledgeLimit":"The composition root, the core barrel, the AuthService compatibility adapter and the three be-01 files that import login-throttle.ts are declared; be-01 tests that import it directly are not tracked here."}} -->

The fifth sealed DI Bag module in the core, following Plan history's, Bounded replay sweep's,
Realtime's and Plan import's pattern: `module.ts` seals the graph, `check.ts` is the only place
that builds a bag, and `contract.ts` states the combined account store and the throttle's two
runtime values a host must supply.

`authentication.feature.ts` registers and signs in password and OIDC accounts through the private
`account.resource.ts`, which owns account creation, lookup, and federated resolution. The
compatibility `service/auth.service.ts` constructs that resource for direct store-based callers. The
feature also resolves a session token to the caller's principal. `login-throttle.ts` (the
moved `service/login-throttle.ts`) is its own admission collaborator: a fixed-window failure limit
and bounded per-process concurrency cap over password verification, exported alongside `auth` as a
second current compatibility value rather than folded into one interface — see `module.ts`'s own
note on why. Private bindings are named under the `application.authentication` label, so a DI
failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts` re-exports its files from the `@wbs/core` barrel;
`libs/wbs/application/core/src/service/auth.service.ts` remains the compatibility adapter for direct
store-based construction; `apps/wbs/be-01/src/app.ts`,
`apps/wbs/be-01/src/controller/auth-oidc-endpoints.ts` and
`apps/wbs/be-01/src/controller/auth-password-endpoints.ts` import `login-throttle.ts` directly.

## Wiki registration

A full member of `docs/wiki-policy/modules.json`'s content-review pilot, as
`module.application.authentication` (`docs/wiki-policy/policy.json`'s
`boundary.application.authentication`). The boundary's `sourceSelector` binds this new directory
to `authentication.feature.ts`'s own single pre-namespacing predecessor, the file
`docs/code-organization/kinds.json` classified `capability: authentication` before the move, which
existed at the pilot's frozen `sourceRevision` — the same mechanism `boundary.application.realtime`
uses for its own `replay.ts` predecessor. `login-throttle.ts` is not separately named in the source
selector: the wiki registration's guarantee is one predecessor per module directory, not one per
file it holds, exactly as Realtime's own `gateway-broadcaster.ts`, `replay-buffer.ts` and
`replay-orchestrator.ts` have no separate baseline entry either.
