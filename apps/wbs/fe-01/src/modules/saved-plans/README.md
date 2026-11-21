# Saved plans

<!-- module-index {"schemaVersion":1,"moduleId":"module.frontend.saved-plans","memberships":[{"kind":"path","path":"contract.ts"},{"kind":"path","path":"saved-plans.feature.test.ts"},{"kind":"path","path":"saved-plans.feature.ts"},{"kind":"path","path":"tsconfig.json"}],"relationshipSelectors":[],"applicableChecks":["check.fe-01.typecheck-module"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; externalConsumers names every production file outside the module that imports it, found by resolving imports on the planning date."},{"section":"invariants","reason":"That a withdrawn work package's shelf never changes and its requests send nothing is documented on SavedPlans and openSavedPlans; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/work-package-page.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/saved-plan-list.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/components/wbs/saved-plans-panel.tsx"},{"kind":"path","path":"apps/wbs/fe-01/src/lib/saved-plan-save.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/work-package/composition.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/modules/work-package/contract.ts"},{"kind":"path","path":"apps/wbs/fe-01/src/runtime/work-package-runtime.ts"}],"knowledgeLimit":"Only production importers are declared; test suites and the fixtures under apps/wbs/fe-01/src/testing that import this module are not tracked here."}} -->

One selected work package's saved plans: its shelf of checkpoints, read now and again whenever the
work package's broadcast says it moved, and the save, rename and comparison requests the shelf's panel
makes.

One kind, plain TypeScript, no React (rule F1 of the code organization design in
`docs/superpowers/specs/2026-09-19-code-organization-design.md`).

- `contract.ts` declares the module's **private repository port**, `SavedPlanRoutes` — be-01's
  checkpoint routes, the question whether this node serves them, and the work package's broadcast — and
  the **feature** surface delivery sees instead, `SavedPlans` (rule K2), with the shelf's
  `SavedPlanListState`.
- `saved-plans.feature.ts` reads a shelf (`readShelf`), watches one (`watchShelf`) and opens one
  work package's saved plans over the port (`openSavedPlans`).

## What it owns

- The order of a shelf read: the list is never asked of a node that does not serve it, and a node
  that cannot answer is never subscribed to.
- That a superseded read never overwrites a newer answer.
- That once its work package runtime is withdrawn the shelf never changes again, and every request sends
  nothing and rejects with `SavedPlansWithdrawnError`.

## What it does not own

When the saved plans are opened and closed: `apps/wbs/fe-01/src/runtime/work-package-runtime.ts` opens
them once per selected work package and closes their watch when the work package is left. The port over the
browser is the work package composition root's (`modules/work-package/composition.ts`,
`browserSavedPlanRoutes`). What a save, a rename or a comparison says on screen stays with the panel
(`components/wbs/saved-plans-panel.tsx`), and a save in flight across a remount with
`lib/saved-plan-save.ts`.

## Relationships

There is no `module.ts`: this module is not a sealed DI Bag module of its own. The work package runtime's
DI Bag graph installs it, through `WorkPackageServices.savedPlansFor`, beside the feed, and delivery
receives `SavedPlans` through `WorkPackageRuntime` and never the port.

## Checks

The applicable target is `test` in `apps/wbs/fe-01/project.json`, which runs the module's suite,
`saved-plans.feature.test.ts`, under jsdom: the tier rule reads its prose mentions of the OpenAPI
document as DOM evidence, so it is not among `test:unit`'s node suites. The shelf's life with its work package is proved by
`runtime/work-package-runtime.test.ts` and `components/wbs/work-package-replacement.test.tsx`, which run in
the `test` target of the same work package.

Its isolated type check is the `typecheck:module` target of the same work package, which `typecheck`
depends on, recorded in the index above as `check.fe-01.typecheck-module`: `tsconfig.json` here
extends `../tsconfig.module.json` and names what this module reaches beyond the shared list there.

Its graph check is `tools/tool-devsync/src/frontend-module-graph.test.ts`, run by the `test`
target of `tool-devsync`: the production files outside this directory that import it must equal
`externalConsumers` in the index above, so a new importer or a dropped one fails under this
module's name.
