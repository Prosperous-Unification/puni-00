import { Elysia, t } from 'elysia';

import { callerGuard } from '../middleware/caller';
import type { AuthService } from '../service/auth.service';
import type { ProjectService } from '../service/project.service';
import { canEdit } from '../service/project.service';
import type { SavedPlanService, SavedPlanTouchResult } from '../service/saved-plan.service';

/**
 * A function rather than a constant, for `project.controller.ts`'s reason:
 * Elysia writes `additionalProperties` into the schema object it compiles, so a
 * module-level literal is shared mutable state between every app in the process.
 */
const planName = () => t.Object({ name: t.String({ minLength: 1 }) });

/**
 * The status a `SavedPlanTouchResult` other than `touched` is answered with.
 *
 * `snapshot_busy` is **503 and not 409**, and the separation is the service's
 * own (`SavedPlanSaveOutcome`): a quota refusal is a fact about the project that
 * will still be true in a second, and a held write lock is a fact about this
 * instant that a retry may find gone. Folding them into one status would offer
 * "try again" to a project at its hundredth plan, or withhold it here.
 */
function statusForTouch(outcome: Exclude<SavedPlanTouchResult['outcome'], 'touched'>): number {
  if (outcome === 'forbidden') return 403;
  if (outcome === 'not_found') return 404;
  return 503;
}

/**
 * Save, list, read, rename and delete, over HTTP (task 6.1).
 *
 * **Two prefixes' worth of paths on one instance, deliberately.** A plan is
 * created and listed inside its project — `/api/projects/:id/saved-plans` — and
 * read, renamed and deleted by its own id, `/api/saved-plans/:id`. Repeating the
 * project id on the second three would let a caller name a project the plan does
 * not belong to and still be answered, which is a URL that lies about what it
 * addressed.
 *
 * **The first parameter is `:id` and not the `:projectId` that would read
 * better**, because the router refuses to build otherwise: `memoirist` keys a
 * parameter by its position, `projectController` already registered
 * `/api/projects/:id`, and a second name at that position throws at
 * `composeGeneralHandler` — a startup failure, not a 404. The name is therefore
 * the router's to choose, and only the JSDoc can say which id it is.
 *
 * **`projectController`'s authenticated-read / authorised-write split, with one
 * exception that is the whole point of this task.** Reading is open to every
 * authenticated account; saving is an ordinary project write and asks
 * {@link canEdit}. Rename and delete do **not**: on an unrestricted project
 * `canEdit` is true for every authenticated account, so the ordinary rule would
 * let anybody relabel or destroy somebody else's permanent record. Those two go
 * through {@link SavedPlanService.rename} and {@link SavedPlanService.delete},
 * which carry the creator-or-owner rule.
 *
 * **The saver's identity comes from the resolved caller and never from the
 * body.** `createdBy` is `user.username` — a display name, stored by value —
 * and `createdById` is `user.id`, the reference the permission rule reads. A
 * body-supplied creator would let any caller mint a record naming somebody else
 * and, worse, hand themselves the right to rename it.
 */
export function savedPlanController(
  auth: AuthService,
  plans: SavedPlanService,
  projects: ProjectService,
) {
  const signedIn = { caller: 'signed-in' } as const;
  return new Elysia({ prefix: '/api' })
    .use(callerGuard(auth))
    .post(
      '/projects/:id/saved-plans',
      async ({ params, body, user, set }) => {
        // The project is read here rather than left to the service, because
        // the service's `no_project` cannot tell "there is no such project"
        // from "you may not write to it" — it never learns who is asking.
        const found = await projects.read(params.id);
        if (found === null) {
          set.status = 404;
          return { error: 'not_found' };
        }
        if (!canEdit(found.project, user.id)) {
          set.status = 403;
          return { error: 'forbidden' };
        }
        const outcome = await plans.save({
          projectId: params.id,
          name: body.name,
          createdBy: user.username,
          createdById: user.id,
        });
        if (outcome.outcome === 'saved') {
          set.status = 201;
          return { savedPlan: outcome.record };
        }
        if (outcome.outcome === 'no_project') {
          // Reachable: the project can be deleted between the read above and
          // the capture. Answered as the truth a moment later, not as a 500.
          set.status = 404;
          return { error: 'not_found' };
        }
        if (outcome.outcome === 'snapshot_busy') {
          set.status = 503;
          return { error: 'snapshot_busy' };
        }
        set.status = 409;
        return { error: 'quota', refusal: outcome.refusal };
      },
      { ...signedIn, body: planName() },
    )
    .get(
      '/projects/:id/saved-plans',
      async ({ params, set }) => {
        // The project is read for one reason: an unknown project and a project
        // with no saved plans both list as `[]`, and a client cannot tell a
        // mistyped id from an empty shelf.
        const found = await projects.read(params.id);
        if (found === null) {
          set.status = 404;
          return { error: 'not_found' };
        }
        return { savedPlans: await plans.list(params.id) };
      },
      signedIn,
    )
    .get(
      '/saved-plans/:id',
      async ({ params, set }) => {
        const outcome = await plans.read(params.id);
        if (outcome.outcome === 'read') return { savedPlan: outcome.plan };
        if (outcome.outcome === 'not_found') {
          set.status = 404;
          return { error: 'not_found' };
        }
        // 422 and not 404, because the plan is there and has to stay visible
        // to be deleted; and not 409, whose meaning in `refusal-status.ts` is
        // "would have worked a moment earlier and may work again" — damaged
        // bytes will not repair themselves on a retry.
        set.status = 422;
        return { error: 'corrupt', refusal: outcome.refusal };
      },
      signedIn,
    )
    .patch(
      '/saved-plans/:id',
      async ({ params, body, user, set }) => {
        const outcome = await plans.rename(params.id, user.id, body.name);
        if (outcome.outcome === 'touched') return { savedPlanId: params.id, name: body.name };
        set.status = statusForTouch(outcome.outcome);
        return { error: outcome.outcome };
      },
      { ...signedIn, body: planName() },
    )
    .delete(
      '/saved-plans/:id',
      async ({ params, user, set }) => {
        const outcome = await plans.delete(params.id, user.id);
        if (outcome.outcome === 'touched') {
          set.status = 204;
          return null;
        }
        set.status = statusForTouch(outcome.outcome);
        return { error: outcome.outcome };
      },
      signedIn,
    );
}
