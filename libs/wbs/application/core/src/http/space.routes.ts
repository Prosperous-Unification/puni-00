import {
  addSpaceProject,
  createSpace,
  listSpaces,
  moveSpaceProject,
  readSpace,
  removeSpace,
  removeSpaceProject,
  renameSpace,
} from '@wbs/contracts';

import type { OrganizationAccess } from '../ports/organization-access';
import type { SpaceRefusal, SpaceService } from '../service/space.service';
import { bind, EMPTY } from './endpoint';
import { organizationRefusal } from './organization-refusal';

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

/** Narrowed by the refusals the calling method can answer, so each route declares only those. */
const refused = <R extends SpaceRefusal>(refusal: R): (typeof REFUSED)[R] => REFUSED[refusal];

/**
 * The space routes (`add-spaces`, slice 2). Every route resolves organization
 * access before anything else; the service owns the owner, role, virtual-space
 * and leak rules. Membership edits are not plan commands: no journal, no undo.
 */
export function spaceRoutes(spaces: SpaceService, organizations: OrganizationAccess) {
  return [
    bind(listSpaces, async ({ principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      const outcome = await spaces.list(principal.id, resolved.access);
      return outcome.ok
        ? { ok: true, status: 200, body: { spaces: outcome.value } }
        : refused(outcome.refusal);
    }),
    bind(createSpace, async ({ body, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      const outcome = await spaces.create(principal.id, resolved.access, body.name);
      return outcome.ok
        ? { ok: true, status: 201, body: { space: outcome.value } }
        : refused(outcome.refusal);
    }),
    bind(readSpace, async ({ params, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      const outcome = await spaces.read(principal.id, resolved.access, params.id);
      return outcome.ok ? { ok: true, status: 200, body: outcome.value } : refused(outcome.refusal);
    }),
    bind(renameSpace, async ({ params, body, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      const outcome = await spaces.rename(principal.id, resolved.access, params.id, body.name);
      return outcome.ok
        ? { ok: true, status: 200, body: { space: outcome.value } }
        : refused(outcome.refusal);
    }),
    bind(removeSpace, async ({ params, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      const outcome = await spaces.remove(resolved.access, params.id);
      return outcome.ok ? { ok: true, status: 204, body: EMPTY } : refused(outcome.refusal);
    }),
    bind(addSpaceProject, async ({ params, body, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      const outcome = await spaces.addProject(
        principal.id,
        resolved.access,
        params.id,
        body.projectId,
        body.afterProjectId ?? null,
      );
      return outcome.ok
        ? { ok: true, status: 201, body: { position: outcome.value } }
        : refused(outcome.refusal);
    }),
    bind(removeSpaceProject, async ({ params, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      const outcome = await spaces.removeProject(
        principal.id,
        resolved.access,
        params.id,
        params.projectId,
      );
      return outcome.ok ? { ok: true, status: 204, body: EMPTY } : refused(outcome.refusal);
    }),
    bind(moveSpaceProject, async ({ params, body, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      const outcome = await spaces.moveProject(
        principal.id,
        resolved.access,
        params.id,
        params.projectId,
        body.afterProjectId ?? null,
      );
      return outcome.ok
        ? { ok: true, status: 200, body: { position: outcome.value } }
        : refused(outcome.refusal);
    }),
  ] as const;
}
