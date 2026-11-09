import { moveProjectRank, readProjectRank } from '@wbs/contracts';
import type { Permission } from '@wbs/domain';

import type { OrganizationAccess } from '../ports/organization-access';
import type { ProjectRankRefusal, ProjectRankResource } from '../service/project-rank.resource';
import { bind } from './endpoint';
import { organizationRefusal } from './organization-refusal';

const REFUSED = {
  organization_required: { ok: false, status: 409, body: { error: 'organization_required' } },
  forbidden: { ok: false, status: 403, body: { error: 'forbidden' } },
  not_found: { ok: false, status: 404, body: { error: 'not_found' } },
} as const;

const refused = <R extends ProjectRankRefusal>(
  refusal: R,
  permission?: Permission,
): (typeof REFUSED)[R] => ({
  ...REFUSED[refusal],
  body: { ...REFUSED[refusal].body, ...(permission === undefined ? {} : { permission }) },
});

/**
 * The project rank routes. Organization access is resolved before anything
 * else; the resource owns the legacy, role and ownership rules.
 */
export function projectRankRoutes(ranks: ProjectRankResource, organizations: OrganizationAccess) {
  return [
    bind(readProjectRank, async ({ principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      const outcome = await ranks.read(principal.id, resolved.access);
      if ('authority' in outcome) return organizationRefusal(outcome.authority);
      return outcome.ok
        ? { ok: true, status: 200, body: { projects: outcome.projects } }
        : refused(outcome.refusal, outcome.permission);
    }),
    bind(moveProjectRank, async ({ params, body, principal }) => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved);
      const outcome = await ranks.move(
        principal,
        resolved.access,
        params.id,
        body.afterProjectId ?? null,
      );
      if ('authority' in outcome) return organizationRefusal(outcome.authority);
      return outcome.ok
        ? { ok: true, status: 200, body: { projects: outcome.projects } }
        : refused(outcome.refusal, outcome.permission);
    }),
  ] as const;
}
