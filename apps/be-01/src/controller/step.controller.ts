import { Elysia, t } from 'elysia';

import { callerGuard } from '../middleware/caller';
import type { AuthService } from '../service/auth.service';
import type { RemoveStepOutcome, StepRefusal, StepService } from '../service/step.service';
import { statusForRefusal } from './refusal-status';

const named = t.Object({ name: t.String() });

/**
 * `taken` is 409 and a blank name is 422, the same split the rest of the API
 * makes: a duplicate name is a well-formed request that conflicts with the
 * project as it stands, and a name of spaces is the request itself being wrong.
 */
const statusFor = (reason: StepRefusal): number => statusForRefusal(reason, 422);

/**
 * A project's steps.
 *
 * Its own controller rather than more routes on `projectController`: these
 * write across a project's estimates and assignments, and the project routes
 * write the project's own columns. The prefix is the same because the resource
 * is — a step belongs to one project and is addressed through it.
 *
 * Reading the steps stays on `GET /api/projects/:id`, which already answers
 * with them. A second list route would be a second read of one fact, and
 * clients would drift over which one is current.
 */
export function stepController(auth: AuthService, steps: StepService) {
  const signedIn = { caller: 'signed-in' } as const;
  return new Elysia({ prefix: '/api/projects' })
    .use(callerGuard(auth))
    .post(
      '/:id/steps',
      async ({ params, body, user, set }) => {
        const outcome = await steps.add(params.id, user.id, body.name);
        if (!outcome.ok) {
          set.status = statusFor(outcome.reason);
          return { error: outcome.reason };
        }
        return { step: outcome.value };
      },
      { ...signedIn, body: named },
    )
    .patch(
      '/:id/steps/:stepId',
      async ({ params, body, user, set }) => {
        const outcome = await steps.rename(params.id, params.stepId, user.id, body.name);
        if (!outcome.ok) {
          set.status = statusFor(outcome.reason);
          return { error: outcome.reason };
        }
        return { step: outcome.value };
      },
      { ...signedIn, body: named },
    )
    .delete(
      '/:id/steps/:stepId',
      async ({ params, query, user, set }) => {
        // `?cascade=true` and nothing else. A query string is where the strategy
        // for deleting a work item lives, and the flag is the second, explicit
        // call rather than a body on a DELETE.
        const outcome: RemoveStepOutcome = await steps.remove(
          params.id,
          params.stepId,
          user.id,
          query['cascade'] === 'true',
        );
        if (!outcome.ok) {
          if (outcome.reason === 'in_use') {
            // 409, not 400: the request is well formed and would have worked
            // against a project where nothing pointed at this step. The counts
            // ride along because the next request is the same one with the flag,
            // and the person confirming has to know what they are agreeing to.
            set.status = 409;
            return { error: outcome.reason, inUse: outcome.inUse };
          }
          set.status = statusForRefusal(outcome.reason, 404);
          return { error: outcome.reason };
        }
        set.status = 204;
        return null;
      },
      signedIn,
    );
}
