# Plan writer

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
- Whether the gesture still belongs to the reader on screen, at each of the three moments that
  question has a different answer.
- Raising and clearing the shared busy state, and the outcome the caller acts on.

## What it does not own

The plan feed itself. Rereads go out through `rereadResources`, which the host supplies and which
today is the plan read hook's own invalidation callback. The feed becomes a module of its own in
work item 040.4.

## Relationships

The exported types are in `contract.ts`; the service is `plan-writer.feature.ts`. There is no
`module.ts` yet: DI Bag is not installed, so the host builds the service with a plain factory
call. Its one host today is `apps/wbs/fe-01/src/components/wbs/use-plan-read.ts`.

## Checks

The applicable check is the `test:unit` target declared in `apps/wbs/fe-01/project.json`; the
module's own suite is `plan-writer.test.ts`. The behaviour this extraction preserves is proved by
the plan table's own suites, which run in the `test` target of the same project.
