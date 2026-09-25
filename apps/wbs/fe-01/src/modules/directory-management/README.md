# Directory management

<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.directory-management","memberships":[{"kind":"path","path":"contract.ts"},{"kind":"path","path":"directory-management.feature.test.ts"},{"kind":"path","path":"directory-management.feature.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"tsconfig.json"},{"kind":"path","path":"view/use-directory-management.ts"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."},{"section":"invariants","reason":"The refusal and completion rules are documented on the feature and its sealed module; none spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/components/directory/directory-page.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/session-runtime.ts"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->

Everything a person does to the account-wide directory: renaming an entry, adding one of the five
kinds, making a team for somebody, making a service a team is responsible for, and removing an
entry once its usage has been seen.

A feature-service. It is plain TypeScript and imports no React, which is rule F1 of the code
organization design in `docs/superpowers/specs/2026-09-19-code-organization-design.md`. It
coordinates the directory resource-service beside it and holds no transport of its own.

## What it owns

- That a name of whitespace alone is refused without a round trip, and a name equal to the stored
  one is not sent at all.
- That a removal is always asked without a cascade first, and that a second refusal against a
  confirmed cascade is raised rather than turned into a second confirmation.
- That making a team for somebody, or a service for a team, is a create and then a patch — one
  gesture over two resources, which is the design's model feature.
- When a caller's completion callback runs: inside the awaited change, before the refetch, which
  is where the page dropped its name draft and cleared its boxes.

## What it does not own

The snapshot, the newest-read rule, the write runner and the client. Those are the directory
resource-service, which this module is the only importer of. The page's own view state — the name
drafts, the boxes being typed into, the open confirmation and the chip focus — stays in the page.

## Relationships

The exported types are in `contract.ts`; the service is `directory-management.feature.ts`.
`module.ts` is the sealed DI Bag module: it exports `directoryManagement`, keeps the `directory`
resource private under the `frontend.directory-management` label, and requires `directoryApi` and
`isActiveReader` from its host. That host is the session runtime,
`apps/wbs/fe-01/src/runtime/session-runtime.ts`, which installs it once per signed-in user over the
client cut from that user's credential and withdraws it with the session. Delivery receives
`DirectoryManagement` through router context; `view/use-directory-management.ts` is the React
adapter its one page, `apps/wbs/fe-01/src/components/directory/directory-page.tsx`, reads it through.
The page's suite draws the page over a client of its own with
`apps/wbs/fe-01/src/testing/directory-page-over-client.tsx`.

## Checks

The applicable target is `test:unit` in `apps/wbs/fe-01/project.json`; the module's own suites are
`directory-management.feature.test.ts` and `module.test.ts`. The behaviour this extraction preserves is proved by
`apps/wbs/fe-01/src/components/directory/directory-page.test.tsx`, in the `test` target.

Its isolated type check is the `typecheck:module` target of the same project, which `typecheck`
depends on, recorded in the index above as `check.fe-01.typecheck-module`: `tsconfig.json` here
extends `../tsconfig.module.json` and names what this module reaches beyond the shared list there.
