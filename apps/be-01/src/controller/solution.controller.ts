import { Elysia } from 'elysia';

import { callerGuard } from '../middleware/caller';
import type { AuthService } from '../service/auth.service';
import type { ProjectService } from '../service/project.service';

/**
 * Resolves the WBS plan owned by an external solution integration.
 *
 * `read-scope` rather than plain `signed-in`, and it is one of only two routes
 * that ask: this hands a whole plan to a machine caller by a slug it can guess
 * at, so an integration token has to have been granted `read` — see
 * {@link CallerRequirement}.
 */
export function solutionController(auth: AuthService, projects: ProjectService) {
  return new Elysia().use(callerGuard(auth)).get(
    '/plans/by-solution/:slug',
    async ({ params, set }) => {
      const found = await projects.readBySolutionSlug(params.slug);
      if (found === null) {
        set.status = 404;
        return { error: 'not_found' };
      }
      return found;
    },
    { caller: 'read-scope' },
  );
}
