import {
  occupancyByResource,
  type OccupancyHolder,
  type OccupancyScope,
  type OrganizationOccupancyRow,
} from '@wbs/domain';

import type { ClaimStore } from '../../ports/claim-store';
import type { DirectoryStore } from '../../ports/directory-store';
import type {
  ProjectReadAccess,
  ProjectReadOrigin,
  ResourceAccess,
} from '../../ports/organization-access';
import type { NamedOccupancyHolder } from './claims';

interface SharedShortage {
  readonly resourceId: string;
  readonly scope: OccupancyScope;
}

interface Holders {
  readonly holders: readonly OccupancyHolder[];
  readonly hiddenHolders: { readonly units: number };
}

/** One authorization decision per verified origin, for one actor and one observation. */
export function projectVisibility(
  reader: ProjectReadAccess,
  actorId: string,
  access: ResourceAccess,
) {
  const observed = new Map<string, { organizationId: string; readable: Promise<boolean> }>();
  return (origin: ProjectReadOrigin): Promise<boolean> => {
    const previous = observed.get(origin.id);
    if (previous !== undefined) {
      if (previous.organizationId !== origin.organizationId)
        throw new Error('inconsistent holder project ownership');
      return previous.readable;
    }
    const readable = reader.mayReadProjectWithin(origin, actorId, access).then((decision) => {
      if (typeof decision !== 'boolean') throw new Error('no project read decision');
      return decision;
    });
    observed.set(origin.id, { organizationId: origin.organizationId, readable });
    return readable;
  };
}

/** Only the first shared startable shortages or a claim's actual shared shortages load origin rows. */
export async function sharedHolders(
  authority: {
    readonly claims: Pick<ClaimStore, 'organizationOccupancyOf'>;
    readonly projects: ProjectReadAccess;
    readonly actorId: string;
    readonly access: ResourceAccess;
    readonly askingProject: string;
  },
  shortages: readonly SharedShortage[],
): Promise<(shortage: SharedShortage, askingLeaf: string) => Holders> {
  const ids = [...new Set(shortages.map((each) => each.resourceId))];
  const rows = ids.length === 0 ? [] : await authority.claims.organizationOccupancyOf(ids);
  const scope = new Map<string, Set<OccupancyScope>>();
  for (const shortage of shortages) {
    const needed = scope.get(shortage.resourceId) ?? new Set();
    needed.add(shortage.scope);
    scope.set(shortage.resourceId, needed);
  }
  const decide = projectVisibility(authority.projects, authority.actorId, authority.access);
  const groups = new Map<string, { row: OrganizationOccupancyRow; readable: boolean }[]>();
  for (const row of rows) {
    const needed = scope.get(row.resourceId);
    if (needed === undefined) throw new Error('holder read returned an unasked resource');
    if (!needed.has('organization') && row.projectId !== authority.askingProject) continue;
    const readable = await decide({ id: row.projectId, organizationId: row.organizationId });
    const group = groups.get(row.resourceId) ?? [];
    // Proof: unfiltered-holder exposed private-origin-person in the mounted refusal.
    group.push({ row, readable });
    groups.set(row.resourceId, group);
  }
  return ({ resourceId, scope: bound }, askingLeaf) => {
    const relevant = (groups.get(resourceId) ?? []).filter(
      ({ row }) =>
        row.workItemId !== askingLeaf &&
        (bound === 'organization' || row.projectId === authority.askingProject),
    );
    const visible = relevant.filter(({ readable }) => readable).map(({ row }) => row);
    const hidden = relevant.filter(({ readable }) => !readable).map(({ row }) => row);
    const origins = new Map(visible.map((row) => [row.workItemId, row.projectId]));
    return {
      holders: (occupancyByResource(visible).at(0)?.holders ?? []).map((holder) => {
        const projectId = origins.get(holder.workItemId);
        if (projectId === undefined) throw new Error('named holder has no verified project origin');
        return projectId === authority.askingProject ? holder : { ...holder, projectId };
        // Proof: double-count reported 32 instead of 16 for two claims on one denied leaf.
      }),
      hiddenHolders: { units: occupancyByResource(hidden).at(0)?.occupied ?? 0 },
    };
  };
}

/** Reads only visible holder ids, using organization-local names under scoped access. */
export async function readHolderNames(
  directory: Pick<DirectoryStore, 'personNamesInOrganization' | 'namesOf'>,
  access: ResourceAccess,
  ids: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  // Proof: the mounted fully denied claim records no name-port call even across two shortages.
  if (ids.length === 0) return new Map();
  const people =
    access.kind === 'scoped'
      ? await directory.personNamesInOrganization(access.scope.organizationId, ids)
      : await directory.namesOf('people', ids);
  return new Map(people.map(({ id, name }) => [id, name]));
}

/** A named projection has already excluded unreadable origins. Missing visible names are corrupt. */
export function nameOccupancyHolder(
  holder: OccupancyHolder,
  names: ReadonlyMap<string, string>,
): NamedOccupancyHolder {
  const name = names.get(holder.personId);
  if (name === undefined) throw new Error(`a claim on ${holder.workItemId} names an absent person`);
  return { ...holder, name };
}
