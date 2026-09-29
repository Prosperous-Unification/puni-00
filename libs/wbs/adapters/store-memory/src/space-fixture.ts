import type { MembershipWritten, Space, SpaceMember, SpaceStore } from '@wbs/core';
import { placeAfter } from '@wbs/domain';

/**
 * A {@link SpaceStore} over Maps, held to the same `spaceStoreConformance`
 * cases as `SpaceRepository`.
 *
 * `owners` maps each project id to its owning organization, as
 * `project_organization` holds it; a project missing from it is owned by no
 * organization and answers `not_found`, which is the composite reference's
 * refusal in SQLite. `legacyOrganizationId` is the organization marked
 * legacy, or null for none. What it does not model is a project deleted underneath a
 * membership: this fixture holds no projects to delete.
 */
export function inMemorySpaces(
  owners: ReadonlyMap<string, string>,
  legacyOrganizationId: string | null = null,
): SpaceStore {
  const spaces = new Map<string, Space>();
  const members = new Map<string, SpaceMember[]>();

  const find = (organizationId: string, spaceId: string): Space | undefined => {
    const found = spaces.get(spaceId);
    return found?.organizationId === organizationId ? found : undefined;
  };
  const nameTaken = (organizationId: string, name: string, except?: string) =>
    [...spaces.values()].some(
      (each) => each.organizationId === organizationId && each.name === name && each.id !== except,
    );
  const ordered = (spaceId: string): SpaceMember[] =>
    [...(members.get(spaceId) ?? [])]
      .sort(
        (a, b) =>
          a.position - b.position ||
          (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0),
      )
      .map((each) => ({ ...each }));
  const bump = (found: Space) => {
    spaces.set(found.id, { ...found, revision: found.revision + 1 });
  };
  /** Mirrors `SpaceRepository`'s `place`: null when the anchor is a stranger. */
  const place = (
    spaceId: string,
    group: readonly SpaceMember[],
    afterProjectId: string | null,
  ): number | null => {
    if (afterProjectId !== null && !group.some(({ projectId }) => projectId === afterProjectId)) {
      return null;
    }
    const placement = placeAfter(
      group.map(({ projectId, position }) => ({ id: projectId, position })),
      afterProjectId,
    );
    const renumbered = new Map(placement.renumbered.map(({ id, position }) => [id, position]));
    members.set(
      spaceId,
      (members.get(spaceId) ?? []).map((each) => ({
        ...each,
        position: renumbered.get(each.projectId) ?? each.position,
      })),
    );
    return placement.position;
  };

  return {
    legacyOrganizationId() {
      return Promise.resolve(legacyOrganizationId);
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
    create(fresh, stamp) {
      if (nameTaken(fresh.organizationId, fresh.name)) {
        return Promise.resolve({ ok: false, reason: 'name_taken' });
      }
      const row: Space = { ...fresh, revision: 0, createdBy: stamp.by, createdAt: stamp.at };
      spaces.set(row.id, row);
      members.set(row.id, []);
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
    remove(organizationId, spaceId) {
      if (find(organizationId, spaceId) === undefined) return Promise.resolve(false);
      spaces.delete(spaceId);
      members.delete(spaceId);
      return Promise.resolve(true);
    },
    addProject(organizationId, spaceId, projectId, afterProjectId) {
      const found = find(organizationId, spaceId);
      const refuse = (reason: 'not_found' | 'already_in_space'): Promise<MembershipWritten> =>
        Promise.resolve({ ok: false, reason });
      // Proof, observed 2026-09-29: with the owner comparison dropped,
      // `refuses a project another organization owns, storing nothing` failed
      // on `Expected - 2 / Received + 2` (a stored `b1`).
      if (found === undefined || owners.get(projectId) !== organizationId) {
        return refuse('not_found');
      }
      const group = ordered(spaceId);
      if (group.some((each) => each.projectId === projectId)) return refuse('already_in_space');
      const position = place(spaceId, group, afterProjectId);
      if (position === null) return refuse('not_found');
      members.set(spaceId, [...(members.get(spaceId) ?? []), { projectId, position }]);
      bump(found);
      return Promise.resolve({ ok: true, position });
    },
    removeProject(organizationId, spaceId, projectId) {
      const found = find(organizationId, spaceId);
      const held = members.get(spaceId) ?? [];
      if (found === undefined || !held.some((each) => each.projectId === projectId)) {
        return Promise.resolve(false);
      }
      members.set(
        spaceId,
        held.filter((each) => each.projectId !== projectId),
      );
      bump(found);
      return Promise.resolve(true);
    },
    moveProject(organizationId, spaceId, projectId, afterProjectId) {
      const found = find(organizationId, spaceId);
      const current = ordered(spaceId);
      if (found === undefined || !current.some((each) => each.projectId === projectId)) {
        return Promise.resolve({ ok: false, reason: 'not_found' });
      }
      const group = current.filter((each) => each.projectId !== projectId);
      const position = place(spaceId, group, afterProjectId);
      if (position === null) return Promise.resolve({ ok: false, reason: 'not_found' });
      members.set(
        spaceId,
        (members.get(spaceId) ?? []).map((each) =>
          each.projectId === projectId ? { projectId, position } : each,
        ),
      );
      bump(found);
      return Promise.resolve({ ok: true, position });
    },
  };
}
