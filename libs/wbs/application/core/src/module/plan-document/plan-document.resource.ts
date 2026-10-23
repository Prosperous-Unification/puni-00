import {
  type DocumentAttempt,
  documentAttempt,
  type DocumentBudget,
  documentBudget,
  type DocumentDemand,
  documentDemand,
  type DocumentMeasureDefinition,
  documentMeasureDefinition,
  type DocumentMeasureEstimate,
  documentMeasureEstimate,
  type DocumentMeasureFact,
  documentMeasureFact,
  type DocumentResource,
  documentResource,
  type DocumentResourceCapacity,
  documentResourceCapacity,
  type DocumentTypedDependency,
  documentTypedDependencyRequest,
  documentV4TypedDependencyRequest,
  type ImportedAttempt,
  LEGACY_PLAN_DOCUMENT_VERSION,
  PLAN_DOCUMENT_VERSION,
  type PlanDocument,
  planDocumentHeaderRequest,
  type PlanDocumentImport,
  type PlanDocumentRequest,
  planDocumentRequest,
  validateSchema,
  type WorkItemTree,
} from '@wbs/contracts';
import {
  assertStepParallel,
  definitionsOrUnowned,
  formatStepNodeId,
  formatStepReference,
  isEstimateUnit,
  isHold,
  isLegacyMetric,
  isReadiness,
  isTimezone,
  MOST_RESOURCE_UNITS,
  NO_ALLOWANCE,
  orderSteps,
} from '@wbs/domain';
import { type } from '@wbs/validation';

import type {
  DirectoryCatalog,
  DirectoryCatalogRows,
  DirectoryStore as _DirectoryStore,
  PersonWithTeams,
  TeamWithServices,
} from '../../ports/directory-store';
import type { ResourceAccess } from '../../ports/organization-access';
import type { Project } from '../../ports/project-store';
import { isBudgetFactor } from '../../ports/project-values';
import type { MeasureReads, PlanDocumentReads } from '../../ports/shared-people-values';
import type { ExternalSystem, Service, Tag, WorkItemType } from '../../ports/work-item-store';
import type {
  ExportedProject,
  PlanDocumentClassification,
  PlanDocumentExport,
  PlanDocumentServiceOptions,
} from './plan-document-values';

export type {
  ExportedProject,
  PlanDocumentClassification,
  PlanDocumentExport,
  PlanDocumentServiceOptions,
} from './plan-document-values';

type TreeEndpoint = NonNullable<WorkItemTree['typedDependencies']>[number]['predecessor'];

/** Writes file-local references and refuses an incomplete trusted tree projection. */
function documentEndpoint(endpoint: TreeEndpoint): DocumentTypedDependency['predecessor'] {
  if (endpoint.scope === 'whole') return { scope: 'whole', workItem: endpoint.workItemId };
  // Proof (2026-09-28): removing this guard let the missing-step tree export
  // succeed with an undefined step; its trusted-endpoint test then failed.
  if (endpoint.stepId === undefined)
    throw new Error(`typed ${endpoint.scope} endpoint has no step in tree read`);
  // Proof (2026-09-28): forcing this scope to whole made the memory source
  // "round trips multiple step links" fail on node/step endpoint equality.
  return { scope: endpoint.scope, workItem: endpoint.workItemId, step: endpoint.stepId };
}

/** The be-01 command that codes every step an older writer left uncoded. */
const STEP_CODE_BACKFILL_COMMAND = 'bun run src/backfill-step-codes-cli.ts';

/**
 * Constructs the versioned archival document around the established project
 * tree projection.
 *
 * @throws when a file-local reference has no directory row. An unnamed default
 * would make the exported document impossible to restore faithfully.
 */
export class PlanDocumentService {
  constructor(private readonly options: PlanDocumentServiceOptions) {
    // Proof: removing required-reader guard failed the construction negative (mutation-required-reader-final.txt, 2026-10-17).
    // Untyped composition hosts must fail at construction when this required port is absent.
    const reader: unknown = Reflect.get(options, 'stepParallels');
    if (
      typeof reader !== 'object' ||
      reader === null ||
      typeof Reflect.get(reader, 'listByProject') !== 'function'
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
    project: ExportedProject,
    tree: WorkItemTree,
    access: ResourceAccess,
  ): Promise<PlanDocumentExport> {
    const coded = codedTree(tree);
    if (!coded.ok) return coded;
    return this.exportCaptured(project, coded.value, await this.readDocumentReads(project, access));
  }

  /**
   * Builds from detached export evidence and performs no store reads. Valid
   * nonempty sparse policy refuses because version 9 cannot preserve it.
   * Uncoded steps precede modeled sparse refusals; trusted shared store failures
   * may already have thrown while the observation was captured.
   * @throws when required sparse evidence is absent or malformed, or its exact
   * pair does not name a leaf and step belonging to the exported project.
   */
  exportCaptured(
    project: ExportedProject,
    tree: WorkItemTree,
    reads: PlanDocumentReads,
  ): PlanDocumentExport {
    const coded = codedTree(tree);
    if (!coded.ok) return coded;
    validateStepParallels(project, tree, reads.stepParallels);
    // Proof: omitting refusal made both mounted sparse JSON cases succeed (mutation-refusal.txt, 2026-10-17).
    if (reads.stepParallels.length > 0) return { ok: false, error: 'unsupported_step_parallelism' };
    return {
      ok: true,
      value: buildDocument(project, coded.value, reads, this.options.clock.now()),
    };
  }

  private async readDocumentReads(
    project: Project,
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
        this.options.markers.list(project.id),
        // Proof: empty injection and wrong project independently failed mounted isolated export (mutation-legacy-{read-empty,wrong-project}.txt).
        this.options.stepParallels.listByProject(project.id),
      ]);
    if (!markerRead.ok) throw new Error(`project "${project.id}" disappeared during export`);
    const [resources, capacities, demands] = await Promise.all([
      read('resources', () => directory.listResources()),
      this.options.resourceFacts.resourceCapacitiesOf(project.id),
      this.options.resourceFacts.demandsOf(project.id),
    ]);
    const measureFacts = this.options.measureFacts;
    // Proof: with these four read as empty, the isolated `round-trips a
    // version-11 plan byte for byte into an organization lacking a measure`
    // (measure-export.controller.db.test.ts) exported version 10; watched
    // 2026-10-23.
    const [definitions, facts, estimates, budgets] = await Promise.all([
      measureFacts.measureDefinitionsOf(project.id),
      measureFacts.measuresOf(project.id),
      measureFacts.measureEstimatesOf(project.id),
      measureFacts.budgetsOf(project.id),
    ]);
    return {
      directory: { teams, people, tags, services, types, externalSystems },
      markers: markerRead.value,
      stepParallels,
      resources: { resources, capacities, demands },
      measures: { definitions, facts, estimates, budgets },
    };
  }
}

