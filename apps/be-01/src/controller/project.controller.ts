import { Elysia, t } from 'elysia';

import { userFromHeaders } from '../middleware/authenticated';
import type { AuthService } from '../service/auth.service';
import type { ProjectService } from '../service/project.service';

/** Types only, for the same reason as authController: rules live in the service. */
const newProject = t.Object({ name: t.String() });
const projectPatch = t.Object({
  name: t.Optional(t.String()),
  restricted: t.Optional(t.Boolean()),
});

/**
 * Reading is open to every authenticated account and writing is not, so
 * authentication is checked on every route and *authorisation* only on the ones
 * that write. `ProjectService.update` owns that second check — the controller
 * translates its refusal into a status rather than deciding anything itself,
 * which keeps one copy of the rule for the mutations still to come.
 */
export function projectController(auth: AuthService, projects: ProjectService) {
  return new Elysia({ prefix: '/api/projects' })
    .post(
      '/',
      async ({ body, headers, set }) => {
        const user = await userFromHeaders(auth, headers);
        if (user === null) {
          set.status = 401;
          return { error: 'unauthenticated' };
        }
        return projects.create(body.name, user.id);
      },
      { body: newProject },
    )
    .get('/', async ({ headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      return { projects: await projects.list(user.id) };
    })
    .post('/:id/opened', async ({ params, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      // No authorisation check beyond authentication: this is the caller's own
      // navigation history, and every account may already read every project.
      // See `ProjectService.open`.
      const recorded = await projects.open(params.id, user.id);
      if (!recorded) {
        set.status = 404;
        return { error: 'not_found' };
      }
      set.status = 204;
      return null;
    })
    .get('/:id', async ({ params, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      const found = await projects.read(params.id);
      if (found === null) {
        set.status = 404;
        return { error: 'not_found' };
      }
      return found;
    })
    .patch(
      '/:id',
      async ({ params, body, headers, set }) => {
        const user = await userFromHeaders(auth, headers);
        if (user === null) {
          set.status = 401;
          return { error: 'unauthenticated' };
        }
        const outcome = await projects.update(params.id, user.id, body);
        if (!outcome.ok) {
          // 403 rather than 404 for a restricted project: the caller may read
          // it, so pretending it is absent would contradict the next GET.
          set.status = outcome.reason === 'forbidden' ? 403 : 404;
          return { error: outcome.reason };
        }
        return { project: outcome.result };
      },
      { body: projectPatch },
    );
}
