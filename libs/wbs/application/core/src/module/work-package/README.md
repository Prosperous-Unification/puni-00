# Work package

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.project","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"work-package.resource.ts"},{"kind":"path","path":"tsconfig.json"},{"kind":"path","path":"module-loading.test.ts"},{"kind":"path","path":"work-package-birth-owner.ts"},{"kind":"path","path":"work-package-birth.ts"},{"kind":"path","path":"work-package-opening.test.ts"},{"kind":"path","path":"work-package-opening.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every production reader a module-specifier scan found on 2026-09-29, when the compatibility shims were retired."},{"section":"invariants","reason":"The fail-closed optimizer gate and the settings-moved announcement are documented on WorkPackageService; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"apps/wbs/be-01/src/app.ts"},{"kind":"path","path":"libs/wbs/application/core/src/compose.ts"},{"kind":"path","path":"libs/wbs/application/core/src/http/history.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/http/internal.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/http/work-package.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/http/saved-plan.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/http/solution.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/module/plan-commands/admitted-write.ts"},{"kind":"path","path":"libs/wbs/application/core/src/module/saved-plans/save-plan.ts"},{"kind":"path","path":"libs/wbs/application/core/src/service/person-load.feature.ts"}],"knowledgeLimit":"The composition root, the core barrel, the history, internal, work package, saved-plan and solution routes, Plan commands' admitted writes, Saved plans, Person load and be-01's app are declared; the writes fixture, the organization harness and the be-01 controller and database tests are not tracked here."}} -->

A sealed resource module installed per admitted scope: `servicesOver` in
`libs/wbs/application/core/src/compose.ts` installs it once for the public graph and once for every
admitted batch, over that scope's own store. `module.ts` seals the graph, `check.ts` is the only
place that builds a bag, and `contract.ts` states the store, the clock, the broadcaster and the
optional optimizer availability a host must supply.

`work-package.resource.ts` creates a work package with its starting
steps, lists and reads work packages, and updates their settings on a `canEditWorkPackage`-gated write,
refusing to switch an optimizer on where the deployment has none and announcing
`work_package_settings_changed` when a setting moved. Private bindings are named under the
`application.work-package` label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/compose.ts` installs the module per supplied scope;
`libs/wbs/application/core/src/index.ts` re-exports `work-package.resource.ts` from the `@wbs/core`
barrel; the history, internal, work package, saved-plan and solution routes, Plan commands' admitted
writes, Saved plans, `libs/wbs/application/core/src/service/person-load.feature.ts` and
`apps/wbs/be-01/src/app.ts` import it directly.

## Wiki registration

A full member of `docs/wiki-policy/modules.json`'s content-review pilot, retaining the stable
`module.application.project` identity and `docs/wiki-policy/policy.json`'s
`boundary.application.project` identity after this directory move. These published wiki identities
are independent of the current `application.work-package` DI label.

The [wiki policy](../../../../../../../docs/wiki-policy/policy.json) records this boundary's historical
`sourceSelector` at the pilot's frozen `sourceRevision`, with its original baseline blob. That
selected historical predecessor remains unchanged; the other files here have no separate baseline
entry.