/** Refuses corrupt trusted sparse evidence before the version 9 preservation fence. */
function validateStepParallels(project: Project, tree: WorkItemTree, held: unknown): void {
  // Proof: removing this check failed the missing/null/object collection negative (mutation-collection.txt, 2026-10-17).
  if (!Array.isArray(held)) throw new Error('export was read without step parallelism');
  const owners = new Map(tree.workItems.map((row) => [row.id, row]));
  const steps = new Map(tree.steps.map((step) => [step.id, step]));
  const parents = new Set(tree.workItems.map((row) => row.parentId));
  const pairs = new Map<string, Set<string>>();
  for (const fact of held) {
    // Proof: removing this check failed the null row negative (mutation-row.txt, 2026-10-17).
    if (typeof fact !== 'object' || fact === null || Array.isArray(fact))
      throw new Error('malformed step parallelism');
    const workItemId: unknown = Reflect.get(fact, 'workItemId');
    const stepId: unknown = Reflect.get(fact, 'stepId');
    const maximum: unknown = Reflect.get(fact, 'maxParallel');
    // Proof: removing this check failed the malformed ID/maximum negative (mutation-ids.txt, 2026-10-17).
    if (typeof workItemId !== 'string' || typeof stepId !== 'string' || typeof maximum !== 'number')
      throw new Error('malformed step parallelism');
    // Proof: removing this check failed the fraction/zero/1001 negative (mutation-maximum.txt, 2026-10-17).
    assertStepParallel(maximum);
    const owner = owners.get(workItemId);
    // Proof: removing this check failed the missing owner negative (mutation-owner-existence.txt, 2026-10-17).
    if (owner === undefined) throw new Error('step parallelism names an unknown work item');
    // Proof: removing this check failed the foreign owner negative (mutation-owner-project.txt, 2026-10-17).
    if (owner.projectId !== project.id)
      throw new Error('step parallelism names a foreign work item');
    const step = steps.get(stepId);
    // Proof: removing this check failed the missing step negative (mutation-step-existence.txt, 2026-10-17).
    if (step === undefined) throw new Error('step parallelism names an unknown step');
    // Proof: removing this check failed the foreign step negative (mutation-step-project.txt, 2026-10-17).
    if (step.projectId !== project.id) throw new Error('step parallelism names a foreign step');
    // Proof: removing this check failed the parent owner negative (mutation-leaf.txt, 2026-10-17).
    if (parents.has(workItemId)) throw new Error('step parallelism names a parent work item');
    const seen = pairs.get(workItemId);
    // Proof: removing this check failed the duplicate exact pair negative (mutation-duplicate.txt, 2026-10-17).
    if (seen?.has(stepId)) throw new Error('duplicate step parallelism');
    if (seen === undefined) pairs.set(workItemId, new Set([stepId]));
    else seen.add(stepId);
  }
}

function codedTree(
  tree: WorkItemTree,
):
  | { ok: true; value: WorkItemTree & { steps: PlanDocument['steps'] } }
  | Extract<PlanDocumentExport, { ok: false }> {
  const coded: PlanDocument['steps'] = [];
  const uncoded: { id: string; name: string }[] = [];
  for (const step of tree.steps) {
    // Proof: with this throw removed, `throws on a step read without a code
    // key` received an export instead of an Error (2026-09-27).
    if (step.code === undefined) throw new Error(`step "${step.id}" was read without a code`);
    // Proof: with this branch removed, `refuses to export a project holding
    // an uncoded step, naming it` received ok: true, and the mounted be-01
    // export received 500 instead of 409 (2026-09-27).
    if (step.code === null) uncoded.push({ id: step.id, name: step.name });
    else {
      // Proof: removing this guard exported a trusted step without a unit (plan-document.resource.test.ts version 8).
      if (step.estimateUnit === undefined)
        throw new Error(`step ${step.id} was read without an estimate unit`);
      coded.push({ ...step, code: step.code, estimateUnit: step.estimateUnit });
    }
  }
  if (uncoded.length > 0)
    return {
      ok: false,
      error: 'uncoded_steps',
      steps: uncoded,
      command: STEP_CODE_BACKFILL_COMMAND,
    };
  return { ok: true, value: { ...tree, steps: coded } };
}

/** Serializes detached evidence without following any store capability. */
function buildDocument(
  project: ExportedProject,
  tree: WorkItemTree & { steps: PlanDocument['steps'] },
  reads: PlanDocumentReads,
  exportedAt: number,
): PlanDocument {
  const closure = referencedDirectory(tree, reads.directory);
  // Proof (2026-09-28): removing this guard made the missing-list export
  // test receive a TypeError from .map instead of the named trusted-state error.
  if (tree.typedDependencies === undefined)
    throw new Error(`project "${project.id}" tree was read without typed dependencies`);
  // The factor travels in `settings` at version 11 only (design D53); the
  // embedded project never carries it, so version 10 keeps its bytes.
  // Proof: with the factor left in, `v9 zero-fact export retains canonical
  // bytes` (plan-document.resource.test.ts) read other bytes; watched 2026-10-23.
  const { budgetFactor, ...exported } = project;
  const measures = documentMeasures(tree, reads.measures);
  const settings = {
    name: project.name,
    restricted: project.restricted,
    estimateMethod: project.estimateMethod,
    depReach: project.depReach,
    pertWeights: project.pertWeights,
    // Proof: dropping estimateRounding made the mounted JSON export return
    // 500 instead of 200 before its unchanged project/workItems controls.
    estimateRounding: project.estimateRounding,
    startDate: project.startDate,
    solutionRef: project.solutionRef,
    optimizationEnabled: project.optimizationEnabled,
    scheduleEngine: project.scheduleEngine,
    scheduleObjective: project.scheduleObjective,
    timezone: project.timezone,
  };
  // Version 11 only when the plan holds something version 10 cannot carry
  // (design D53): a plan without measures exports the bytes it always did.
  // Proof: with this test made `true`, `v10 resources export retains canonical
  // bytes` and `v9 zero-fact export retains canonical bytes`
  // (plan-document.resource.test.ts) read version 11 and other bytes; with it
  // made `false`, `exports version 11 with every measure the plan holds` read
  // version 10; both watched 2026-10-23.
  const carriesMeasures = measures !== null || budgetFactor !== 1;
  const base: PlanDocument = {
    project: exported,
    ...tree,
    workItems: documentWorkItems(tree, closure.people),
    // Proof: omitting this collection failed `v9 exports detached direct blockage facts` (2026-10-14).
    stepBlockages: documentBlockages(tree),
    typedDependencies: tree.typedDependencies.map(({ id, predecessor, successor, type }) => {
      // Proof (2026-09-28): omitting this guard let the unknown-type tree
      // export succeed; its trusted-relationship test failed.
      if (type !== 'FS' && type !== 'SS' && type !== 'FF')
        throw new Error(`unknown typed dependency type ${type}`);
      return {
        id,
        predecessor: documentEndpoint(predecessor),
        successor: documentEndpoint(successor),
        // Proof: forcing FF to FS here made the memory import/export round
        // trip expect FF but receive FS (1 failing test, 2026-09-28).
        type,
      };
    }),
    stepNodes: spellStepNodes(tree),
    document: {
      format: 'wbs-plan',
      version: carriesMeasures ? PLAN_DOCUMENT_VERSION : LEGACY_PLAN_DOCUMENT_VERSION,
      exportedAt: new Date(exportedAt).toISOString(),
    },
    settings: carriesMeasures ? { ...settings, budgetFactor } : settings,
    capacity: tree.teamCapacities.map(({ serviceTeamId, size }) => ({
      teamId: serviceTeamId,
      size,
    })),
    // Proof: with either list written empty, `exports only the resources its
    // capacities and demands name (wbs-resources)` (plan-document.resource.test.ts)
    // failed; watched 2026-10-20.
    resourceCapacities: [...reads.resources.capacities]
      .sort((left, right) => left.resourceId.localeCompare(right.resourceId))
      .map(({ resourceId, units }) => ({ resourceId, units })),
    demands: documentDemands(tree, reads.resources.demands),
    calendarMarkers: reads.markers.map(({ id, date, name, color }) => ({
      id,
      date,
      name,
      color,
    })),
    // Proof: `closure` written whole put `accountId` into the document and
    // failed `capacity-only team is named …` and `v9 zero-fact export retains
    // canonical bytes` in `plan-document.resource.test.ts`, and `exports the
    // referenced directory closure …` in `project.controller.test.ts` (watched 2026-10-19).
    directory: {
      ...closure,
      people: closure.people.map(exportedPerson),
      resources: referencedResources(reads.resources),
    },
  };
  if (!carriesMeasures) return base;
  return {
    ...base,
    measureDefinitions: measures?.definitions ?? [],
    measureFacts: measures?.facts ?? [],
    measureEstimates: measures?.estimates ?? [],
    budgets: measures?.budgets ?? [],
  };
}

