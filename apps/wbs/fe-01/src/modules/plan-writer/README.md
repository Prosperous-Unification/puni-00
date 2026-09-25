# Plan writer

<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.plan-writer","memberships":[{"kind":"path","path":"busy-store.model.test.ts"},{"kind":"path","path":"busy-store.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"plan-writer.feature.ts"},{"kind":"path","path":"plan-writer.test.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."},{"section":"invariants","reason":"The reread ledger and the refresh owner's identity check are documented on the writer, and the busy store carries its own model test; none spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-dependencies.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/use-plan-read.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/project/contract.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/project-runtime.ts"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->

One plan gesture, and what has to be read again once it is over. Every command service in the
table writes through this module.

The service is plain TypeScript and imports no React, which is rule F1 of the code organization
design in `docs/superpowers/specs/2026-09-19-code-organization-design.md`. It is a
feature-service: it coordinates the gesture's own request ledger against the plan feed it is
handed, and it holds no transport of its own.

## What it owns

- The ledger of the gesture's completed requests, and therefore the reread set a landing earns.
- Which resources a refusal earns instead: the completed prefix normally, everything when the
  failure is ambiguous, when the target has gone, or when be-01 could not read the request.
- Whether the gesture still belongs to the reader on screen: the refresh owner it began under is
  still the one answered, asked when a request is refused, when the gesture lands and after its
  covering read.
- Raising and clearing the project's busy state, and the outcome the caller acts on. The state
  itself is `busy-store.ts`, a plain store the table selects from; the writer is handed only its
  `raise` and `lower`, and lowers however the gesture ended: the state is one project runtime's
  own, so a gesture whose reader has left lowers only a state nobody draws.
- Saying that a command was issued, and announcing a refusal, each through a `Publisher` of a
  project channel (`modules/channel.ts`). The table listens; the writer never learns who does.

## What it does not own

The plan feed itself. Rereads go out through `rereadResources`, which the host supplies and which
today is the plan read hook's own invalidation callback. The feed becomes a module of its own in
work item 040.4.

## Relationships

The exported types are in `contract.ts`; the service is `plan-writer.feature.ts`; the busy store is
`busy-store.ts`. There is no
`module.ts` yet: DI Bag is not installed, so the host builds the service with a plain factory
call. Its one host today is `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`. The requests a
gesture sends are not this module's: the table's hooks send them through the project's
`PlanCommands` (`modules/plan-commands/`) inside the gesture this module runs.

## Checks

The applicable check is the `test:unit` target declared in `apps/wbs/fe-01/project.json`; the
module's own suites are `plan-writer.test.ts` and `busy-store.model.test.ts`. The behaviour this extraction preserves is proved by
the plan table's own suites, which run in the `test` target of the same project.

Its isolated type check is the `typecheck:module` target of the same project, which `typecheck`
depends on, recorded in the index above as `check.fe-01.typecheck-module`: `tsconfig.json` here
extends `../tsconfig.module.json` and names what this module reaches beyond the shared list there.
