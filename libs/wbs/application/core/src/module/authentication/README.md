# Authentication

The fifth sealed DI Bag module in the core, following Plan history's, Bounded replay sweep's,
Realtime's and Plan import's pattern: `module.ts` seals the graph, `check.ts` is the only place
that builds a bag, and `contract.ts` states the combined account store and the throttle's two
runtime values a host must supply.

`authentication.feature.ts` (the moved `service/auth.service.ts`) registers and signs in password
and OIDC accounts and resolves a session token to the caller's principal. `login-throttle.ts` (the
moved `service/login-throttle.ts`) is its own admission collaborator: a fixed-window failure limit
and bounded per-process concurrency cap over password verification, exported alongside `auth` as a
second current compatibility value rather than folded into one interface — see `module.ts`'s own
note on why. Private bindings are named under the `application.authentication` label, so a DI
failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module;
`libs/wbs/application/core/src/index.ts`, `libs/wbs/application/core/src/service/auth.service.ts`
and `libs/wbs/application/core/src/service/login-throttle.ts` keep the former `@wbs/core`
deep-import names.
