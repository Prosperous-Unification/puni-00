import type { PlanDocumentImport } from '@wbs/contracts';
import { canWriteInOrganization } from '@wbs/domain';

import { AnnouncementCollector } from '../../ports/announcement-collector';
import type { Clock } from '../../ports/clock';
import type { ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { Scheduler } from '../../ports/scheduler';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { type ImportGraphFactory, runImportAdmission } from './imported-plan.resource';
import {
  type ImportPreparation,
  type PreparedNamedEntry,
  type PreparedWorkItem,
  prepareImport,
} from './prepare-import';

export interface ImportServiceOptions {
  clock: Clock;
  scheduler: Scheduler;
  uow: UnitOfWork;
  announcements: Broadcaster;
  batchServices: ImportGraphFactory;
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

export type ImportOutcome =
  | ImportAdmission
  | ImportSourceRefusal
  | ImportForbidden
  | Extract<ImportPreparation, { ok: false }>;

type AdmittedImportOutcome = ImportAdmission | ImportSourceRefusal;

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
 * graph composed over the scope this import's own {@link UnitOfWork} supplies,
 * and every other repository write goes through that scope's
 * {@link ImportedPlanResource}. Existing entries are authoritative and are never patched;
 * only entries created by this import receive file-owned metadata.
 * Successful admission collects directory, project-settings and full-tree
 * refreshes, then publishes them only after the unit of work has committed and
 * released its turn. Import creation does not append undo or plan-history rows.
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
    const admitted = await runImportAdmission<AdmittedImportOutcome>(
      this.opts.uow,
      this.opts.batchServices,
      collector,
      async (writes, graph) => {
        const directory = graph.directory;
        const [services, teams, people, tags, types, systems] = await Promise.all([
          directory.listWithin('services', access),
          directory.listWithin('teams', access),
          directory.listWithin('people', access),
          directory.listWithin('tags', access),
          directory.listWithin('workItemTypes', access),
          directory.listWithin('externalSystems', access),
        ]);
        const prepared = preparation.value;
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
          importsNewName(prepared.externalSystemByFileId, systems);
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
        const projectId = this.opts.clock.newId();
        const settings = prepared.settings;
        const steps = prepared.steps.map((step) => ({
          id: this.opts.clock.newId(),
          projectId,
          name: step.name,
          position: step.position,
          code: step.code,
          allowancePercent: step.allowancePercent,
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
        };
        await writes.createProject(project, steps, stamp, access);
        await writes.replacePriorityBands(projectId, prepared.priorityBands, stamp);
        for (const capacity of prepared.capacity) {
          const teamId = teamsByFileId.get(capacity.teamFileId);
          if (teamId === undefined)
            throw new Error(`prepared capacity team mapping disappeared: ${capacity.teamFileId}`);
          await writes.setCapacity(projectId, teamId, capacity.size, stamp);
        }
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
            measures: prepared.workItems.flatMap((row) =>
              row.measures.map((measure) => ({
                workItemId: resolvedId(rowsByFileId, row.fileId, 'measured work item'),
                stepId: resolvedId(stepsByFileId, measure.stepFileId, 'measure step'),
                metric: measure.metric,
                value: measure.value,
                recordedAt: stamp.at,
              })),
            ),
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
        if (directoryChanged) {
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
