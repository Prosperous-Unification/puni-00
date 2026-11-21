import type { MembershipWritten, Space, SpaceMember, SpaceStore, WriteStamp } from '@wbs/core';
import { placeAfter } from '@wbs/domain';

import {
  type MemoryCalendarMarkerTable,
  memoryCalendarMarkerTable,
} from './calendar-marker-fixture';
import {
  clearMemorySettings,
  type MemorySettingTables,
  memorySettingTables,
} from './settings-fixture';

/** Actual shared state; project membership is stored only on the project rows. */
export interface MemorySpaceTables<ProjectRow extends MemorySpaceProject> {
  readonly spaces: Map<string, Space>;
  readonly settings: MemorySettingTables;
  readonly markers: MemoryCalendarMarkerTable;
  readonly organizations: ReadonlyMap<string, { readonly legacy: boolean }>;
  readonly projects: Map<string, ProjectRow>;
  readonly personOrganization: Pick<ReadonlyMap<string, string>, 'get'>;
  readonly teamOrganization: Pick<ReadonlyMap<string, string>, 'get'>;
  readonly people: Map<string, Set<string>>;
  readonly teams: Map<string, Set<string>>;
}
export interface MemorySpaceProject {
  readonly organizationId: string;
  readonly spaceId: string | null;
  readonly spacePosition: number | null;
  readonly revision: number;
}

// The historical package-ownership Proof below describes the predecessor relation; project ownership is now the checked input.
/** Empty link/container tables around the explicitly supplied actual project rows. */
export function memorySpaceTables<ProjectRow extends MemorySpaceProject>(
  projects: Map<string, ProjectRow>,
  organizations: ReadonlyMap<string, { readonly legacy: boolean }>,
): MemorySpaceTables<ProjectRow> {
  return {
    projects,
    organizations,
    spaces: new Map(),
    settings: memorySettingTables(),
    markers: memoryCalendarMarkerTable(),
    people: new Map(),
    teams: new Map(),
    personOrganization: new Map(),
    teamOrganization: new Map(),
  };
}

