# Plan document

<!-- module-index {"schemaVersion":1,"moduleId":"module.application.plan-document","memberships":[{"kind":"path","path":"check.ts"},{"kind":"path","path":"connected-document.test.ts"},{"kind":"path","path":"connected-document.ts"},{"kind":"path","path":"contract.ts"},{"kind":"path","path":"legacy-document-import.ts"},{"kind":"path","path":"module.test.ts"},{"kind":"path","path":"module.ts"},{"kind":"path","path":"plan-document-rename.test.ts"},{"kind":"path","path":"plan-document-values.ts"},{"kind":"path","path":"plan-document.resource.test.ts"},{"kind":"path","path":"plan-document.resource.ts"},{"kind":"path","path":"tsconfig.json"},{"kind":"path","path":"plan-document-project.test.ts"}],"relationshipSelectors":[],"applicableChecks":["check.core.test"],"inapplicableSections":[{"section":"relationships","reason":"No committed relationship extractor is pointed at this directory yet; Consumers below names every production reader a module-specifier scan found on 2026-09-29, when the compatibility shims were retired."},{"section":"invariants","reason":"The complete-directory-closure and version-header-first invariants are documented on PlanDocumentService and classifyPlanDocument; neither spans more than one file of this module."}],"externalConsumers":{"kind":"declared","memberships":[{"kind":"path","path":"libs/wbs/application/core/src/http/import.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/http/work-package.routes.ts"},{"kind":"path","path":"libs/wbs/application/core/src/index.ts"},{"kind":"path","path":"libs/wbs/application/core/src/testing/import-service-source-contract.ts"}],"knowledgeLimit":"The one installer call site, the core barrel, the import routes and the import source-contract fixture are declared; the be-01 boundary tests reach this module through the barrel and are not tracked here."}} -->

The first sealed resource module in the core, following the six feature modules' pattern:
`module.ts` seals the graph, `check.ts` is the only place that builds a bag, and `contract.ts`
states the timestamp clock a host must supply. Complete detached export evidence is required from `PlanExportReader`; the serializer performs no store reads.

`plan-document.resource.ts` (the moved `service/plan-document.ts`) builds the versioned archival
document around a work package tree, naming every directory row the tree references, and classifies an
incoming document by its version header before validating it. `plan-document-values.ts` holds its
export, classification and service-option types; the resource preserves their existing exports. Private bindings are named under the
`application.plan-document` label, so a DI failure says which module asked.

## Checks

The applicable check is the `wbs-core:test` target declared in
`libs/wbs/application/core/project.json`, recorded above as `check.core.test`.

## Consumers

`libs/wbs/application/core/src/http/work-package.routes.ts` installs the module once per route set, over
the timestamp clock it is handed; `libs/wbs/application/core/src/index.ts`
re-exports `plan-document.resource.ts` from the `@wbs/core` barrel, and
`libs/wbs/application/core/src/http/import.routes.ts` and
`libs/wbs/application/core/src/testing/import-service-source-contract.ts` import it directly.

## Wiki registration

