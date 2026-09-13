import type { PlanDocumentRequest } from '@wbs/contracts';

import type { Clock } from '../ports/clock';
import type { Scheduler } from '../ports/scheduler';
import type { Scope, UnitOfWork } from '../ports/unit-of-work';
import { AnnouncementCollector, type Broadcaster } from './broadcast';
import type { DirectoryService } from './directory.service';
import { type ImportPreparation, type PreparedNamedEntry, prepareImport } from './prepare-import';

interface ImportServices {
  directory: DirectoryService;
}

export interface ImportServiceOptions {
  clock: Clock;
  scheduler: Scheduler;
  uow: UnitOfWork;
  announcements: Broadcaster;
  batchServices: (scope: Scope, broadcast: Broadcaster) => ImportServices;
}

export interface ImportAdmission {
  ok: true;
  projectId: string;
  solutionRef: 'kept' | 'left-off' | 'none';
}

export type ImportOutcome = ImportAdmission | Extract<ImportPreparation, { ok: false }>;

function existingIds(rows: readonly { id: string; name: string }[]): Map<string, string> {
  return new Map(rows.map(({ id, name }) => [name, id]));
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
 * graph composed over the {@link Scope} supplied by this import's own
 * {@link UnitOfWork}. Existing entries are authoritative and are never patched;
 * only entries created by this import receive file-owned metadata.
 */
export class ImportService {
  constructor(private readonly opts: ImportServiceOptions) {}

  async import(document: PlanDocumentRequest, actorId: string): Promise<ImportOutcome> {
    const preparation = prepareImport(document, this.opts.scheduler);
    if (!preparation.ok) return preparation;
    const collector = new AnnouncementCollector(this.opts.announcements);
    const admitted = await this.opts.uow.run<ImportAdmission>(async (scope) => {
      const graph = this.opts.batchServices(scope, collector);
      const directory = graph.directory;
      const [services, teams, people, tags, types, systems] = await Promise.all([
        directory.listServices(),
        directory.listTeams(),
        directory.listPeople(),
        directory.listTags(),
        directory.listWorkItemTypes(),
        directory.listExternalSystems(),
      ]);
      const prepared = preparation.value;
      const servicesByFileId = await resolveNamed(
        prepared.serviceByFileId,
        existingIds(services),
        async (name) => await directory.addService(actorId, name),
      );
      const heldTeams = existingIds(teams);
      const teamsByFileId = new Map<string, string>();
      for (const team of prepared.teamByFileId.values()) {
        const held = heldTeams.get(team.name);
        if (held !== undefined) {
          teamsByFileId.set(team.fileId, held);
          continue;
        }
        const created = await directory.addTeam(actorId, team.name);
        if (created === null) throw new Error(`prepared team name became invalid: ${team.name}`);
        const serviceIds = team.serviceFileIds.map((fileId) => {
          const id = servicesByFileId.get(fileId);
          if (id === undefined) throw new Error(`prepared service mapping disappeared: ${fileId}`);
          return id;
        });
        const patched = await directory.patchTeam(created.id, actorId, { serviceIds });
        if (!patched.ok) throw new Error(`created team metadata was refused: ${patched.reason}`);
        teamsByFileId.set(team.fileId, created.id);
      }
      const heldPeople = existingIds(people);
      for (const person of prepared.personByFileId.values()) {
        const held = heldPeople.get(person.name);
        if (held !== undefined) {
          // Proof: patching this row with the file's kind and team ids made both source
          // contract runs replace `person/held-team` with `agent/imported-2` byte-for-byte.
          continue;
        }
        const teamIds = person.teamFileIds.map((fileId) => {
          const id = teamsByFileId.get(fileId);
          if (id === undefined) throw new Error(`prepared team mapping disappeared: ${fileId}`);
          return id;
        });
        const created = await directory.addPerson(actorId, person.name, teamIds, person.kind);
        if (!created.ok) throw new Error(`created person metadata was refused: ${created.reason}`);
      }
      await resolveNamed(
        prepared.tagByFileId,
        existingIds(tags),
        async (name) => await directory.addTag(actorId, name),
      );
      await resolveNamed(
        prepared.typeByFileId,
        existingIds(types),
        async (name) => await directory.addWorkItemType(actorId, name),
      );
      await resolveNamed(
        prepared.externalSystemByFileId,
        existingIds(systems),
        async (name) => await directory.addExternalSystem(actorId, name),
      );
      const requested = prepared.settings.solutionRef;
      const solutionRef =
        requested === null
          ? 'none'
          : // Proof: skipping this admitted lookup made the source contract receive
            // `kept` where the held-solution fixture requires `left-off`.
            (await scope.stores.projects.findBySolutionSlug(requested.slug)) === null
            ? 'kept'
            : 'left-off';
      const stamp = this.opts.clock.stampFor(actorId);
      const projectId = this.opts.clock.newId();
      const settings = prepared.settings;
      const steps = prepared.steps.map((step) => ({
        id: this.opts.clock.newId(),
        projectId,
        name: step.name,
        position: step.position,
      }));
      // Proof: routing this through ProjectService.create made the source contract
      // read `[Dev@10, QA@20]` instead of `[Discover@10, Build@30, Verify@70]`.
      await scope.stores.projects.create(
        {
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
        },
        steps,
        stamp,
      );
      const bands = await scope.stores.priorityBands.replace(
        projectId,
        prepared.priorityBands,
        stamp,
      );
      if (!bands.ok) throw new Error(`created project refused its priority bands: ${projectId}`);
      for (const capacity of prepared.capacity) {
        const teamId = teamsByFileId.get(capacity.teamFileId);
        if (teamId === undefined)
          throw new Error(`prepared capacity team mapping disappeared: ${capacity.teamFileId}`);
        const written = await scope.stores.capacity.set(projectId, teamId, capacity.size, stamp);
        if (!written.ok) throw new Error(`created project refused its capacity: ${projectId}`);
      }
      for (const marker of prepared.calendarMarkers) {
        const written = await scope.stores.calendarMarkers.create({
          id: this.opts.clock.newId(),
          projectId,
          date: marker.date,
          name: marker.name,
          color: marker.color,
          createdAt: stamp.at,
        });
        if (!written.ok)
          throw new Error(`created project refused its calendar marker: ${written.reason}`);
      }
      return {
        commit: true,
        value: {
          ok: true,
          projectId,
          solutionRef,
        },
      };
    });
    await collector.send();
    return admitted;
  }
}