/** What version 11 adds beyond the factor; see {@link documentMeasures}. */
interface DocumentMeasures {
  definitions: DocumentMeasureDefinition[];
  facts: DocumentMeasureFact[];
  estimates: DocumentMeasureEstimate[];
  budgets: DocumentBudget[];
}

/**
 * The measures version 11 carries (`wbs-measure-budgets` design D53), or null
 * when the plan holds none: every stored fact in a defined measure (the legacy
 * `token_actual`, `hours_actual` and `token_estimate` stay in the row's
 * `measures`, D18), every trio but the single-point tokens trios (each is its
 * row's legacy `token_estimate`, D28), every stated budget, and the
 * definitions those name, in list order. Entries follow the tree's row order,
 * then step order, then key, so a re-import's fresh ids leave the order alone.
 *
 * @throws when a figure names a definition, row or step the trusted reads do
 * not hold: reads that disagree.
 */
function documentMeasures(
  tree: WorkItemTree & { steps: PlanDocument['steps'] },
  reads: MeasureReads,
): DocumentMeasures | null {
  const definitions = new Map(
    definitionsOrUnowned(reads.definitions).map((each) => [each.key, each] as const),
  );
  const rowAt = new Map(tree.workItems.map(({ id }, at) => [id, at] as const));
  const stepAt = new Map(orderSteps(tree.steps).map(({ id }, at) => [id, at] as const));
  const named = new Set<string>();
  const place = (workItemId: string, stepId: string | null, key: string): void => {
    if (!definitions.has(key)) throw new Error(`a stored figure names undefined measure "${key}"`);
    if (!rowAt.has(workItemId))
      throw new Error(`a stored figure names work item "${workItemId}" the tree does not hold`);
    if (stepId !== null && !stepAt.has(stepId))
      throw new Error(`a stored figure names step "${stepId}" the tree does not hold`);
    named.add(key);
  };
  const byPlace = <T extends { workItemId: string; measure: string; stepId?: string }>(
    left: T,
    right: T,
  ): number =>
    (rowAt.get(left.workItemId) ?? 0) - (rowAt.get(right.workItemId) ?? 0) ||
    (left.stepId === undefined ? 0 : (stepAt.get(left.stepId) ?? 0)) -
      (right.stepId === undefined ? 0 : (stepAt.get(right.stepId) ?? 0)) ||
    left.measure.localeCompare(right.measure);
  // Proof: with the legacy names kept here, `exports version 11 with every
  // measure the plan holds` (plan-document.resource.test.ts) carried
  // `hours_actual` twice, in the row and in `measureFacts`; watched 2026-10-23.
  const facts = reads.facts
    .filter(({ metric }) => !isLegacyMetric(metric))
    .map(({ workItemId, stepId, metric, value, basis }) => {
      place(workItemId, stepId, metric);
      return { workItemId, stepId, measure: metric, value, basis: basis ?? null };
    })
    .sort(byPlace);
  // Proof: with single-point trios kept, the same case carried the legacy
  // token estimate twice; watched 2026-10-23.
  const estimates = reads.estimates
    .filter(({ singlePoint }) => !singlePoint)
    .map(({ workItemId, stepId, key, optimistic, realistic, pessimistic, basis }) => {
      place(workItemId, stepId, key);
      return {
        workItemId,
        stepId,
        measure: key,
        optimistic,
        realistic,
        pessimistic,
        basis: basis ?? null,
      };
    })
    .sort(byPlace);
  const budgets = reads.budgets
    .map(({ workItemId, key, cap, policy, holdPerAttempt }) => {
      place(workItemId, null, key);
      return { workItemId, measure: key, cap, policy, holdPerAttempt };
    })
    .sort(byPlace);
  if (named.size === 0) return null;
  return {
    definitions: [...definitions.values()]
      .filter(({ key }) => named.has(key))
      .sort((left, right) => left.order - right.order || left.key.localeCompare(right.key))
      .map(({ id: _id, ...fields }) => fields),
    facts,
    estimates,
    budgets,
  };
}

/**
 * A person as the plan document carries them: never `accountId`. Which account
 * may act as a person is this deployment's fact about its accounts, not part
 * of the plan, and an import elsewhere has no such account (`wbs-team-claims`
 * spec `fleet-credentials`).
 */
function exportedPerson({ id, name, kind, teamIds }: PersonWithTeams) {
  return { id, name, kind, teamIds };
}

/**
 * The project's demands as the document writes them, by work item then
 * resource.
 *
 * @throws on a demand naming a work item the tree does not hold: trusted reads
 * that disagree.
 */
function documentDemands(
  tree: WorkItemTree,
  demands: readonly { workItemId: string; resourceId: string; units: number }[],
): PlanDocument['demands'] {
  const rows = new Set(tree.workItems.map(({ id }) => id));
  return [...demands]
    .map(({ workItemId, resourceId, units }) => {
      if (!rows.has(workItemId))
        throw new Error(`demand names work item "${workItemId}" the tree does not hold`);
      return { workItemId, resourceId, units };
    })
    .sort(
      (left, right) =>
        left.workItemId.localeCompare(right.workItemId) ||
        left.resourceId.localeCompare(right.resourceId),
    );
}

