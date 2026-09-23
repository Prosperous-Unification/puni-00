# Plan import

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
