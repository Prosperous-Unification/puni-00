import { readSolution } from '@wbs/contracts';

import type { ProjectService } from '../module/project/project.resource';
import type { OrganizationAccess } from '../ports/organization-access';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/**
 * Resolves a solution slug through the caller's access: under scoped access a
 * project the organization does not own is `not_found` exactly as an absent
 * slug.
 * Proof: reading the slug unscoped made `answers a foreign solution slug as
 * an absent one` in `import-export-organization.controller.db.test.ts` answer
 * 200 with B's project; watched 2026-09-27.
 */
export function solutionRoutes(projects: ProjectService, organizations: OrganizationAccess) {
  return [
    bind(readSolution, async ({ params, principal }): Promise<HttpReply<typeof readSolution>> => {
      const resolved = await organizations.resolve(principal);
      if (!resolved.ok) return organizationRefusal(resolved.refusal);
      const found = await projects.readBySolutionSlugWithin(params.slug, resolved.access);
      return found === null
        ? { ok: false, status: 404, body: { error: 'not_found' } }
        : { ok: true, status: 200, body: found };
    }),
  ] as const;
}