/**
 * The resources the document's capacities and demands name, and no other,
 * as every other catalog's closure is.
 *
 * Proof: returning the unfiltered list made `exports only the resources its
 * capacities and demands name (wbs-resources)` (plan-document.resource.test.ts)
 * carry the unused resource, and every zero-fact export carry all three; watched
 * 2026-10-20.
 *
 * @throws when a capacity or demand names a resource the directory read lacks.
 */
function referencedResources(
  read: PlanDocumentReads['resources'],
): PlanDocument['directory']['resources'] {
  const named = new Set([
    ...read.capacities.map(({ resourceId }) => resourceId),
    ...read.demands.map(({ resourceId }) => resourceId),
  ]);
  return requireRows('resource', named, [...read.resources]).map(
    ({ id, name, kind, unitLabel }) => ({ id, name, kind, unitLabel }),
  );
}

/**
 * The read's rows as the document writes them: the derived spans dropped, and
 * a leaf's attempts keyed by step code, instants as ISO strings and each
 * executor by the name the document's directory gives them.
 *
 * Proof: the executors left out of the closure made the mounted export in
 * `round-trips a Kyiv project whose 010.dev holds attempts…` answer 500 on
 * `attempt executor "pe-ana" is not in the directory`; watched 2026-10-12.
 *
 * @throws on an attempt at a step the tree lacks, or by an executor the
 * closure does not name: both are trusted reads that disagree.
 */
function documentWorkItems(
  tree: WorkItemTree & { steps: PlanDocument['steps'] },
  people: readonly { id: string; name: string }[],
): PlanDocument['workItems'] {
  const codeOf = new Map(tree.steps.map(({ id, code }) => [id, code] as const));
  const nameOf = new Map(people.map(({ id, name }) => [id, name] as const));
  // Proof: retaining either alias failed the direct-fact and derived-cause export tests (2026-10-14).
  return tree.workItems.map(
    ({
      attempts,
      spans: _spans,
      span: _span,
      blockages: _blockages,
      blockageCauses: _blockageCauses,
      // Proof: retaining this field leaked derived resources in both mounted
      // mode exports; their omission assertions failed, watched 2026-10-15.
      nodeResources: _nodeResources,
      // Readings, not records (`wbs-measure-budgets` design D54): expected
      // measures, remaining budgets and bases are computed again from what
      // version 11 carries in its own lists.
      // Proof: with these four kept, `leaves the row's measure readings out of
      // the document` (plan-document.resource.test.ts) exported `budgets` and
      // `measureEstimates` on the row; watched 2026-10-23.
      measureEstimates: _measureEstimates,
      budgets: _budgets,
      mixedRateCards: _mixedRateCards,
      moneyBases: _moneyBases,
      ...held
    }) => {
      // The row keeps the legacy metrics only (`wbs-measure-budgets` D18,
      // design D53): a fact in a defined measure travels in `measureFacts`
      // with its basis, and the derived `agent_minutes` comes back from the
      // attempts the row carries.
      // Proof: with every metric kept, `exports legacy metrics only, leaving
      // defined and derived measures out` (plan-document.resource.test.ts)
      // exported `cost` and `agent_minutes` (78 pass, 1 fail); watched 2026-10-23.
      // Spread first so `measures` keeps its place in the canonical bytes.
      const row = {
        ...held,
        measures: Object.fromEntries(
          Object.entries(held.measures).filter(([metric]) => isLegacyMetric(metric)),
        ),
      };
      if (attempts === undefined) return row;
      const byCode: Record<string, DocumentAttempt[]> = {};
      for (const [stepId, held] of Object.entries(attempts)) {
        const code = codeOf.get(stepId);
        // `codedTree` has refused an uncoded step before this runs.
        if (code === undefined || code === null)
          throw new Error(`attempt at step "${stepId}" the coded tree lacks`);
        byCode[code] = held.map((attempt) => {
          const executor =
            attempt.executorPersonId === null ? null : nameOf.get(attempt.executorPersonId);
          if (executor === undefined)
            throw new Error(
              `attempt executor "${String(attempt.executorPersonId)}" is not in the directory`,
            );
          return {
            number: attempt.attemptNumber,
            startedAt: new Date(attempt.startedAt).toISOString(),
            endedAt: attempt.endedAt === null ? null : new Date(attempt.endedAt).toISOString(),
            outcome: attempt.outcome,
            executor,
            reference: attempt.reference,
            note: attempt.note,
          };
        });
      }
      return { ...row, attempts: byCode };
    },
  );
}

/** Detaches direct facts and refuses inconsistent trusted leaf projections. */
function documentBlockages(tree: WorkItemTree): PlanDocument['stepBlockages'] {
  const parents = new Set(tree.workItems.map(({ parentId }) => parentId));
  const steps = new Set(tree.steps.map(({ id }) => id));
  const facts: PlanDocument['stepBlockages'] = [];
  for (const row of tree.workItems) {
    if (row.blockages === undefined) {
      // Proof: bypassing missing-map refusal made `v9 trusted export refuses absent leaf map` resolve (2026-10-14).
      if (!parents.has(row.id)) throw new Error(`leaf ${row.id} was read without blockages`);
      continue;
    }
    const held: unknown = Reflect.get(row, 'blockages');
    // Proof: an injected empty array was silently exported before this guard; the malformed-leaf-map test failed (2026-10-14).
    if (typeof held !== 'object' || held === null || Array.isArray(held))
      throw new Error(`leaf ${row.id} has malformed blockages`);
    for (const [stepId, fact] of Object.entries(row.blockages)) {
      // Proof: bypassing owner refusal made `v9 trusted export refuses parent owner` resolve (2026-10-14).
      if (parents.has(row.id)) throw new Error(`parent ${row.id} holds a step blockage`);
      // Proof: bypassing reference refusal made `v9 trusted export refuses unknown step` resolve (2026-10-14).
      if (!steps.has(stepId)) throw new Error(`blockage at unknown step ${stepId}`);
      // Proof: bypassing time refusal made `v9 trusted export refuses unsafe time` resolve (2026-10-14).
      if (!Number.isSafeInteger(fact.blockedAt))
        throw new Error(`blockage at ${row.id}/${stepId} has an invalid time`);
      facts.push({ workItemId: row.id, stepId, blockedAt: fact.blockedAt });
    }
  }
  return facts.sort(
    (left, right) =>
      left.workItemId.localeCompare(right.workItemId) || left.stepId.localeCompare(right.stepId),
  );
}

/**
 * Every leaf's step nodes in tree and step order, each with its reference —
 * the same nodes and spellings the work-item read answers, for a fully coded
 * tree.
 */
