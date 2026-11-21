import type { AuthenticatedUser } from '@wbs/contracts';
import {
  addSpaceProject,
  createSpace,
  listSpaces,
  moveSpaceProject,
  readSpace,
  readSpaceInProgress,
  readSpaceRollUps,
  removeSpace,
  removeSpaceProject,
  renameSpace,
} from '@wbs/contracts';
import type { Permission } from '@wbs/domain';

import type { RefusedOrganizationAccess, ResourceAccess } from '../ports/organization-access';
import type { OrganizationAccess } from '../ports/organization-access';
import {
  IN_PROGRESS_LIMIT,
  ROLL_UPS_PER_REQUEST,
  type SpaceRefusal,
  type SpaceResource,
} from '../service/space.resource';
import { bind, EMPTY } from './endpoint';
import { organizationRefusal } from './organization-refusal';
import type { RecoveryWriteBoundary } from './recovery-write';

/** Each refusal word paired with its status and body, once. */
const REFUSED = {
  organization_required: { ok: false, status: 409, body: { error: 'organization_required' } },
  forbidden: { ok: false, status: 403, body: { error: 'forbidden' } },
  not_found: { ok: false, status: 404, body: { error: 'not_found' } },
  name_taken: { ok: false, status: 409, body: { error: 'name_taken' } },
  already_in_space: { ok: false, status: 409, body: { error: 'already_in_space' } },
  virtual_space: { ok: false, status: 409, body: { error: 'virtual_space' } },
  malformed_name: { ok: false, status: 422, body: { error: 'malformed', field: 'name' } },
} as const;

/**
 * The distinct ids of a `projectIds` query, or null when it names none or more
 * than {@link ROLL_UPS_PER_REQUEST}: a typed 400 before anything is computed.
 *
 * Proof, observed 2026-09-29: with the limit check removed, `refuses 51
 * project ids with 400 and computes nothing` in
 * `space-organization.controller.db.test.ts` received 404 instead of 400.
 */
function projectIdsOf(query: string): string[] | null {
  const ids = [...new Set(query.split(',').filter((id) => id !== ''))];
  return ids.length === 0 || ids.length > ROLL_UPS_PER_REQUEST ? null : ids;
}

/**
 * The `limit` of an in-progress read: absent is the default, a whole number
 * from 1 to the maximum is itself, anything else is null (a typed 400).
 *
 * Proof, observed 2026-09-29: with the maximum check removed, `lists work in
 * progress across the space and refuses a limit above 1000 with 400` in
 * `space-organization.controller.db.test.ts` received 200 instead of 400 for
 * `limit=1001`.
 */
function limitOf(query: string | undefined): number | null {
  if (query === undefined) return IN_PROGRESS_LIMIT.default;
  // Digits only, leading zeros allowed: `010` is the whole number 10.
  if (!/^[0-9]{1,7}$/.test(query)) return null;
  const limit = Number(query);
  return limit < 1 || limit > IN_PROGRESS_LIMIT.max ? null : limit;
}

/** Narrowed by the refusals the calling method can answer, so each route declares only those. */
const refused = <R extends SpaceRefusal>(
  refusal: R,
  permission?: Permission,
): (typeof REFUSED)[R] => ({
  ...REFUSED[refusal],
  body: { ...REFUSED[refusal].body, ...(permission === undefined ? {} : { permission }) },
});

/**
 * The space routes (`add-spaces`, slice 2). Every route resolves organization
 * access before anything else; the service owns the owner, role, virtual-space
 * and leak rules. Membership edits are not plan commands: no journal, no undo.
 */
