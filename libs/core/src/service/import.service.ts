import type { PlanDocumentRequest } from '@wbs/contracts';

import type { Scheduler } from '../ports/scheduler';
import type { Scope, UnitOfWork } from '../ports/unit-of-work';
import { AnnouncementCollector, type Broadcaster } from './broadcast';
import type { DirectoryService } from './directory.service';
import { type ImportPreparation, type PreparedNamedEntry, prepareImport } from './prepare-import';

interface ImportServices {
  directory: DirectoryService;
}

export interface ImportServiceOptions {
  scheduler: Scheduler;
  uow: UnitOfWork;
  announcements: Broadcaster;
  batchServices: (scope: Scope, broadcast: Broadcaster) => ImportServices;
}

export interface ImportAdmission {
  ok: true;
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
      return {
        commit: true,
        value: {
          ok: true,
          solutionRef,
        },
      };
    });
    await collector.send();
    return admitted;
  }
}
