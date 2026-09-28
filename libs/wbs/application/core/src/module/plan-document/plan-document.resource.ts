import {
  PLAN_DOCUMENT_VERSION,
  type PlanDocument,
  planDocumentHeaderRequest,
  type PlanDocumentImport,
  planDocumentRequest,
  validateSchema,
  type WorkItemTree,
} from '@wbs/contracts';
import { formatStepNodeId, formatStepReference, NO_ALLOWANCE, orderSteps } from '@wbs/domain';

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
import type { ExternalSystem, Service, Tag, WorkItemType } from '../../ports/work-item-store';

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
    project: Project,
    tree: WorkItemTree,
    access: ResourceAccess,
  ): Promise<PlanDocumentExport> {
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
    return {
      ok: true,
      value: await this.buildDocument(project, { ...tree, steps: coded }, access),
    };
  }

  private async buildDocument(
    project: Project,
    tree: WorkItemTree & { steps: PlanDocument['steps'] },
    access: ResourceAccess,
  ): Promise<PlanDocument> {
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
    const closure = referencedDirectory(tree, {
      teams,
      people,
      tags,
      services,
      types,
      externalSystems,
    });
    return {
      project,
      ...tree,
      stepNodes: spellStepNodes(tree),
      document: {
        format: 'wbs-plan',
        version: PLAN_DOCUMENT_VERSION,
        exportedAt: new Date(this.options.clock.now()).toISOString(),
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
      },
      capacity: tree.teamCapacities.map(({ serviceTeamId, size }) => ({
        teamId: serviceTeamId,
        size,
      })),
      calendarMarkers: markerRead.value.map(({ id, date, name, color }) => ({
        id,
        date,
        name,
        color,
      })),
      directory: closure,
    };
  }
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
      : ordered.map(({ id: stepId, code }) => ({
          id: formatStepNodeId({ workItemId, stepId }),
          workItemId,
          stepId,
          reference: formatStepReference(number, code),
        })),
  );
}

export type PlanDocumentClassification =
  | { ok: true; value: PlanDocumentImport }
  | { ok: false; code: 'invalid_body' | 'unsupported_version'; path: string };

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
 * `prepareImport`.
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
  if (version !== 1 && version !== 2 && version !== PLAN_DOCUMENT_VERSION) {
    return { ok: false, code: 'unsupported_version', path: 'document.version' };
  }
  const checked = await validateSchema(planDocumentRequest, input);
  if (checked.issues !== undefined) {
    return { ok: false, code: 'invalid_body', path: pathOf(checked.issues[0]?.path) };
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
  return { ok: true, value: { ...checked.value, steps } };
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