function spellStepNodes(tree: {
  workItems: readonly { id: string; parentId: string | null; number: string }[];
  steps: PlanDocument['steps'];
}): PlanDocument['stepNodes'] {
  const parentIds = new Set(tree.workItems.map(({ parentId }) => parentId));
  const ordered = orderSteps(tree.steps);
  return tree.workItems.flatMap(({ id: workItemId, number }) =>
    // Proof: with the leaf filter removed, `spells each leaf's step nodes
    // beside their IDs` received the parent's nodes too (2026-09-27).
    parentIds.has(workItemId)
      ? []
      : ordered.map(({ id: stepId, code }, stepAt) => ({
          id: formatStepNodeId({ workItemId, stepId }),
          workItemId,
          stepId,
          reference: formatStepReference(number, code, stepAt + 1, ordered.length),
        })),
  );
}

/**
 * Projects an archival payload to writable fields at its version. Header
 * validation runs first so an unsupported version is never interpreted as a
 * supported one.
 *
 * Version 1 is the explicit legacy conversion: it has no step allowances, so
 * every step is imported at 0% and a version-1 file that names one is refused
 * rather than half-read. Versions 2 and 3 require an allowance on every step;
 * its range is checked with the rest of the document by `prepareImport`.
 *
 * Versions 1 and 2 keep no step code: whatever a file holds under `code` is
 * ignored exactly as before codes existed (a version-2 export wrote the read's
 * `code: null`), and each step is imported with `code: null`, which
 * `prepareImport` codes by suggestion. Version 3 requires a string code on
 * every step; its grammar, reservation and uniqueness are checked by
 * `prepareImport`. Versions 1–3 ignore typed relationships, retaining their
 * legacy link semantics; version 4 requires an FS-only typed list, while
 * version 5 accepts FS, SS and FF.
 */
export async function classifyPlanDocument(input: unknown): Promise<PlanDocumentClassification> {
  const header = await validateSchema(planDocumentHeaderRequest, input);
  if (header.issues !== undefined) {
    return { ok: false, code: 'invalid_body', path: pathOf(header.issues[0]?.path) };
  }
  const version = header.value.document.version;
  // Proof: moving this after version validation made the mounted future-file
  // response invalid_body/workItems[3].priority instead of
  // unsupported_version/document.version.
  if (
    version !== 1 &&
    version !== 2 &&
    version !== 3 &&
    version !== 4 &&
    version !== 5 &&
    version !== 6 &&
    version !== 7 &&
    version !== 8 &&
    version !== 9 &&
    version !== 10 &&
    version !== PLAN_DOCUMENT_VERSION
  ) {
    return { ok: false, code: 'unsupported_version', path: 'document.version' };
  }
  const checked = await validateSchema(planDocumentRequest, input);
  if (checked.issues !== undefined) {
    return { ok: false, code: 'invalid_body', path: pathOf(checked.issues[0]?.path) };
  }
  const blockages = checked.value.stepBlockages;
  const stepBlockages: PlanDocumentImport['stepBlockages'] = [];
  if (version < 9) {
    // Proof: bypassing legacy refusal failed `v9 requires facts and legacy files refuse facts` (2026-10-14).
    if (blockages !== undefined && (!Array.isArray(blockages) || blockages.length > 0))
      return {
        ok: false,
        code: 'invalid_body',
        path: Array.isArray(blockages) ? 'stepBlockages[0]' : 'stepBlockages',
      };
  } else {
    // Proof: bypassing required-list refusal failed `v9 requires facts` with an unexpected TypeError (2026-10-14).
    if (!Array.isArray(blockages))
      return { ok: false, code: 'invalid_body', path: 'stepBlockages' };
    for (const [at, fact] of blockages.entries()) {
      const prefix = `stepBlockages[${String(at)}]`;
      // Proof: bypassing object refusal failed malformed-facts null entry with an unexpected TypeError (2026-10-14).
      if (typeof fact !== 'object' || fact === null || Array.isArray(fact))
        return { ok: false, code: 'invalid_body', path: prefix };
      const workItemId: unknown = Reflect.get(fact, 'workItemId');
      const stepId: unknown = Reflect.get(fact, 'stepId');
      const blockedAt: unknown = Reflect.get(fact, 'blockedAt');
      // Proof: bypassing owner type refusal admitted numeric owner in `v9 classifies malformed facts` (2026-10-14).
      if (typeof workItemId !== 'string')
        return { ok: false, code: 'invalid_body', path: `${prefix}.workItemId` };
      // Proof: bypassing step type refusal admitted numeric step in `v9 classifies malformed facts` (2026-10-14).
      if (typeof stepId !== 'string')
        return { ok: false, code: 'invalid_body', path: `${prefix}.stepId` };
      // Proof: bypassing time refusal admitted fractional and unsafe times in malformed-facts tests (2026-10-14).
      if (typeof blockedAt !== 'number' || !Number.isSafeInteger(blockedAt))
        return { ok: false, code: 'invalid_body', path: `${prefix}.blockedAt` };
      stepBlockages.push({ workItemId, stepId, blockedAt });
    }
  }
  const resourceFacts = resourceFactsOf(version, checked.value);
  if (!resourceFacts.ok) return resourceFacts;
  const measured = measuresOf(version, checked.value);
  if (!measured.ok) return measured;
  for (const [at, row] of checked.value.workItems.entries()) {
    // Proof: bypassing row alias refusal failed `legacy row blockage aliases are refused` (2026-10-14).
    if (
      row.blockages !== undefined &&
      (typeof row.blockages !== 'object' ||
        row.blockages === null ||
        Array.isArray(row.blockages) ||
        Object.keys(row.blockages).length > 0)
    )
      return { ok: false, code: 'invalid_body', path: `workItems[${String(at)}].blockages` };
  }
  const typedDependencies: PlanDocumentImport['typedDependencies'] = [];
  if (version >= 4) {
    // Proof (2026-09-28): removing this check made a missing version-4 list
    // throw from .entries instead of returning invalid_typed_dependency.
    if (!Array.isArray(checked.value.typedDependencies))
      return { ok: false, code: 'invalid_typed_dependency', path: 'typedDependencies' };
    for (const [at, entry] of checked.value.typedDependencies.entries()) {
      if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
        for (const side of ['predecessor', 'successor'] as const) {
          const endpoint: unknown = Reflect.get(entry, side);
          if (typeof endpoint !== 'object' || endpoint === null || Array.isArray(endpoint))
            continue;
          const scope: unknown = Reflect.get(endpoint, 'scope');
          // Proof (2026-09-28): without this scope check, the mounted import
          // returned predecessor.step for an unknown scope instead of .scope.
          if (scope !== 'whole' && scope !== 'node' && scope !== 'descendant-step')
            return {
              ok: false,
              code: 'invalid_typed_dependency',
              path: `typedDependencies[${String(at)}].${side}.scope`,
            };
        }
      }
      // Proof: selecting the v5 schema for v4 made the explicit legacy
      // conversion accept SS in "version 5 classifies SS and FF while version 4
      // keeps its FS-only conversion" (2026-09-28).
      const parsed = await validateSchema(
        version === 4 ? documentV4TypedDependencyRequest : documentTypedDependencyRequest,
        entry,
      );
      // Proof (2026-09-28): bypassing schema refusal made the unknown-type
      // memory import throw on an undefined relationship in preparation.
      if (parsed.issues !== undefined)
        return {
          ok: false,
          code: 'invalid_typed_dependency',
          path: `typedDependencies[${String(at)}]${pathOf(parsed.issues[0]?.path) === 'body' ? '' : `.${pathOf(parsed.issues[0]?.path)}`}`,
        };
      typedDependencies.push(parsed.value);
    }
  }
  const steps: PlanDocumentImport['steps'] = [];
  for (const [at, { code, estimateUnit: writtenUnit, ...step }] of checked.value.steps.entries()) {
    // Proof: skipping this guard imported a missing unit with 201 instead of 400 (composed minute import test).
    if (version >= 8 && !isEstimateUnit(writtenUnit))
      return { ok: false, code: 'invalid_body', path: `steps[${String(at)}].estimateUnit` };
    const estimateUnit = version >= 8 && isEstimateUnit(writtenUnit) ? writtenUnit : 'workdays';
    const path = `steps[${String(at)}].allowancePercent`;
    if (version === 1) {
      // Proof: with this refusal removed, `refuses a version-1 file that names
      // a step allowance` imported it at 0% (2026-09-27).
      if (step.allowancePercent !== undefined) return { ok: false, code: 'invalid_body', path };
      steps.push({ ...step, estimateUnit, allowancePercent: NO_ALLOWANCE, code: null });
      continue;
    }
    // Proof: with this refusal removed, `refuses a current-format file whose
    // step has no allowance` imported it (2026-09-27).
    if (step.allowancePercent === undefined) return { ok: false, code: 'invalid_body', path };
    if (version === 2) {
      steps.push({ ...step, estimateUnit, allowancePercent: step.allowancePercent, code: null });
      continue;
    }
    // Proof: with this refusal removed, `refuses a version-3 file whose step
    // has no string code` received ok: true (2026-09-27).
    if (typeof code !== 'string')
      return { ok: false, code: 'invalid_body', path: `steps[${String(at)}].code` };
    steps.push({ ...step, estimateUnit, allowancePercent: step.allowancePercent, code });
  }
  const { timezone: written, budgetFactor: _factor, ...settings } = checked.value.settings;
  let timezone = 'UTC';
  if (version >= 7) {
    // Proof: this refusal removed made the unknown-zone case of `refuses an
    // unknown zone, an unknown outcome, …` (`step-node-attempt.controller.db`)
    // answer 201, importing `Kyiv` as a project's zone; watched 2026-10-12.
    if (!isTimezone(written)) return { ok: false, code: 'invalid_body', path: 'settings.timezone' };
    timezone = written;
  }
  const statused = statusFactsOf(
    version,
    checked.value.workItems.map(({ blockages: _blockages, ...row }) => row),
  );
  if (!Array.isArray(statused)) return statused;
  const workItems = attemptsOf(version, statused, steps);
  if (!Array.isArray(workItems)) return workItems;
  return {
    ok: true,
    value: {
      ...checked.value,
      directory: { ...checked.value.directory, resources: resourceFacts.resources },
      resourceCapacities: resourceFacts.resourceCapacities,
      demands: resourceFacts.demands,
      measureDefinitions: measured.definitions,
      measureFacts: measured.facts,
      measureEstimates: measured.estimates,
      budgets: measured.budgets,
      settings: { ...settings, timezone, budgetFactor: measured.budgetFactor },
      steps,
      typedDependencies,
      stepBlockages,
      workItems,
    },
  };
}

