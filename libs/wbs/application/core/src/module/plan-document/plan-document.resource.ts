import {
  type DocumentAttempt,
  documentAttempt,
  type DocumentTypedDependency,
  documentTypedDependencyRequest,
  documentV4TypedDependencyRequest,
  type ImportedAttempt,
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
  formatStepNodeId,
  formatStepReference,
  isHold,
  isReadiness,
  isTimezone,
  NO_ALLOWANCE,
  orderSteps,
} from '@wbs/domain';
import { type } from '@wbs/validation';

import type { CalendarMarkerReader } from '../../ports/calendar-marker-read';
import type { Clock } from '../../ports/clock';
import type {
  DirectoryCatalog,
  DirectoryCatalogRows,
  DirectoryStore,
  PersonWithTeams,
  TeamWithServices,
} from '../../ports/directory-store';
import type { ResourceAccess } from '../../ports/organization-access';
import type { Project } from '../../ports/project-store';
import type { PlanDocumentReads } from '../../ports/shared-people-values';
import type { ExternalSystem, Service, Tag, WorkItemType } from '../../ports/work-item-store';

/**
 * The project an export writes: its settings and the zone its days are read
 * in, which the document carries as `settings.timezone` (`step-node-attempts` D5).
 */
export type ExportedProject = Project & { timezone: string };

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

type PlanDirectory = Pick<
  DirectoryStore,
  | 'listInOrganization'
  | 'listTeams'
  | 'listPeople'
  | 'listTags'
  | 'listServices'
  | 'listWorkItemTypes'
  | 'listExternalSystems'
>;

export interface PlanDocumentServiceOptions {
  directory: PlanDirectory;
  markers: CalendarMarkerReader;
  clock: Pick<Clock, 'now'>;
}

/** The be-01 command that codes every step an older writer left uncoded. */
const STEP_CODE_BACKFILL_COMMAND = 'bun run src/backfill-step-codes-cli.ts';

/**
 * A plan export: the document, or the modeled refusal of a project holding
 * uncoded steps, which names each one and the be-01 backfill `command` that
 * codes them, after which the export succeeds.
 */
export type PlanDocumentExport =
  | { ok: true; value: PlanDocument }
  | {
      ok: false;
      error: 'uncoded_steps';
      steps: { id: string; name: string }[];
      command: string;
    };

/**
 * Constructs the versioned archival document around the established project
 * tree projection.
 *
 * @throws when a file-local reference has no directory row. An unnamed default
 * would make the exported document impossible to restore faithfully.
 */
export class PlanDocumentService {
  constructor(private readonly options: PlanDocumentServiceOptions) {}

  /**
   * Exports `tree` as the current plan document, or refuses while any step is
   * uncoded (`code: null`, written mid-swap by an older be-01 and not yet
   * backfilled): the document carries every step's code and never invents one.
   *
   * Under scoped access the directory closure is read from the organization's
   * own catalogs, under their local names, so a person's teams and a team's
   * services that cross into another organization fail the export closed
   * rather than export a foreign entry; see {@link DirectoryStore.listInOrganization}.
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
    return {
      ok: true,
      value: buildDocument(
        project,
        coded.value,
        await this.readDocumentReads(project, access),
        this.options.clock.now(),
      ),
    };
  }

  /** Builds from detached export evidence and performs no store reads. */
  exportCaptured(
    project: ExportedProject,
    tree: WorkItemTree,
    reads: PlanDocumentReads,
  ): PlanDocumentExport {
    const coded = codedTree(tree);
    if (!coded.ok) return coded;
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
    const [teams, people, tags, services, types, externalSystems, markerRead] = await Promise.all([
      read('teams', () => directory.listTeams()),
      read('people', () => directory.listPeople()),
      read('tags', () => directory.listTags()),
      read('services', () => directory.listServices()),
      read('workItemTypes', () => directory.listWorkItemTypes()),
      read('externalSystems', () => directory.listExternalSystems()),
      this.options.markers.list(project.id),
    ]);
    if (!markerRead.ok) throw new Error(`project "${project.id}" disappeared during export`);
    return {
      directory: { teams, people, tags, services, types, externalSystems },
      markers: markerRead.value,
    };
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
    else coded.push({ ...step, code: step.code });
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
  return {
    project,
    ...tree,
    workItems: documentWorkItems(tree, closure.people),
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
      version: PLAN_DOCUMENT_VERSION,
      exportedAt: new Date(exportedAt).toISOString(),
    },
    settings: {
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
    },
    capacity: tree.teamCapacities.map(({ serviceTeamId, size }) => ({
      teamId: serviceTeamId,
      size,
    })),
    calendarMarkers: reads.markers.map(({ id, date, name, color }) => ({
      id,
      date,
      name,
      color,
    })),
    directory: closure,
  };
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
  return tree.workItems.map(({ attempts, spans: _spans, span: _span, ...row }) => {
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
  });
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

export type PlanDocumentClassification =
  | { ok: true; value: PlanDocumentImport }
  | {
      ok: false;
      code: 'invalid_body' | 'invalid_typed_dependency' | 'unsupported_version';
      path: string;
    };

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
    version !== PLAN_DOCUMENT_VERSION
  ) {
    return { ok: false, code: 'unsupported_version', path: 'document.version' };
  }
  const checked = await validateSchema(planDocumentRequest, input);
  if (checked.issues !== undefined) {
    return { ok: false, code: 'invalid_body', path: pathOf(checked.issues[0]?.path) };
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
  for (const [at, { code, ...step }] of checked.value.steps.entries()) {
    const path = `steps[${String(at)}].allowancePercent`;
    if (version === 1) {
      // Proof: with this refusal removed, `refuses a version-1 file that names
      // a step allowance` imported it at 0% (2026-09-27).
      if (step.allowancePercent !== undefined) return { ok: false, code: 'invalid_body', path };
      steps.push({ ...step, allowancePercent: NO_ALLOWANCE, code: null });
      continue;
    }
    // Proof: with this refusal removed, `refuses a current-format file whose
    // step has no allowance` imported it (2026-09-27).
    if (step.allowancePercent === undefined) return { ok: false, code: 'invalid_body', path };
    if (version === 2) {
      steps.push({ ...step, allowancePercent: step.allowancePercent, code: null });
      continue;
    }
    // Proof: with this refusal removed, `refuses a version-3 file whose step
    // has no string code` received ok: true (2026-09-27).
    if (typeof code !== 'string')
      return { ok: false, code: 'invalid_body', path: `steps[${String(at)}].code` };
    steps.push({ ...step, allowancePercent: step.allowancePercent, code });
  }
  const { timezone: written, ...settings } = checked.value.settings;
  let timezone = 'UTC';
  if (version >= 7) {
    // Proof: this refusal removed made the unknown-zone case of `refuses an
    // unknown zone, an unknown outcome, …` (`step-node-attempt.controller.db`)
    // answer 201, importing `Kyiv` as a project's zone; watched 2026-10-12.
    if (!isTimezone(written)) return { ok: false, code: 'invalid_body', path: 'settings.timezone' };
    timezone = written;
  }
  const statused = statusFactsOf(version, checked.value.workItems);
  if (!Array.isArray(statused)) return statused;
  const workItems = attemptsOf(version, statused, steps);
  if (!Array.isArray(workItems)) return workItems;
  return {
    ok: true,
    value: {
      ...checked.value,
      settings: { ...settings, timezone },
      steps,
      typedDependencies,
      workItems,
    },
  };
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
