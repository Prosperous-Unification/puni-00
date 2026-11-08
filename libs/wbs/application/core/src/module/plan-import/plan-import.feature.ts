import type { PlanDocumentImport } from '@wbs/contracts';
import {
  attemptOf,
  canWriteInOrganization,
  type CapacityLimitCrossed,
  decideMeasureCreate,
  definitionsOrUnowned,
  type LimitCrossed,
  mayDefineMeasuresInOrganization,
  type MeasureDefinition,
} from '@wbs/domain';

import { AnnouncementCollector } from '../../ports/announcement-collector';
import type { Clock } from '../../ports/clock';
import type { ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { Scheduler } from '../../ports/scheduler';
import type { ImportedPlanResource, ImportTransaction } from './imported-plan.resource';
import {
  type ImportPreparation,
  type PreparedImport,
  type PreparedNamedEntry,
  type PreparedWorkItem,
  prepareImport,
} from './prepare-import';

export interface ImportServiceOptions {
  clock: Clock;
  scheduler: Scheduler;
  transaction: ImportTransaction;
  announcements: Broadcaster;
}

export interface ImportAdmission {
  ok: true;
  projectId: string;
  rows: number;
  created: {
    teams: string[];
    people: string[];
    tags: string[];
    services: string[];
    types: string[];
    externalSystems: string[];
  };
  solutionRef: 'kept' | 'left-off' | 'none';
}

/** A typed store refusal encountered after preparation and admission. */
export interface ImportSourceRefusal {
  ok: false;
  code: 'source_refused';
  path: string;
  detail: string;
}

/** A viewer's import after activation: reading an organization is not importing into it. */
export interface ImportForbidden {
  ok: false;
  code: 'forbidden';
  /** The whole document: nothing in it was read. */
  path: '';
  detail: null;
}

/**
 * The import would make the organization hold more agent persons than its cap
 * allows (`wbs-organization-limits` L9): `added` is every agent the import
 * would create, counted once, and nothing is written.
 */
export type ImportLimitRefusal =
  | ({ ok: false; code: 'agent_person_limit' } & LimitCrossed)
  /**
   * A capacity the import would state crosses the organization's cap on that
   * resource (L9): the first such, in the file's order; nothing is written.
   */
  | ({ ok: false; code: 'capacity_limit' } & CapacityLimitCrossed);

export type ImportOutcome =
  | ImportAdmission
  | ImportSourceRefusal
  | ImportForbidden
  | ImportLimitRefusal
  | Extract<ImportPreparation, { ok: false }>;

type AdmittedImportOutcome =
  ImportAdmission | ImportSourceRefusal | ImportForbidden | ImportLimitRefusal;

function existingIds(rows: readonly { id: string; name: string }[]): Map<string, string> {
  return new Map(rows.map(({ id, name }) => [name, id]));
}

function importsNewName(
  entries: ReadonlyMap<string, { name: string }>,
  held: readonly { name: string }[],
): boolean {
  const heldNames = new Set(held.map(({ name }) => name));
  return [...entries.values()].some(({ name }) => !heldNames.has(name));
}

function createdNames(
  entries: ReadonlyMap<string, { name: string }>,
  held: readonly { name: string }[],
): string[] {
  const heldNames = new Set(held.map(({ name }) => name));
  return [...entries.values()].flatMap(({ name }) => (heldNames.has(name) ? [] : [name]));
}

function resolvedId(
  idsByFileId: ReadonlyMap<string, string>,
  fileId: string,
  kind: string,
): string {
  const id = idsByFileId.get(fileId);
  if (id === undefined) throw new Error(`prepared ${kind} mapping disappeared: ${fileId}`);
  return id;
}

/**
 * Orders prepared rows for the subtree insert's parent foreign key.
 *
 * `prepareImport` guarantees every non-null parent is in this collection and
 * the hierarchy is acyclic. Failure to make progress therefore means that
 * preparation's admitted invariant disappeared and is an internal error.
 */
function parentsFirst(rows: readonly PreparedWorkItem[]): PreparedWorkItem[] {
  const remaining = new Map(rows.map((row) => [row.fileId, row] as const));
  const ordered: PreparedWorkItem[] = [];
  while (remaining.size > 0) {
    let admittedParent = false;
    for (const [fileId, row] of remaining) {
      if (row.parentFileId !== null && remaining.has(row.parentFileId)) continue;
      ordered.push(row);
      remaining.delete(fileId);
      admittedParent = true;
    }
    if (!admittedParent) throw new Error('prepared hierarchy lost its parents-first order');
  }
  return ordered;
}

/**
 * The fields that decide what a measure's figures mean (`wbs-measure-budgets`
 * design D63). A held definition differing in any of them is refused rather
 * than remapped; its name, order and default visibility are the
 * organization's own and stay as they are.
 */
const MEASURE_SHAPE_FIELDS = [
  'kind',
  'scale',
  'unit',
  'currency',
  'threePoint',
  'derived',
  'schedulesWork',
] as const satisfies readonly (keyof MeasureDefinition)[];

/**
 * Matches every measure definition the file names by key among the
 * organization's and defines the ones it lacks (`wbs-measure-budgets` design
 * D63, D65). Under legacy access the organization is the legacy one, which
 * owns the created project before activation; only when none exists is the
 * created project owned by no organization, so the file's definitions are
 * matched against the seeded four it answers and none is defined (design D19).
 *
 * Every fact, trio and budget was checked against the file's definitions by
 * `prepareImport`; a matched definition has the same shape, so the figures
 * hold in the organization too, and the stores throw on a key they do not
 * hold as the backstop.
 *
 * The answer is the definitions the created project holds (null when no
 * organization owns it), or the first refusal in file order, which rolls the
 * import back: a held definition of another shape (`measure_shape_mismatch`,
 * at the first differing field), one no organization would own
 * (`unknown_measure`), or a definition the organization refuses
 * (`decideMeasureCreate`'s reasons, `derived_measure`).
 */
async function resolveMeasures(
  writes: ImportedPlanResource,
  prepared: PreparedImport,
  access: ResourceAccess,
  stamp: { at: number; by: string },
  newId: () => string,
): Promise<
  | { ok: true; definitions: MeasureDefinition[] | null; created: boolean }
  | { ok: false; refusal: ImportSourceRefusal | ImportForbidden }
> {
  const refused = (path: string, detail: string) =>
    ({ ok: false, refusal: { ok: false, code: 'source_refused', path, detail } }) as const;
  const owned = await writes.measureDefinitionsWithin(access);
  const held = owned === null ? null : [...owned];
  let created = false;
  for (const [at, definition] of prepared.measureDefinitions.entries()) {
    const path = `measureDefinitions[${String(at)}]`;
    const found = definitionsOrUnowned(held).find(({ key }) => key === definition.key);
    if (found !== undefined) {
      // Proof: with this refusal skipped, `refuses a defined measure under
      // legacy access, writing no project` (import-service-source-contract.ts,
      // memory source) imported tokens counted in kilotokens; watched 2026-10-23.
      const differing = MEASURE_SHAPE_FIELDS.find((field) => found[field] !== definition[field]);
      if (differing !== undefined) return refused(`${path}.${differing}`, 'measure_shape_mismatch');
      continue;
    }
    // Proof: with this refusal skipped, `refuses a defined measure under
    // legacy access, writing no project` (import-service-source-contract.ts)
    // threw from `addMeasureWithin` instead; watched 2026-10-23.
    if (held === null) return refused(`${path}.key`, 'unknown_measure');
    // Defining a measure is an admin's act (design D70), whichever way it arrives.
    // Proof: with this refusal skipped, `refuses a member's import that would
    // define a measure, writing nothing` (measure-export.controller.db.test.ts)
    // answered 201 with gpu_minutes defined; watched 2026-10-24.
    if (access.kind === 'scoped' && !mayDefineMeasuresInOrganization(access.scope.role))
      return { ok: false, refusal: { ok: false, code: 'forbidden', path: '', detail: null } };
    if (definition.derived) return refused(`${path}.derived`, 'derived_measure');
    const measure: MeasureDefinition = { id: newId(), ...definition };
    const decided = decideMeasureCreate(held, measure);
    if (decided !== null) return refused(path, decided);
    const added = await writes.addMeasureWithin(access, measure, stamp);
    if (!added.ok) return refused(path, added.reason);
    held.push(measure);
    created = true;
  }
  return { ok: true, definitions: held, created };
}

async function resolveNamed(
  entries: ReadonlyMap<string, PreparedNamedEntry>,
  existing: Map<string, string>,
  create: (name: string) => Promise<{ id: string } | null>,
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  for (const entry of entries.values()) {
    const held = existing.get(entry.name);
    if (held !== undefined) {
      resolved.set(entry.fileId, held);
      continue;
    }
    const created = await create(entry.name);
    if (created === null) throw new Error(`prepared directory name became invalid: ${entry.name}`);
    resolved.set(entry.fileId, created.id);
  }
  return resolved;
}

/**
 * Admits one prepared archival plan and reconciles its deployment-global names.
 *
 * Every directory read, create, ownership write and membership write uses the
 * graph composed over this import's admitted transaction,
 * and every other repository write goes through that scope's
 * {@link ImportedPlanResource}. Existing entries are authoritative and are never patched;
 * only entries created by this import receive file-owned metadata.
 * Successful admission records actual shared-person consequences in the same
 * unit of work, delivers those rows after release, then publishes collected
 * directory, project-settings and full-tree refreshes. Import creation does
 * not append undo or plan-history rows.
 */
export class ImportService {
  constructor(private readonly opts: ImportServiceOptions) {}

  /**
   * Imports a plan document as a new project through the caller's access.
   * Under scoped access the project is the organization's, every directory
   * name resolves among the organization's own entries under their local
   * names and anything missing is created there, a solution reference is left
   * off (slugs are still unique across the deployment, so keeping one would
   * reveal another organization's), and only the organization's projects are
   * told the directory changed.
   *
   * Proof: reading the tags through legacy access made `imports into the
   * organization, resolving names among its own entries` in
   * `import-export-organization.controller.db.test.ts` create a second
   * `Release` tag instead of resolving A's own; watched 2026-09-27.
   */
  async import(
    document: PlanDocumentImport,
    actorId: string,
    access: ResourceAccess,
  ): Promise<ImportOutcome> {
    // Proof: skipping this refusal made `refuses a viewer's import` in
    // `import-export-organization.controller.db.test.ts` answer 201;
    // watched 2026-09-27.
    if (access.kind === 'scoped' && !canWriteInOrganization(access.scope.role)) {
      return { ok: false, code: 'forbidden', path: '', detail: null };
    }
    const preparation = prepareImport(document, this.opts.scheduler);
    if (!preparation.ok) return preparation;
    const collector = new AnnouncementCollector(this.opts.announcements);
    const admitted = await this.opts.transaction.run<AdmittedImportOutcome>(
      actorId,
      access,
      { ok: false, code: 'forbidden', path: '', detail: null },
      collector,
      async ({ writes, services: graph }) => {
        const directory = graph.directory;
        const [services, teams, people, tags, types, systems, resources] = await Promise.all([
          directory.listWithin('services', access),
          directory.listWithin('teams', access),
          directory.listWithin('people', access),
          directory.listWithin('tags', access),
          directory.listWithin('workItemTypes', access),
          directory.listWithin('externalSystems', access),
          directory.listWithin('resources', access),
        ]);
        const prepared = preparation.value;
        // Every agent the import would create, against the cap once and before
        // anything is created: the import is all or none (L9), and a name the
        // organization already holds keeps its own kind, so it adds nothing.
        // Proof, each watched 2026-10-22 in agent-person-limit.controller.db.test.ts:
        // with this whole-import check removed, `refuses an import of three
        // agents at 6 of 8, writing nothing` answered 500 from the third
        // agent's own refusal in `addPersonWithin` instead of 409 with added 3;
        // counting the file's agents the organization already holds made
        // `imports at the cap when every agent of the file is already held`
        // refuse (11 pass, 1 fail each).
        const heldPersonNames = new Set(people.map(({ name }) => name));
        const addedAgents = new Set(
          [...prepared.personByFileId.values()]
            .filter((person) => person.kind === 'agent' && !heldPersonNames.has(person.name))
            .map(({ name }) => name),
        ).size;
        if (addedAgents > 0) {
          const crossed = await directory.refuseAgentPersonsWithin(access, addedAgents);
          if (crossed !== null)
            return { commit: false, value: { ok: false, code: 'agent_person_limit', ...crossed } };
        }
        const created = {
          services: createdNames(prepared.serviceByFileId, services),
          teams: createdNames(prepared.teamByFileId, teams),
          people: createdNames(prepared.personByFileId, people),
          tags: createdNames(prepared.tagByFileId, tags),
          types: createdNames(prepared.typeByFileId, types),
          externalSystems: createdNames(prepared.externalSystemByFileId, systems),
        };
        const directoryChanged =
          importsNewName(prepared.serviceByFileId, services) ||
          importsNewName(prepared.teamByFileId, teams) ||
          importsNewName(prepared.personByFileId, people) ||
          importsNewName(prepared.tagByFileId, tags) ||
          importsNewName(prepared.typeByFileId, types) ||
          importsNewName(prepared.externalSystemByFileId, systems) ||
          importsNewName(prepared.resourceByFileId, resources);
        const servicesByFileId = await resolveNamed(
          prepared.serviceByFileId,
          existingIds(services),
          async (name) => await directory.addWithin('services', actorId, name, access),
        );
        const heldTeams = existingIds(teams);
        const teamsByFileId = new Map<string, string>();
        for (const team of prepared.teamByFileId.values()) {
          const held = heldTeams.get(team.name);
          if (held !== undefined) {
            teamsByFileId.set(team.fileId, held);
            continue;
          }
          const created = await directory.addWithin('teams', actorId, team.name, access);
          if (created === null) throw new Error(`prepared team name became invalid: ${team.name}`);
          const serviceIds = team.serviceFileIds.map((fileId) => {
            const id = servicesByFileId.get(fileId);
            if (id === undefined)
              throw new Error(`prepared service mapping disappeared: ${fileId}`);
            return id;
          });
          const patched = await directory.patchTeamWithin(
            created.id,
            actorId,
            { serviceIds },
            access,
          );
          if (!patched.ok) throw new Error(`created team metadata was refused: ${patched.reason}`);
          teamsByFileId.set(team.fileId, created.id);
        }
        const heldPeople = existingIds(people);
        const peopleByFileId = new Map<string, string>();
        for (const person of prepared.personByFileId.values()) {
          const held = heldPeople.get(person.name);
          if (held !== undefined) {
            // Proof: patching this row with the file's kind and team ids made both source
            // contract runs replace `person/held-team` with `agent/imported-2` byte-for-byte.
            peopleByFileId.set(person.fileId, held);
            continue;
          }
          const teamIds = person.teamFileIds.map((fileId) => {
            const id = teamsByFileId.get(fileId);
            if (id === undefined) throw new Error(`prepared team mapping disappeared: ${fileId}`);
            return id;
          });
          const created = await directory.addPersonWithin(
            actorId,
            person.name,
            teamIds,
            access,
            person.kind,
          );
          if (!created.ok)
            throw new Error(`created person metadata was refused: ${created.reason}`);
          peopleByFileId.set(person.fileId, created.value.id);
        }
        const tagsByFileId = await resolveNamed(
          prepared.tagByFileId,
          existingIds(tags),
          async (name) => await directory.addWithin('tags', actorId, name, access),
        );
        const typesByFileId = await resolveNamed(
          prepared.typeByFileId,
          existingIds(types),
          async (name) => await directory.addWithin('workItemTypes', actorId, name, access),
        );
        const systemsByFileId = await resolveNamed(
          prepared.externalSystemByFileId,
          existingIds(systems),
          async (name) => await directory.addWithin('externalSystems', actorId, name, access),
        );
        // Resources resolve by name like every catalog, and an existing one is
        // authoritative for its unit label; one of another kind is refused,
        // because every demand on it was checked against the file's kind.
        // Proof: with the kind comparison removed, `refuses a resource the
        // directory holds under another kind, writing no project`
        // (import-service-source-contract.ts, memory source) imported the plan
        // onto the divisible resource; watched 2026-10-20.
        const heldResources = new Map(resources.map((each) => [each.name, each] as const));
        const resourcesByFileId = new Map<string, string>();
        for (const [at, resource] of [...prepared.resourceByFileId.values()].entries()) {
          const held = heldResources.get(resource.name);
          if (held !== undefined) {
            if (held.kind !== resource.kind)
              return {
                commit: false,
                value: {
                  ok: false,
                  code: 'source_refused',
                  path: `directory.resources[${String(at)}].kind`,
                  detail: 'kind_is_immutable',
                },
              };
            resourcesByFileId.set(resource.fileId, held.id);
            continue;
          }
          const created = await directory.addResourceWithin(
            actorId,
            { name: resource.name, kind: resource.kind, unitLabel: resource.unitLabel },
            access,
          );
          if (!created.ok) throw new Error(`created resource was refused: ${created.reason}`);
          resourcesByFileId.set(resource.fileId, created.value.id);
        }
        const requested = prepared.settings.solutionRef;
        const solutionRef =
          requested === null
            ? 'none'
            : // Proof: skipping this admitted lookup made concurrent memory imports both
              // answer `kept` and leaked SQLite's `project.solution_slug` uniqueness error.
              (await writes.isSolutionSlugHeld(requested.slug, access))
              ? 'left-off'
              : 'kept';
        const stamp = this.opts.clock.stampFor(actorId);
        const measures = await resolveMeasures(writes, prepared, access, stamp, () =>
          this.opts.clock.newId(),
        );
        if (!measures.ok) return { commit: false, value: measures.refusal };
        const projectId = this.opts.clock.newId();
        const settings = prepared.settings;
        const steps = prepared.steps.map((step) => ({
          id: this.opts.clock.newId(),
          projectId,
          name: step.name,
          position: step.position,
          code: step.code,
          allowancePercent: step.allowancePercent,
          // Proof: forcing workdays failed native units in the composed minute round trip.
          estimateUnit: step.estimateUnit,
        }));
        const stepsByFileId = new Map(
          prepared.steps.map((step, at) => {
            const written = steps.at(at);
            if (written === undefined)
              throw new Error('prepared steps changed length during import');
            return [step.fileId, written.id] as const;
          }),
        );
        // Proof: routing this through ProjectService.create made the source contract
        // read `[Dev@10, QA@20]` instead of `[Discover@10, Build@30, Verify@70]`.
        const project = {
          id: projectId,
          name: settings.name,
          ownerId: actorId,
          restricted: settings.restricted,
          estimateMethod: settings.estimateMethod,
          depReach: settings.depReach,
          pertWeights: settings.pertWeights,
          estimateRounding: settings.estimateRounding,
          startDate: settings.startDate,
          solutionRef: requested !== null && solutionRef === 'kept' ? requested : null,
          revision: 0,
          createdAt: stamp.at,
          optimizationEnabled: settings.optimizationEnabled,
          scheduleEngine: settings.scheduleEngine,
          scheduleObjective: settings.scheduleObjective,
          // Version 11 states it; earlier versions read as 1 (design D63).
          // Proof: with the factor left off, `round-trips a version-11 plan’s
          // trios, budgets and factor byte for byte`
          // (import-service-source-contract.ts, memory source) failed; watched
          // 2026-10-23.
          budgetFactor: settings.budgetFactor,
        };
        await writes.createProject(project, steps, stamp, access);
        await writes.replacePriorityBands(projectId, prepared.priorityBands, stamp);
        for (const capacity of prepared.capacity) {
          const teamId = teamsByFileId.get(capacity.teamFileId);
          if (teamId === undefined)
            throw new Error(`prepared capacity team mapping disappeared: ${capacity.teamFileId}`);
          await writes.setCapacity(projectId, teamId, capacity.size, stamp);
        }
        // Every capacity against the cap before any is written, and the import
        // whole: a refusal rolls back the project and directory entries
        // written above (L9). A file states each resource at most once.
        // Proof, watched 2026-10-22 in capacity-limit.controller.db.test.ts:
        // with this check removed, `refuses an import stating past the cap,
        // writing nothing` and the import beside another project were
        // admitted (10 pass, 2 fail); with the other projects' sum read as 0 in
        // `refuseCapacityWithin`, `refuses an import that would state past the
        // cap beside another project, the export’s source among them` was
        // admitted (11 pass, 1 fail).
        const capacities = prepared.resourceCapacities.map((stated) => ({
          resourceId: resolvedId(resourcesByFileId, stated.resourceFileId, 'capacity resource'),
          units: stated.units,
        }));
        for (const { resourceId, units } of capacities) {
          const crossed = await writes.refuseCapacityWithin(access, projectId, resourceId, units);
          if (crossed !== null)
            return { commit: false, value: { ok: false, code: 'capacity_limit', ...crossed } };
        }
        for (const { resourceId, units } of capacities)
          await writes.setResourceCapacity(projectId, resourceId, units, stamp);
        for (const marker of prepared.calendarMarkers) {
          await writes.createCalendarMarker({
            id: this.opts.clock.newId(),
            projectId,
            date: marker.date,
            name: marker.name,
            color: marker.color,
            createdAt: stamp.at,
          });
        }
        // Proof: mapping each row to its file id made the in-memory source replace
        // the original project's three snapshotted rows; its reread became `[]`.
        const rowsByFileId = new Map(
          prepared.workItems.map((row) => [row.fileId, this.opts.clock.newId()] as const),
        );
        await writes.insertSubtree(
          {
            rows: parentsFirst(prepared.workItems).map((row) => ({
              id: resolvedId(rowsByFileId, row.fileId, 'work item'),
              projectId,
              parentId:
                row.parentFileId === null
                  ? null
                  : resolvedId(rowsByFileId, row.parentFileId, 'parent work item'),
              position: row.position,
              name: row.name,
              // Proof: omitting this field made the source contract read `''` instead
              // of `Exact parent notes` and `Exact leaf notes` from the stored tree.
              notes: row.notes,
              frozenNumber: row.frozenNumber,
              startNoEarlierThan: row.startNoEarlierThan,
              startNoEarlierThanReason: row.startNoEarlierThanReason,
              deadline: row.deadline,
              factStart: row.factStart,
              factEnd: row.factEnd,
              // Plan document v6 carries both; earlier versions read as null.
              // Proof: both written as null here made `round-trips a version-6
              // readiness and hold…` fail with the imported row holding neither;
              // watched 2026-09-29.
              readiness: row.readiness,
              hold: row.hold,
              priority: row.priority,
              serviceTeamId:
                row.serviceTeamFileId === null
                  ? null
                  : resolvedId(teamsByFileId, row.serviceTeamFileId, 'service team'),
              serviceId:
                row.serviceFileId === null
                  ? null
                  : resolvedId(servicesByFileId, row.serviceFileId, 'service'),
              maxParallel: row.maxParallel,
              revision: 0,
              teamIds: row.teamFileIds.map((fileId) =>
                resolvedId(teamsByFileId, fileId, 'team label'),
              ),
            })),
            respaced: [],
            reparented: [],
            estimates: prepared.workItems.flatMap((row) =>
              row.estimates.map((estimate) => ({
                workItemId: resolvedId(rowsByFileId, row.fileId, 'estimated work item'),
                stepId: resolvedId(stepsByFileId, estimate.stepFileId, 'estimate step'),
                optimistic: estimate.optimistic,
                realistic: estimate.realistic,
                pessimistic: estimate.pessimistic,
              })),
            ),
            actuals: prepared.workItems.flatMap((row) =>
              row.actuals.map((actual) => ({
                workItemId: resolvedId(rowsByFileId, row.fileId, 'actual work item'),
                stepId: resolvedId(stepsByFileId, actual.stepFileId, 'actual step'),
                days: actual.days,
                recordedAt: stamp.at,
              })),
            ),
            progress: prepared.workItems.flatMap((row) =>
              row.progress.map((progress) => ({
                workItemId: resolvedId(rowsByFileId, row.fileId, 'progress work item'),
                stepId: resolvedId(stepsByFileId, progress.stepFileId, 'progress step'),
                state: progress.state,
                statedAt: stamp.at,
              })),
            ),
            measures: [
              ...prepared.workItems.flatMap((row) =>
                row.measures.map((measure) => ({
                  workItemId: resolvedId(rowsByFileId, row.fileId, 'measured work item'),
                  stepId: resolvedId(stepsByFileId, measure.stepFileId, 'measure step'),
                  metric: measure.metric,
                  value: measure.value,
                  recordedAt: stamp.at,
                })),
              ),
              // Facts in defined measures, addressed by key with their basis
              // (design D63); `resolveMeasures` has defined every key.
              ...prepared.measureFacts.map(({ workItemId, stepId, measure, value, basis }) => ({
                workItemId: resolvedId(rowsByFileId, workItemId, 'measured work item'),
                stepId: resolvedId(stepsByFileId, stepId, 'measure step'),
                metric: measure,
                value,
                recordedAt: stamp.at,
                ...(basis === null ? {} : { basis }),
              })),
            ],
            // Written below through `setDemand`, which answers the file's resource ids.
            demands: [],
            assignments: prepared.workItems.flatMap((row) =>
              row.assignments.map((assignment) => ({
                workItemId: resolvedId(rowsByFileId, row.fileId, 'assigned work item'),
                stepId: resolvedId(stepsByFileId, assignment.stepFileId, 'assignment step'),
                personId: resolvedId(peopleByFileId, assignment.personFileId, 'assigned person'),
              })),
            ),
            dependencies: prepared.dependencies.map((dependency) => ({
              id: this.opts.clock.newId(),
              projectId,
              predecessorId: resolvedId(
                rowsByFileId,
                dependency.predecessorFileId,
                'dependency predecessor',
              ),
              successorId: resolvedId(
                rowsByFileId,
                dependency.successorFileId,
                'dependency successor',
              ),
            })),
            removedEstimates: [],
            removedActuals: [],
            removedProgress: [],
            removedMeasures: [],
          },
          stamp,
        );
        // After the tree, whose legacy token estimates are the single-point
        // tokens trios (design D28); preparation refused a trio beside one.
        // Proof: with either loop below skipped, `round-trips a version-11
        // plan’s trios, budgets and factor byte for byte`
        // (import-service-source-contract.ts, memory source) failed; watched
        // 2026-10-23.
        for (const trio of prepared.measureEstimates)
          await writes.setMeasureEstimate(
            {
              workItemId: resolvedId(rowsByFileId, trio.workItemId, 'estimated work item'),
              stepId: resolvedId(stepsByFileId, trio.stepId, 'measure estimate step'),
              key: trio.measure,
              optimistic: trio.optimistic,
              realistic: trio.realistic,
              pessimistic: trio.pessimistic,
              singlePoint: false,
              ...(trio.basis === null ? {} : { basis: trio.basis }),
            },
            stamp,
          );
        for (const budget of prepared.budgets)
          await writes.setBudget(
            {
              workItemId: resolvedId(rowsByFileId, budget.workItemId, 'budgeted work item'),
              key: budget.measure,
              cap: budget.cap,
              policy: budget.policy,
              holdPerAttempt: budget.holdPerAttempt,
            },
            stamp,
          );
        for (const demand of prepared.demands)
          await writes.setDemand(
            resolvedId(rowsByFileId, demand.workItemFileId, 'demanding work item'),
            resolvedId(resourcesByFileId, demand.resourceFileId, 'demanded resource'),
            demand.units,
            stamp,
          );
        // Proof: omitting the write, either ID remap, or exact time failed the memory source-contract remap/time test (2026-10-14).
        // Proof: borrowing committed memory state or replacing SQLite rollback with COMMIT failed import rollback negatives after the first fact (2026-10-14).
        for (const fact of prepared.stepBlockages) {
          await writes.restoreBlockage(
            {
              workItemId: resolvedId(rowsByFileId, fact.workItemId, 'blocked work item'),
              stepId: resolvedId(stepsByFileId, fact.stepId, 'blocked step'),
              blockedAt: fact.blockedAt,
            },
            stamp,
          );
        }
        // Plan document version 7 names the zone; `createProject` wrote `UTC`.
        // Proof: this write skipped made `round-trips a Kyiv project whose
        // 010.dev holds attempts…` read the copy's zone as `UTC` for
        // `Europe/Kyiv`; watched 2026-10-12.
        if (settings.timezone !== 'UTC')
          await writes.setTimezone(projectId, settings.timezone, stamp);
        for (const row of prepared.workItems) {
          for (const { stepFileId, personFileId, ...attempt } of row.attempts) {
            await writes.restoreAttempt(
              {
                ...attemptOf({
                  ...attempt,
                  executorPersonId:
                    personFileId === null
                      ? null
                      : resolvedId(peopleByFileId, personFileId, 'attempt executor'),
                }),
                workItemId: resolvedId(rowsByFileId, row.fileId, 'attempted work item'),
                stepId: resolvedId(stepsByFileId, stepFileId, 'attempt step'),
              },
              stamp,
            );
          }
        }
        for (const relationship of prepared.typedDependencies) {
          const remapEndpoint = (endpoint: typeof relationship.predecessor) =>
            endpoint.scope === 'whole'
              ? {
                  scope: 'whole' as const,
                  workItemId: resolvedId(
                    rowsByFileId,
                    endpoint.workItemId,
                    'typed dependency work item',
                  ),
                }
              : {
                  scope: endpoint.scope,
                  workItemId: resolvedId(
                    rowsByFileId,
                    endpoint.workItemId,
                    'typed dependency work item',
                  ),
                  stepId: resolvedId(stepsByFileId, endpoint.stepId, 'typed dependency step'),
                };
          await writes.addTypedDependency(
            {
              id: this.opts.clock.newId(),
              projectId,
              predecessor: remapEndpoint(relationship.predecessor),
              successor: remapEndpoint(relationship.successor),
              type: relationship.type,
            },
            stamp,
          );
        }
        for (const [at, row] of prepared.workItems.entries()) {
          const written = await writes.labelWorkItem(
            resolvedId(rowsByFileId, row.fileId, 'labelled work item'),
            {
              tagIds: row.tagFileIds.map((fileId) => resolvedId(tagsByFileId, fileId, 'tag label')),
              serviceIds: row.serviceFileIds.map((fileId) =>
                resolvedId(servicesByFileId, fileId, 'service label'),
              ),
              typeIds: row.typeFileIds.map((fileId) =>
                resolvedId(typesByFileId, fileId, 'type label'),
              ),
              externalRefs: row.externalRefs.map((reference) => ({
                systemId: resolvedId(systemsByFileId, reference.systemFileId, 'external system'),
                url: reference.url,
                name: reference.name,
              })),
            },
            stamp,
          );
          if (!written.ok) {
            // Proof: returning `commit:true` here made the rollback contract leak
            // the created `Billing` team after its modeled `unknown_tag` refusal.
            return {
              commit: false,
              value: {
                ok: false,
                code: 'source_refused',
                path: `workItems[${String(at)}]`,
                detail: written.reason,
              },
            };
          }
        }
        if (directoryChanged || measures.created) {
          // Proof: omitting this fan-out left an existing project's subscriber
          // with no refresh, so its post-import directory read never saw `Billing`.
          for (const told of await writes.listToldProjectIds(actorId, access)) {
            await collector.publish(told, { type: 'directory_changed' });
          }
        }
        await collector.publish(projectId, {
          type: 'project_settings_changed',
          optimizationEnabled: settings.optimizationEnabled,
          scheduleEngine: settings.scheduleEngine,
          scheduleObjective: settings.scheduleObjective,
        });
        await graph.workItems.announceTreeNow(projectId);
        return {
          commit: true,
          value: {
            ok: true,
            projectId,
            rows: prepared.workItems.length,
            created,
            solutionRef,
          },
        };
      },
    );
    // Proof: moving this drain inside the unit of work made the held-publisher
    // contract time out while its queued ordinary project write waited for admission.
    if (admitted.ok) await collector.send();
    return admitted;
  }
}