/**
 * The resources, capacities and demands a file states (`wbs-resources`): from
 * version 10 all three lists are required and every entry well formed — units
 * whole numbers, a capacity from 0 and a demand from 1, both at most
 * {@link MOST_RESOURCE_UNITS}; before version 10 a file carries none, and one
 * that names any is refused rather than half-read. References between them and
 * to the file's rows are `prepareImport`'s to check.
 *
 * Proof: with the version-10 shape checks bypassed, `refuses a version-10 file
 * with a malformed resource, capacity or demand` (plan-document.resource.test.ts)
 * classified a demand of 0 units ok; with the legacy refusal bypassed, `refuses
 * resources in a file older than version 10` classified a v9 file naming a
 * resource ok; both watched 2026-10-20.
 */
function resourceFactsOf(
  version: number,
  document: PlanDocumentRequest,
):
  | {
      ok: true;
      resources: DocumentResource[];
      resourceCapacities: DocumentResourceCapacity[];
      demands: DocumentDemand[];
    }
  | Extract<PlanDocumentClassification, { ok: false }> {
  const listed = {
    'directory.resources': document.directory.resources,
    resourceCapacities: document.resourceCapacities,
    demands: document.demands,
  };
  if (version < 10) {
    for (const [path, held] of Object.entries(listed))
      if (held !== undefined && (!Array.isArray(held) || held.length > 0))
        return { ok: false, code: 'invalid_body', path };
    return { ok: true, resources: [], resourceCapacities: [], demands: [] };
  }
  const resources: DocumentResource[] = [];
  const resourceCapacities: DocumentResourceCapacity[] = [];
  const demands: DocumentDemand[] = [];
  const parse = <T>(
    path: string,
    held: unknown,
    check: (entry: unknown) => T | null,
    into: T[],
  ): Extract<PlanDocumentClassification, { ok: false }> | null => {
    if (!Array.isArray(held)) return { ok: false, code: 'invalid_body', path };
    for (const [at, entry] of held.entries()) {
      const parsed = check(entry);
      if (parsed === null)
        return { ok: false, code: 'invalid_body', path: `${path}[${String(at)}]` };
      into.push(parsed);
    }
    return null;
  };
  const units = (value: unknown, floor: number): value is number =>
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= floor &&
    value <= MOST_RESOURCE_UNITS;
  const refused =
    parse(
      'directory.resources',
      listed['directory.resources'],
      (entry) => {
        const parsed = documentResource(entry);
        return parsed instanceof type.errors ? null : parsed;
      },
      resources,
    ) ??
    parse(
      'resourceCapacities',
      listed.resourceCapacities,
      (entry) => {
        const parsed = documentResourceCapacity(entry);
        return parsed instanceof type.errors || !units(parsed.units, 0) ? null : parsed;
      },
      resourceCapacities,
    ) ??
    parse(
      'demands',
      listed.demands,
      (entry) => {
        const parsed = documentDemand(entry);
        return parsed instanceof type.errors || !units(parsed.units, 1) ? null : parsed;
      },
      demands,
    );
  if (refused !== null) return refused;
  return { ok: true, resources, resourceCapacities, demands };
}