export function spaceRoutes(
  spaces: SpaceResource,
  organizations: OrganizationAccess,
  boundary: Pick<RecoveryWriteBoundary, 'uow' | 'commandAccess'>,
) {
  const write = async <T extends { readonly ok: boolean }>(
    actor: AuthenticatedUser,
    expectedAccess: ResourceAccess,
    act: (writer: SpaceResource, access: ResourceAccess, actorId: string) => Promise<T>,
  ): Promise<T | { readonly ok: false; readonly authority: RefusedOrganizationAccess }> => {
    actor = structuredClone(actor);
    expectedAccess = structuredClone(expectedAccess);
    return boundary.uow.run<
      T | { readonly ok: false; readonly authority: RefusedOrganizationAccess }
    >(async (scope) => {
      const resolved = await boundary.commandAccess.resolve({
        kind: 'human',
        principal: actor,
        expectedAccess,
      });
      if (!resolved.ok) return { commit: false, value: { ok: false, authority: resolved } };
      // Proof: space-actor-coherence fault failed 'mismatched space.*before grant reads' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
      if (
        resolved.access.kind === 'scoped' &&
        (resolved.access.scope.userId !== actor.id || resolved.access.principal.id !== actor.id)
      )
        throw new Error('space principal differs from its acting account');
      const borrowed = scope.stores.spaces;
      // Proof: space-no-public-fallback fault failed 'real space route closed when the admitted spaces' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
      if (borrowed === undefined) throw new Error('space writer lacks its borrowed store');
      // Proof: space-no-default-grants fault failed 'real space route closed when the admitted accessDecisions' (command-permission.controller.db.test.ts); restored GREEN, 2026-11-09.
      const outcome = await act(
        spaces.over(borrowed, scope.stores.accessDecisions),
        resolved.access,
        actor.id,
      );
      return { commit: outcome.ok, value: outcome };
    });
  };
  return [
    bind(listSpaces, async ({ principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      const outcome = await spaces.list(principal.id, resolved.access);
      return outcome.ok
        ? {
            ok: true,
            status: 200,
            body: { spaces: outcome.value, writable: await spaces.mayWrite(resolved.access) },
          }
        : refused(outcome.refusal, outcome.permission);
    }),
    bind(createSpace, async ({ body, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      const outcome = await write(principal, resolved.access, (writer, access, actorId) =>
        writer.create(actorId, access, body.name),
      );
      if ('authority' in outcome) return organizationRefusal(outcome.authority);
      return outcome.ok
        ? { ok: true, status: 201, body: { space: outcome.value } }
        : refused(outcome.refusal, outcome.permission);
    }),
    bind(readSpace, async ({ params, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      const outcome = await spaces.read(principal.id, resolved.access, params.id);
      return outcome.ok
        ? {
            ok: true,
            status: 200,
            body: {
              ...outcome.value,
              writable: !outcome.value.space.virtual && (await spaces.mayWrite(resolved.access)),
            },
          }
        : refused(outcome.refusal, outcome.permission);
    }),
    bind(readSpaceRollUps, async ({ params, query, principal }) => {
      const projectIds = projectIdsOf(query.projectIds);
      if (projectIds === null) return { ok: false, status: 400, body: { error: 'invalid_query' } };
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      const outcome = await spaces.rollUps(principal.id, resolved.access, params.id, projectIds);
      if ('kind' in outcome) return organizationRefusal(outcome.refusal);
      return outcome.ok
        ? { ok: true, status: 200, body: { rollUps: outcome.value } }
        : refused(outcome.refusal, outcome.permission);
    }),
    bind(readSpaceInProgress, async ({ params, query, principal }) => {
      const limit = limitOf(query.limit);
      if (limit === null) return { ok: false, status: 400, body: { error: 'invalid_query' } };
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      const outcome = await spaces.inProgress(principal.id, resolved.access, params.id, limit);
      if ('kind' in outcome) return organizationRefusal(outcome.refusal);
      return outcome.ok
        ? { ok: true, status: 200, body: outcome.value }
        : refused(outcome.refusal, outcome.permission);
    }),
    bind(renameSpace, async ({ params, body, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      const outcome = await write(principal, resolved.access, (writer, access, actorId) =>
        writer.rename(actorId, access, params.id, body.name),
      );
      if ('authority' in outcome) return organizationRefusal(outcome.authority);
      return outcome.ok
        ? { ok: true, status: 200, body: { space: outcome.value } }
        : refused(outcome.refusal, outcome.permission);
    }),
    bind(removeSpace, async ({ params, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      const outcome = await write(principal, resolved.access, (writer, access) =>
        writer.remove(access, params.id),
      );
      if ('authority' in outcome) return organizationRefusal(outcome.authority);
      return outcome.ok
        ? { ok: true, status: 204, body: EMPTY }
        : refused(outcome.refusal, outcome.permission);
    }),
    bind(addSpaceProject, async ({ params, body, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      const outcome = await write(principal, resolved.access, (writer, access, actorId) =>
        writer.addProject(actorId, access, params.id, body.projectId, body.afterProjectId ?? null),
      );
      if ('authority' in outcome) return organizationRefusal(outcome.authority);
      return outcome.ok
        ? { ok: true, status: 201, body: { position: outcome.value } }
        : refused(outcome.refusal, outcome.permission);
    }),
    bind(removeSpaceProject, async ({ params, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      const outcome = await write(principal, resolved.access, (writer, access, actorId) =>
        writer.removeProject(actorId, access, params.id, params.projectId),
      );
      if ('authority' in outcome) return organizationRefusal(outcome.authority);
      return outcome.ok
        ? { ok: true, status: 204, body: EMPTY }
        : refused(outcome.refusal, outcome.permission);
    }),
    bind(moveSpaceProject, async ({ params, body, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      const outcome = await write(principal, resolved.access, (writer, access, actorId) =>
        writer.moveProject(
          actorId,
          access,
          params.id,
          params.projectId,
          body.afterProjectId ?? null,
        ),
      );
      if ('authority' in outcome) return organizationRefusal(outcome.authority);
      return outcome.ok
        ? { ok: true, status: 200, body: { position: outcome.value } }
        : refused(outcome.refusal, outcome.permission);
    }),
  ] as const;
}