A member of `docs/wiki-policy/modules.json`'s content-review pilot, as `module.application.plan-document`
(`docs/wiki-policy/policy.json`'s `boundary.application.plan-document`). Its files postdate the pilot's
frozen `sourceRevision` and were never renamed from anything, so there is no predecessor for a
`sourceSelector` to bind. The boundary names a `creationRevision` instead: `b53693a2`, the commit
that first added this directory, and its baseline is this directory's tuples at that commit. The
trusted loader refuses a creation revision that is not that first commit or disagrees with the
baseline.

## Retired independent export reads

The asynchronous exporter and its independent store reads were retired when delivery required one captured export observation for every mode. The following copied source records preserve earlier Proof text as historical evidence only; they do not establish the new capture adapters or their observation boundaries. The clock/private-module proofs remain with their current bindings.

```ts
  constructor(private readonly options: PlanDocumentServiceOptions) {
    // Proof: removing required-reader guard failed the construction negative (mutation-required-reader-final.txt, 2026-10-17).
    // Untyped composition hosts must fail at construction when this required port is absent.
    const reader: unknown = Reflect.get(options, 'stepParallels');
    if (
      typeof reader !== 'object' ||
      reader === null ||
      typeof Reflect.get(reader, 'listByWorkPackage') !== 'function'
    )
      throw new Error('plan export requires a step parallelism reader');
  }

  /**
   * Exports `tree` as the current plan document, or refuses while any step is
   * uncoded (`code: null`, written mid-swap by an older be-01 and not yet
   * backfilled): the document carries every step's code and never invents one.
   *
   * Under scoped access the directory closure is read from the organization's
   * own catalogs, under their local names, so a person's teams and a team's
   * services that cross into another organization fail the export closed
   * rather than export a foreign entry; see {@link _DirectoryStore.listInOrganization | DirectoryStore.listInOrganization}.
   *
   * Proof: reading the global directory under scoped access made `exports
   * only the organization's own directory, under its local names` in
   * `import-export-organization.controller.db.test.ts` export the root names
   * `root-pe-a`, `root-tm-a` and `root-sv-a`; watched 2026-09-27.
   *
   * @throws when a step has no `code` key at all. This service reads its own
   * store, which always answers the key; an absent one is an older reader's
   * wire shape and cannot reach here.
   */
  async export(
    workPackage: ExportedWorkPackage,
    tree: WorkItemTree,
    access: ResourceAccess,
  ): Promise<PlanDocumentExport> {
    const coded = codedTree(tree);
    if (!coded.ok) return coded;
    return this.exportCaptured(
      workPackage,
      coded.value,
      await this.readDocumentReads(workPackage, access),
    );
  }


```

```ts
  private async readDocumentReads(
    workPackage: WorkPackage,
    access: ResourceAccess,
  ): Promise<PlanDocumentReads> {
    const directory = this.options.directory;
    const read = <C extends DirectoryCatalog>(
      catalog: C,
      legacy: () => Promise<DirectoryCatalogRows[C]>,
    ): Promise<DirectoryCatalogRows[C]> =>
      access.kind === 'scoped'
        ? directory.listInOrganization(catalog, access.scope.organizationId)
        : legacy();
    const [teams, people, tags, services, types, externalSystems, markerRead, stepParallels] =
      await Promise.all([
        read('teams', () => directory.listTeams()),
        read('people', () => directory.listPeople()),
        read('tags', () => directory.listTags()),
        read('services', () => directory.listServices()),
        read('workItemTypes', () => directory.listWorkItemTypes()),
        read('externalSystems', () => directory.listExternalSystems()),
        this.options.markers.list(workPackage.id),
        // Proof: empty injection and wrong work package independently failed mounted isolated export (mutation-legacy-{read-empty,wrong-work-package}.txt).
        this.options.stepParallels.listByWorkPackage(workPackage.id),
      ]);
    if (!markerRead.ok)
      throw new Error(`work package "${workPackage.id}" disappeared during export`);
    const [resources, capacities, demands] = await Promise.all([
      read('resources', () => directory.listResources()),
      this.options.resourceFacts.resourceCapacitiesOf(workPackage.id),
      this.options.resourceFacts.demandsOf(workPackage.id),
    ]);
    const measureFacts = this.options.measureFacts;
    // Proof: with the facts, trios and budgets read as empty, the isolated
    // `round-trips a version-11 plan byte for byte into an organization lacking
    // a measure` and four more cases of measure-export.controller.db.test.ts
    // exported empty lists (4 pass, 5 fail); watched 2026-10-24.
    const [definitions, facts, estimates, budgets] = await Promise.all([
      measureFacts.measureDefinitionsOf(workPackage.id),
      measureFacts.measuresOf(workPackage.id),
      measureFacts.measureEstimatesOf(workPackage.id),
      measureFacts.budgetsOf(workPackage.id),
    ]);
    return {
      directory: { teams, people, tags, services, types, externalSystems },
      markers: markerRead.value,
      stepParallels,
      resources: { resources, capacities, demands },
      measures: { definitions, facts, estimates, budgets },
    };
  }
```

```ts
const found = await workPackages.readWithin(params.id, resolved.access);
if (found === null) return { ok: false, status: 404, body: { error: 'not_found' } };
// Proof: reading the tree unscoped made `fails the export and the
// optimizer retry closed over a crossing row` in
// `schedule-organization.controller.db.test.ts` export with 200.
const tree = await workItems.treeWithin(params.id, resolved.access);
if (tree === null) return { ok: false, status: 404, body: { error: 'not_found' } };
// Proof: removing this branch made both mounted unavailable export cases
// receive 500 instead of 409, before either could inspect media or body.
// Proof: removing this mapping failed mounted revocation: expected 403 became 500.
if ('kind' in tree && tree.kind === 'access_refused') return organizationRefusal(tree.refusal);
if ('kind' in tree)
  return {
    ok: false,
    status: 409,
    body: { error: tree.error, engine: tree.engine },
  };
if (query.format === 'markdown')
  return {
    ok: true,
    status: 200,
    // Proof: returning this as a JSON body made the mounted Markdown export receive 500 instead of 200.
    text: workPackageMarkdown(found.workPackage, tree.workItems),
  };
const exported = await planDocuments.export(found.workPackage, tree, resolved.access);
if (!exported.ok)
  return {
    ok: false,
    status: 409,
    body:
      // Proof: wrong isolated mapping failed mounted sparse409 (mutation-isolated-mapping.txt, 2026-10-17).
      exported.error === 'uncoded_steps'
        ? { error: exported.error, steps: exported.steps, command: exported.command }
        : { error: exported.error },
  };
return {
  ok: true,
  status: 200,
  body: exported.value,
  headers: [['content-type', 'application/json; charset=utf-8']],
};
```