/**
 * The measures a file states (`wbs-measure-budgets` design D53): from version
 * 11 the four lists are required, every entry well formed and every figure a
 * finite number, and the budget factor one a project may hold; before version
 * 11 a file states none of them and reads with a factor of 1, and one that
 * names any (or a factor other than 1) is refused rather than half-read. What the entries name, and
 * whether the measures they name allow them, is `prepareImport`'s to check.
 *
 * Proof: with the version-11 shape checks bypassed, `refuses a version-11 file
 * with a malformed measure entry or factor` (plan-document.resource.test.ts)
 * classified a factor of 0 ok; with the legacy refusal bypassed, `refuses
 * measures in a file older than version 11` classified a v10 file naming a
 * budget ok; both watched 2026-10-23.
 */
function measuresOf(
  version: number,
  document: PlanDocumentRequest,
):
  | (DocumentMeasures & { ok: true; budgetFactor: number })
  | Extract<PlanDocumentClassification, { ok: false }> {
  const listed = {
    measureDefinitions: document.measureDefinitions,
    measureFacts: document.measureFacts,
    measureEstimates: document.measureEstimates,
    budgets: document.budgets,
  };
  const factor = document.settings.budgetFactor;
  if (version < PLAN_DOCUMENT_VERSION) {
    for (const [path, held] of Object.entries(listed))
      if (held !== undefined && (!Array.isArray(held) || held.length > 0))
        return { ok: false, code: 'invalid_body', path };
    // A factor of 1 is what an earlier version reads as, so naming it loses nothing.
    if (factor !== undefined && factor !== 1)
      return { ok: false, code: 'invalid_body', path: 'settings.budgetFactor' };
    return { ok: true, definitions: [], facts: [], estimates: [], budgets: [], budgetFactor: 1 };
  }
  if (typeof factor !== 'number' || !isBudgetFactor(factor))
    return { ok: false, code: 'invalid_body', path: 'settings.budgetFactor' };
  const finite = (...values: unknown[]): boolean =>
    values.every((value) => typeof value === 'number' && Number.isFinite(value));
  const parse = <T>(
    path: string,
    held: unknown,
    check: (entry: unknown) => T | null,
  ): T[] | Extract<PlanDocumentClassification, { ok: false }> => {
    if (!Array.isArray(held)) return { ok: false, code: 'invalid_body', path };
    const parsed: T[] = [];
    for (const [at, entry] of held.entries()) {
      const one = check(entry);
      if (one === null) return { ok: false, code: 'invalid_body', path: `${path}[${String(at)}]` };
      parsed.push(one);
    }
    return parsed;
  };
  const definitions = parse('measureDefinitions', listed.measureDefinitions, (entry) => {
    const parsed = documentMeasureDefinition(entry);
    return parsed instanceof type.errors || !finite(parsed.order) ? null : parsed;
  });
  if (!Array.isArray(definitions)) return definitions;
  const facts = parse('measureFacts', listed.measureFacts, (entry) => {
    const parsed = documentMeasureFact(entry);
    return parsed instanceof type.errors || !finite(parsed.value) ? null : parsed;
  });
  if (!Array.isArray(facts)) return facts;
  const estimates = parse('measureEstimates', listed.measureEstimates, (entry) => {
    const parsed = documentMeasureEstimate(entry);
    return parsed instanceof type.errors ||
      !finite(parsed.optimistic, parsed.realistic, parsed.pessimistic)
      ? null
      : parsed;
  });
  if (!Array.isArray(estimates)) return estimates;
  const budgets = parse('budgets', listed.budgets, (entry) => {
    const parsed = documentBudget(entry);
    return parsed instanceof type.errors ||
      !finite(parsed.cap, ...(parsed.holdPerAttempt === null ? [] : [parsed.holdPerAttempt]))
      ? null
      : parsed;
  });
  if (!Array.isArray(budgets)) return budgets;
  return { ok: true, definitions, facts, estimates, budgets, budgetFactor: factor };
}

type ClassifiedRow = Omit<PlanDocumentImport['workItems'][number], 'attempts'> & {
  attempts?: unknown;
};

/**
 * Each leaf's attempts as a version-7 file states them, keyed by step code,
 * checked as the store's own constraints would check them so a refused file
 * never reaches a write: a known outcome exactly when there is an end, an end
 * never before its start, numbers from 1 and distinct per node, at most one
 * running per node and that one the node's highest. A parent holds none.
 * Before version 7 every row reads as holding none (`step-node-attempts` D5).
 *
 * Instants are ISO-8601 UTC strings exactly as `toISOString` writes them, so
 * a file can never smuggle a local time read in this process's zone.
 */
function attemptsOf(
  version: number,
  rows: readonly ClassifiedRow[],
  steps: PlanDocumentImport['steps'],
): PlanDocumentImport['workItems'] | Extract<PlanDocumentClassification, { ok: false }> {
  if (version < 7) return rows.map(({ attempts: _attempts, ...row }) => ({ ...row, attempts: [] }));
  const stepIdOf = new Map(
    steps.flatMap(({ id, code }) => (code === null ? [] : [[code, id] as const])),
  );
  const parents = new Set(rows.map((row) => row.parentId));
  const imported: PlanDocumentImport['workItems'] = [];
  for (const [at, { attempts: held, ...row }] of rows.entries()) {
    const refused = (field: string): Extract<PlanDocumentClassification, { ok: false }> => ({
      ok: false,
      code: 'invalid_body',
      path: `workItems[${String(at)}].attempts${field}`,
    });
    if (held === undefined) {
      imported.push({ ...row, attempts: [] });
      continue;
    }
    if (typeof held !== 'object' || held === null || Array.isArray(held)) return refused('');
    const attempts: ImportedAttempt[] = [];
    for (const [code, listed] of Object.entries(held)) {
      const stepId = stepIdOf.get(code);
      if (stepId === undefined || parents.has(row.id) || !Array.isArray(listed))
        return refused(`.${code}`);
      const atNode: ImportedAttempt[] = [];
      for (const [index, entry] of listed.entries()) {
        const path = (field: string) => refused(`.${code}[${String(index)}]${field}`);
        const parsed = documentAttempt(entry);
        if (parsed instanceof type.errors) return path('');
        const startedAt = instantOf(parsed.startedAt);
        if (startedAt === null) return path('.startedAt');
        const endedAt = parsed.endedAt === null ? null : instantOf(parsed.endedAt);
        if (parsed.endedAt !== null && endedAt === null) return path('.endedAt');
        if (!Number.isSafeInteger(parsed.number) || parsed.number < 1) return path('.number');
        if (atNode.some((other) => other.attemptNumber === parsed.number)) return path('.number');
        if ((endedAt === null) !== (parsed.outcome === null)) return path('.outcome');
        // Proof: this refusal removed made the end-before-start case answer
        // 500 (`attempt 1 ends before it starts` from `attemptOf` mid-import)
        // instead of 400; watched 2026-10-12.
        if (endedAt !== null && endedAt < startedAt) return path('.endedAt');
        atNode.push({
          stepId,
          attemptNumber: parsed.number,
          startedAt,
          endedAt,
          outcome: parsed.outcome,
          executor: parsed.executor,
          reference: parsed.reference,
          note: parsed.note,
        });
      }
      const running = atNode.filter((attempt) => attempt.endedAt === null);
      // Proof: this refusal removed alone still answered 400 at the same path,
      // the highest-number refusal below catching the lower running attempt;
      // with both removed the two-running case answered 500 (`UNIQUE
      // constraint failed: step_node_attempt.work_item_id`, the partial
      // index); watched 2026-10-12.
      if (running.length > 1) return refused(`.${code}`);
      const highest = Math.max(...atNode.map((attempt) => attempt.attemptNumber));
      // Proof: this refusal removed made the not-the-highest case answer 201,
      // importing a running attempt 2 beneath an ended attempt 3; watched
      // 2026-10-12.
      if (running.some((attempt) => attempt.attemptNumber !== highest)) return refused(`.${code}`);
      attempts.push(...atNode.sort((left, right) => left.attemptNumber - right.attemptNumber));
    }
    imported.push({ ...row, attempts });
  }
  return imported;
}