/** Same project/space state as the enclosing staged memory catalog; no package-pair mirror. */
export function inMemorySpaces<ProjectRow extends MemorySpaceProject>(
  tables: MemorySpaceTables<ProjectRow>,
): SpaceStore {
  const { spaces, projects } = tables;
  const writeProject = (
    id: string,
    row: ProjectRow,
    spaceId: string | null,
    spacePosition: number | null,
    stamp: WriteStamp,
  ) => {
    projects.set(id, {
      ...row,
      spaceId,
      spacePosition,
      revision: row.revision + 1,
      updatedAt: stamp.at,
    });
  };
  const find = (organizationId: string, spaceId: string): Space | undefined => {
    const found = spaces.get(spaceId);
    // Proof: returning found without its organization predicate exposed the real
    // space to other-org in Source conformance (memory-configuration-fault-space-owner-v1).
    return found?.organizationId === organizationId ? found : undefined;
  };
  const nameTaken = (organizationId: string, name: string, except?: string) =>
    [...spaces.values()].some(
      (each) => each.organizationId === organizationId && each.name === name && each.id !== except,
    );
  const ordered = (spaceId: string): SpaceMember[] =>
    [...projects]
      .flatMap(([projectId, row]) => {
        if (row.spaceId !== spaceId) return [];
        if (row.spacePosition === null || !Number.isSafeInteger(row.spacePosition))
          throw new Error('memory project space position is absent or malformed');
        return [{ projectId, position: row.spacePosition }];
      })
      .sort(
        (a, b) =>
          a.position - b.position ||
          (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0),
      );
  const bump = (found: Space) => {
    spaces.set(found.id, { ...found, revision: found.revision + 1 });
  };
  /** Mirrors `SpaceRepository`'s `place`: null when the anchor is a stranger. */
  const place = (
    spaceId: string,
    group: readonly SpaceMember[],
    afterProjectId: string | null,
    stamp: WriteStamp,
  ): number | null => {
    if (afterProjectId !== null && !group.some(({ projectId }) => projectId === afterProjectId)) {
      return null;
    }
    const placement = placeAfter(
      group.map(({ projectId, position }) => ({ id: projectId, position })),
      afterProjectId,
    );
    const renumbered = new Map(placement.renumbered.map(({ id, position }) => [id, position]));
    for (const [id, position] of renumbered) {
      const row = projects.get(id);
      if (row === undefined) throw new Error('memory space member disappeared');
      writeProject(id, row, spaceId, position, stamp);
    }
    return placement.position;
  };

  const linkIds = (kind: 'people' | 'teams', spaceId: string) => {
    const encoder = new TextEncoder();
    return [...(tables[kind].get(spaceId) ?? [])]
      .map((id) => ({ id, bytes: encoder.encode(id) }))
      .sort((left, right) => {
        for (const [index, byte] of left.bytes.entries()) {
          const compared = right.bytes.at(index);
          if (compared === undefined) return 1;
          if (byte !== compared) return byte - compared;
        }
        return left.bytes.length - right.bytes.length;
      })
      .map(({ id }) => id);
  };
  const links = (kind: 'people' | 'teams', organizationId: string, spaceId: string) => {
    if (find(organizationId, spaceId) === undefined) return null;
    return linkIds(kind, spaceId);
  };
  const changeLink = (
    kind: 'people' | 'teams',
    organizationId: string,
    spaceId: string,
    id: string,
    add: boolean,
  ) => {
    const space = find(organizationId, spaceId);
    if (space === undefined) return false;
    const owners = kind === 'people' ? tables.personOrganization : tables.teamOrganization;
    if (add && owners.get(id) !== organizationId) return false;
    const held = tables[kind].get(spaceId) ?? new Set<string>();
    const changed = add ? !held.has(id) : held.has(id);
    if (add) held.add(id);
    else held.delete(id);
    tables[kind].set(spaceId, held);
    if (changed) bump(space);
    return add || changed;
  };
  return {
    readContents(organizationId, spaceId) {
      const found = find(organizationId, spaceId);
      if (found === undefined) return Promise.resolve(null);
      return Promise.resolve({
        space: { ...found },
        projects: ordered(spaceId),
        personIds: linkIds('people', spaceId),
        serviceTeamIds: linkIds('teams', spaceId),
      });
    },
    peopleOf: (organizationId, spaceId) =>
      Promise.resolve(links('people', organizationId, spaceId)),
    teamsOf: (organizationId, spaceId) => Promise.resolve(links('teams', organizationId, spaceId)),
    addPerson: (organizationId, spaceId, id) =>
      Promise.resolve(changeLink('people', organizationId, spaceId, id, true)),
    removePerson: (organizationId, spaceId, id) =>
      Promise.resolve(changeLink('people', organizationId, spaceId, id, false)),
    addTeam: (organizationId, spaceId, id) =>
      Promise.resolve(changeLink('teams', organizationId, spaceId, id, true)),
    removeTeam: (organizationId, spaceId, id) =>
      Promise.resolve(changeLink('teams', organizationId, spaceId, id, false)),
    legacyOrganizationId() {
      const selected = [...tables.organizations].filter(([, row]) => row.legacy);
      if (selected.length > 1) throw new Error('memory legacy organization is ambiguous');
      return Promise.resolve(selected.at(0)?.[0] ?? null);
    },
    listIn(organizationId) {
      return Promise.resolve(
        [...spaces.values()]
          .filter((each) => each.organizationId === organizationId)
          .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1))
          .map((each) => ({ ...each })),
      );
    },
    findIn(organizationId, spaceId) {
      const found = find(organizationId, spaceId);
      return Promise.resolve(found === undefined ? null : { ...found });
    },
    membersOf(organizationId, spaceId) {
      return Promise.resolve(find(organizationId, spaceId) === undefined ? null : ordered(spaceId));
    },
    membersIn(organizationId) {
      const members = new Map<string, SpaceMember[]>();
      for (const space of spaces.values()) {
        if (space.organizationId !== organizationId) continue;
        const group = ordered(space.id);
        if (group.length > 0) members.set(space.id, group);
      }
      return Promise.resolve(members);
    },
    create(fresh, stamp) {
      if (!tables.organizations.has(fresh.organizationId))
        throw new Error('space organization is absent');
      if (nameTaken(fresh.organizationId, fresh.name)) {
        return Promise.resolve({ ok: false, reason: 'name_taken' });
      }
      const row: Space = { ...fresh, revision: 0, createdBy: stamp.by, createdAt: stamp.at };
      spaces.set(row.id, row);
      return Promise.resolve({ ok: true, space: { ...row } });
    },
    rename(organizationId, spaceId, name) {
      const found = find(organizationId, spaceId);
      if (found === undefined) return Promise.resolve({ ok: false, reason: 'not_found' });
      if (nameTaken(organizationId, name, spaceId)) {
        return Promise.resolve({ ok: false, reason: 'name_taken' });
      }
      const renamed = { ...found, name, revision: found.revision + 1 };
      spaces.set(spaceId, renamed);
      return Promise.resolve({ ok: true, space: { ...renamed } });
    },
    remove(organizationId, spaceId, stamp) {
      if (find(organizationId, spaceId) === undefined) return Promise.resolve(false);
      spaces.delete(spaceId);
      clearMemorySettings(tables.settings, tables.markers, { level: 'space', id: spaceId });
      for (const [id, row] of projects)
        if (row.spaceId === spaceId) writeProject(id, row, null, null, stamp);
      tables.people.delete(spaceId);
      tables.teams.delete(spaceId);
      return Promise.resolve(true);
    },
    addProject(organizationId, spaceId, projectId, afterProjectId, stamp) {
      const found = find(organizationId, spaceId);
      const project = projects.get(projectId);
      const refuse = (reason: 'not_found' | 'already_in_space'): Promise<MembershipWritten> =>
        Promise.resolve({ ok: false, reason });
      // Proof, observed 2026-09-29: with the owner comparison dropped,
      // `refuses a workPackage another organization owns, storing nothing` failed
      // on `Expected - 2 / Received + 2` (a stored `b1`).
      if (found === undefined || project?.organizationId !== organizationId) {
        return refuse('not_found');
      }
      if (project.spaceId !== null && project.spaceId !== spaceId)
        return Promise.resolve({
          ok: false,
          reason: 'project_in_other_space',
          spaceId: project.spaceId,
        });
      const group = ordered(spaceId);
      if (group.some((each) => each.projectId === projectId)) return refuse('already_in_space');
      const position = place(spaceId, group, afterProjectId, stamp);
      if (position === null) return refuse('not_found');
      writeProject(projectId, project, spaceId, position, stamp);
      bump(found);
      return Promise.resolve({ ok: true, position });
    },
    removeProject(organizationId, spaceId, projectId, stamp) {
      const found = find(organizationId, spaceId);
      const held = ordered(spaceId);
      if (found === undefined || !held.some((each) => each.projectId === projectId)) {
        return Promise.resolve(false);
      }
      const project = projects.get(projectId);
      if (project === undefined) throw new Error('memory space member disappeared');
      writeProject(projectId, project, null, null, stamp);
      bump(found);
      return Promise.resolve(true);
    },
    moveProject(organizationId, spaceId, projectId, afterProjectId, stamp) {
      const found = find(organizationId, spaceId);
      const current = ordered(spaceId);
      if (found === undefined || !current.some((each) => each.projectId === projectId)) {
        return Promise.resolve({ ok: false, reason: 'not_found' });
      }
      const group = current.filter((each) => each.projectId !== projectId);
      const position = place(spaceId, group, afterProjectId, stamp);
      if (position === null) return Promise.resolve({ ok: false, reason: 'not_found' });
      const project = projects.get(projectId);
      if (project === undefined) throw new Error('memory space member disappeared');
      writeProject(projectId, project, spaceId, position, stamp);
      bump(found);
      return Promise.resolve({ ok: true, position });
    },
  };
}
