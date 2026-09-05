import { isIsoDate } from '@wbs/domain';
import { Elysia, t } from 'elysia';

import { callerGuard } from '../middleware/caller';
import type { AuthService } from '../service/auth.service';
import type {
  CalendarMarkerRefusal,
  CalendarMarkerService,
} from '../service/calendar-marker.service';
import { statusForRefusal } from './refusal-status';

/**
 * Built per controller, not per module: Elysia writes `additionalProperties`
 * into the schema object it is handed when the route's validator compiles, so a
 * module-level one is shared mutable state between apps — `step.controller.ts`
 * carries the same note and `auth.controller.ts` carries the failure that
 * taught it.
 */
const createBody = () =>
  t.Object({
    id: t.Optional(t.String()),
    date: t.String(),
    name: t.String(),
    color: t.Optional(t.Union([t.String(), t.Null()])),
  });

/**
 * One `PATCH` for both edits, with the body deciding which.
 *
 * Rename and recolour are one route because they are one resource's two
 * columns, and separating them would give the axis chip two URLs for "change
 * this marker". They still take body-specific branches inside it — which is
 * exactly why task 4.6's structural negative is injected on the **recolour**
 * branch specifically.
 */
const patchBody = () =>
  t.Object({
    name: t.Optional(t.String()),
    color: t.Optional(t.Union([t.String(), t.Null()])),
  });

/**
 * The marker routes' own default is **422**, and it is stated here because
 * `statusForRefusal(reason, otherwise)` takes each route's default as an
 * argument: `forbidden` is 403, `not_found` 404 and `taken` 409 through the
 * shared arms, and everything a marker route refuses on its own — a malformed
 * body, a date that is not an `IsoDate`, a fill under the contrast bar — is the
 * request itself being wrong rather than a conflict with the project as it
 * stands (spec.md's refusal table; task 4.5 tests it row by row).
 */
const statusFor = (reason: CalendarMarkerRefusal): number => statusForRefusal(reason, 422);

/**
 * A v4 UUID and nothing else (task 4.6a).
 *
 * The version nibble and the variant nibble are both pinned, because a v1 UUID
 * is the same length and the same alphabet — a shape check that only counted
 * hex digits and hyphens would accept one, and a v1 carries a MAC address and a
 * timestamp that a marker id has no business publishing.
 *
 * **This does not make the marker and work-item id spaces disjoint**, and
 * nothing does: task 4.4 lets a client name its own id, so it can name one a
 * `work_item` row already uses. What forbids a marker reaching work-item code
 * is route-family disjointness (task 4.6), not the shape of the id.
 */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** One row of the spec's refusal table: the code it answers with, and the field it blames. */
interface BodyProblem {
  reason: 'malformed';
  field: 'id' | 'date';
}

/**
 * What is wrong with a create body, or `null`.
 *
 * A **typed 4xx, never a throw.** An inbound body is untrusted data at the
 * boundary, which is the modelled path this repo's Elysia rule names; R5's
 * "malformed trusted data throws" governs data already inside the trust
 * boundary and does not reach here. Answering a client's malformed date with a
 * 500 blames the server for the client's mistake.
 *
 * Checked before the service is called at all, so a refused body writes
 * nothing — "refused" and "unchanged" are two claims, and the second is the one
 * a validate-after-write breaks.
 */
function createProblem(body: { id?: string; date: string }): BodyProblem | null {
  if (body.id !== undefined && !UUID_V4.test(body.id)) return { reason: 'malformed', field: 'id' };
  // `isIsoDate` rather than a regexp of this file's own: it rejects
  // `2026-02-31`, which matches the shape and is not a day, and it is what
  // `projectService.patch` already answers `startDate` against. A second
  // spelling would be a second rule free to disagree with the one the rest of
  // the API applies.
  if (!isIsoDate(body.date)) return { reason: 'malformed', field: 'date' };
  return null;
}

/**
 * A project's calendar markers.
 *
 * Its own controller rather than more routes on `projectController`, for
 * `stepController`'s reason: these write a list that belongs to a project and
 * the project routes write the project's own columns. The prefix is the same
 * because the resource is — a marker belongs to one project and is addressed
 * through it.
 *
 * Unlike the steps, the list has a **route of its own**: `GET
 * /api/projects/:id` answers with the plan a client schedules from, and markers
 * are drawn on the axis rather than scheduled. Slice 5 is the assertion that
 * they never enter that response at all, so reading them through it would be
 * the thing that slice refuses.
 */
export function calendarMarkerController(auth: AuthService, markers: CalendarMarkerService) {
  const signedIn = { caller: 'signed-in' } as const;
  return new Elysia({ prefix: '/api/projects' })
    .use(callerGuard(auth))
    .get(
      '/:id/calendar-markers',
      async ({ params, set }) => {
        const outcome = await markers.list(params.id);
        if (!outcome.ok) {
          set.status = statusFor(outcome.reason);
          return { error: outcome.reason };
        }
        return { markers: outcome.value };
      },
      signedIn,
    )
    .post(
      '/:id/calendar-markers',
      async ({ params, body, user, set }) => {
        const problem = createProblem(body);
        if (problem !== null) {
          set.status = 422;
          return { error: problem.reason, field: problem.field };
        }
        const outcome = await markers.create(params.id, user.id, body);
        if (!outcome.ok) {
          set.status = statusFor(outcome.reason);
          return { error: outcome.reason };
        }
        set.status = 201;
        return { marker: outcome.value };
      },
      { ...signedIn, body: createBody() },
    )
    .patch(
      '/:id/calendar-markers/:markerId',
      async ({ params, body, user, set }) => {
        // Exactly one of the two, and the refusal is the controller's own: a
        // body naming neither asks for no change, and a body naming both asks
        // for two writes the store applies one at a time — which is a partial
        // apply the moment the second refuses. Both are the request being
        // wrong, so both take the routes' 422 default.
        // Narrowed by two explicit arms rather than one flag apiece: a flag
        // pair leaves the compiler unable to see that the second branch has a
        // colour, and the assertion that papers over it is exactly what would
        // survive a body shape changing underneath.
        const { name, color } = body;
        let outcome;
        if (name !== undefined && color === undefined) {
          outcome = await markers.rename(params.id, params.markerId, user.id, name);
        } else if (color !== undefined && name === undefined) {
          outcome = await markers.recolor(params.id, params.markerId, user.id, color);
        } else {
          set.status = 422;
          return { error: 'malformed' as const, field: 'body' };
        }
        if (!outcome.ok) {
          set.status = statusFor(outcome.reason);
          return { error: outcome.reason };
        }
        return { marker: outcome.value };
      },
      { ...signedIn, body: patchBody() },
    )
    .delete(
      '/:id/calendar-markers/:markerId',
      async ({ params, user, set }) => {
        const outcome = await markers.remove(params.id, params.markerId, user.id);
        if (!outcome.ok) {
          set.status = statusFor(outcome.reason);
          return { error: outcome.reason };
        }
        set.status = 204;
        return null;
      },
      signedIn,
    );
}