/** Epoch milliseconds of an ISO-8601 UTC instant as `toISOString` writes one, else null. */
function instantOf(written: string): number | null {
  const parsed = Date.parse(written);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== written) return null;
  return parsed;
}

/**
 * Each row's readiness and hold as the file states them: from version 6 every
 * row names both, each null or a member of its vocabulary and never on a
 * parent; before version 6 both read as nothing said (`add-work-item-statuses`).
 *
 * A hold on a row whose work is done is accepted: marking progress never
 * clears a hold, the status read folds done over it, and the file carries what
 * the store holds, so refusing it would refuse the plan's own export.
 *
 * Proof: the vocabulary check removed made `refuses a version-6 hold or
 * readiness outside its vocabulary…` accept `hold: 'paused'`; the parent check
 * removed accepted a hold on the parent; watched 2026-09-29. A hold refused on
 * done work made `re-imports its own export of a leaf held and then marked
 * done` fail on `Expected: true, Received: false`; watched 2026-09-29 (Fable
 * review of #225).
 */
function statusFactsOf(
  version: number,
  rows: PlanDocumentRequest['workItems'],
): ClassifiedRow[] | Extract<PlanDocumentClassification, { ok: false }> {
  if (version < 6) return rows.map((row) => ({ ...row, readiness: null, hold: null }));
  const parents = new Set(rows.map((row) => row.parentId));
  const imported: ClassifiedRow[] = [];
  for (const [at, row] of rows.entries()) {
    const path = (field: string) => `workItems[${String(at)}].${field}`;
    const readiness =
      row.readiness === null ? null : isReadiness(row.readiness) ? row.readiness : undefined;
    if (readiness === undefined) {
      return { ok: false, code: 'invalid_body', path: path('readiness') };
    }
    const hold = row.hold === null ? null : isHold(row.hold) ? row.hold : undefined;
    if (hold === undefined) return { ok: false, code: 'invalid_body', path: path('hold') };
    if (parents.has(row.id) && (readiness !== null || hold !== null)) {
      return { ok: false, code: 'invalid_body', path: path(hold === null ? 'readiness' : 'hold') };
    }
    imported.push({ ...row, readiness, hold });
  }
  return imported;
}

function pathOf(path: readonly (PropertyKey | { key: PropertyKey })[] | undefined): string {
  if (path === undefined || path.length === 0) return 'body';
  let written = '';
  for (const segment of path) {
    const key = typeof segment === 'object' ? segment.key : segment;
    if (typeof key === 'number') {
      written += `[${String(key)}]`;
      continue;
    }
    const name = String(key);
    written += written.length === 0 ? name : `.${name}`;
  }
  return written;
}

interface CompleteDirectory {
  teams: TeamWithServices[];
  people: PersonWithTeams[];
  tags: Tag[];
  services: Service[];
  types: WorkItemType[];
  externalSystems: ExternalSystem[];
}

function indexed<T extends { id: string }>(kind: string, rows: readonly T[]): Map<string, T> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  if (byId.size !== rows.length) throw new Error(`directory has duplicate ${kind} ids`);
  return byId;
}

function requireRows<T extends { id: string }>(
  kind: string,
  ids: ReadonlySet<string>,
  rows: readonly T[],
): T[] {
  const byId = indexed(kind, rows);
  // Proof: skipping this guard made the mounted missing-tag export return 200
  // instead of 500 while its work item still named tag "tag-used".
  for (const id of ids) {
    if (!byId.has(id)) throw new Error(`${kind} "${id}" is missing from the directory`);
  }
  return rows.filter((row) => ids.has(row.id));
}

/** Computes the minimal directory graph needed to resolve every exported id. */
function referencedDirectory(tree: WorkItemTree, complete: CompleteDirectory): CompleteDirectory {
  // Proof: starting this set empty made the mounted closure test omit its exact
  // Capacity only team while the capacity entry itself remained present.
  const teamIds = new Set(tree.teamCapacities.map(({ serviceTeamId }) => serviceTeamId));
  const personIds = new Set<string>();
  const tagIds = new Set<string>();
  const serviceIds = new Set<string>();
  const typeIds = new Set<string>();
  const externalSystemIds = new Set<string>();
  for (const row of tree.workItems) {
    if (row.serviceTeamId !== null) teamIds.add(row.serviceTeamId);
    for (const id of row.teamIds) teamIds.add(id);
    if (row.serviceId !== null) serviceIds.add(row.serviceId);
    for (const id of row.serviceIds) serviceIds.add(id);
    for (const id of row.tagIds) tagIds.add(id);
    for (const id of row.typeIds) typeIds.add(id);
    for (const id of Object.values(row.assignees)) personIds.add(id);
    for (const reference of row.externalRefs) externalSystemIds.add(reference.systemId);
    // An attempt's executor is written by name, so the closure must name them.
    for (const attempts of Object.values(row.attempts ?? {}))
      for (const { executorPersonId } of attempts)
        if (executorPersonId !== null) personIds.add(executorPersonId);
  }

  const people = requireRows('person', personIds, complete.people);
  // Proof: skipping memberships made the mounted closure test omit Billing
  // and its owned-service id while still exporting assigned Kat.
  for (const person of people) for (const teamId of person.teamIds) teamIds.add(teamId);
  const teams = requireRows('team', teamIds, complete.teams);
  // Proof: skipping ownership traversal made the mounted closure test return
  // services:[] instead of Billing API's exact id and name.
  for (const team of teams) for (const serviceId of team.serviceIds) serviceIds.add(serviceId);

  return {
    teams,
    people,
    // Proof: returning the unfiltered list made the mounted closure test add
    // Unrelated tag beside Release, including its exact unwanted id/name.
    tags: requireRows('tag', tagIds, complete.tags),
    services: requireRows('service', serviceIds, complete.services),
    types: requireRows('work item type', typeIds, complete.types),
    externalSystems: requireRows('external system', externalSystemIds, complete.externalSystems),
  };
}
