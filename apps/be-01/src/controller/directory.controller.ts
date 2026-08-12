import { Elysia, t } from 'elysia';

import { userFromHeaders } from '../middleware/authenticated';
import type { AuthService } from '../service/auth.service';
import type {
  DirectoryRefusal,
  DirectoryService,
  RemoveDirectoryOutcome,
} from '../service/directory.service';

const named = t.Object({ name: t.String() });
const newPerson = t.Object({ name: t.String(), teamIds: t.Optional(t.Array(t.String())) });

/**
 * Both fields optional, and the service refuses the patch that names neither.
 *
 * Elysia could refuse an empty body here, but the refusal a client acts on has
 * to be the same one whether the body was `{}` or `{ name: undefined }`, and
 * only the service sees both as the same thing.
 */
const personPatch = t.Object({
  name: t.Optional(t.String()),
  teamIds: t.Optional(t.Array(t.String())),
});

/**
 * `taken` is 409 and a blank or absent name is 422, the same split
 * `roleController` makes: a duplicate name is a well-formed request that
 * conflicts with the directory as it stands, and a name of spaces is the
 * request itself being wrong.
 *
 * `unknown_team` joins `not_found` on 404, as `unknown_role` already does on
 * the work item routes: an id the directory no longer holds is a thing that is
 * not there, whichever of the request's ids named it.
 */
const statusFor = (reason: DirectoryRefusal): number =>
  reason === 'not_found' || reason === 'unknown_team' ? 404 : 422;

/**
 * How many of a team may be at work at once, or `null` for unstated.
 *
 * A **route of its own**, hand-parsing its body, rather than a second optional
 * field on the rename above. Two reasons, both about the refusal rather than
 * about REST: the rename validates through an Elysia schema, which answers its
 * own 422 for a body of the wrong shape, and this field's refusals have to be
 * named 400s a client can branch on — `0`, `-1`, `1.5`, `'3'` and `1001` are
 * each a different mistake and none of them is "the body is not an object".
 * Elysia also strips unknown properties before a handler runs, so a `size`
 * checked after `{ body: … }` would never see one it had not been told about.
 * It is `workItemController`'s reasoning, applied to the one route here that
 * needs it.
 *
 * The floor of 1 is the load-bearing half. A team of 0 is a pool of no slots,
 * and the engine's duration is `effort / width` with `width` clamped to the
 * pool — so a mistyped 0 is a plan of `Infinity` dates with nothing on screen
 * to say why. The ceiling of 1000 is a product limit and is honest about being
 * one; its negative is `1001`, because `1e999` is `Infinity` and the integer
 * guard already refuses that — a range check probed with `1e999` alone would
 * be a check that cannot fail.
 */
const MOST_PEOPLE_AT_ONCE = 1000;

class BadSize extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

/**
 * Proof: the integer guard deleted and `refuses a size that is not a whole
 * number of 1 or more` failed on the first value — `[200, "0"]` where
 * `[400, "0"]` was owed, a team of no slots taken and written. The ceiling
 * deleted on its own, with the integer guard left in place, and `refuses a size
 * above what a team can mean` failed with `status: 200` and the row coming back
 * `size: 1001`. Both watched 2026-08-12, and injected separately because
 * neither probe can see the other's line.
 */
function sizeOf(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) throw new BadSize('expected_object');
  const raw = body as Record<string, unknown>;
  // Absent and `null` are **not** the same request here, unlike a work item
  // patch: this route writes one field, so an absent `size` is a body that
  // says nothing at all rather than a field left alone.
  if (!('size' in raw)) throw new BadSize('size_required');
  const value = raw['size'];
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new BadSize('size_must_be_a_whole_number_from_1');
  }
  if (value > MOST_PEOPLE_AT_ONCE) {
    throw new BadSize(`size_must_be_at_most_${String(MOST_PEOPLE_AT_ONCE)}`);
  }
  return value;
}

/**
 * `?cascade=true` and nothing else — the same flag `roleController`'s delete
 * takes, and the second, explicit call rather than a body on a DELETE.
 */
const isCascade = (query: Record<string, string | undefined>): boolean =>
  query['cascade'] === 'true';

/**
 * How a removal answers, in one place because the two delete routes must answer
 * identically — a client that had to branch on which of a person and a team it
 * had asked about would drift.
 *
 * 409, not 400: the request is well formed and would have worked against a
 * directory nothing pointed into. The **directory usage** rides along because
 * the next request is the same one with the flag, and the person confirming has
 * to know what they are agreeing to.
 */
function answerRemoval(outcome: RemoveDirectoryOutcome, set: { status?: number | string }) {
  if (!outcome.ok) {
    if (outcome.reason === 'in_use') {
      set.status = 409;
      return { error: outcome.reason, usage: outcome.usage };
    }
    set.status = 404;
    return { error: outcome.reason };
  }
  set.status = 204;
  return null;
}

/**
 * Teams and people: global, readable and writable by any authenticated
 * account.
 *
 * Not gated by project write access, because the directory belongs to no
 * project — Dany, 2026-08-06: "the list is global for all projects, anyone can
 * add one". Gating it on a project would mean a reader who may not edit
 * project A could not name a team while working in project B.
 *
 * Adding is idempotent by name, so the picker's "type it if it is not in the
 * list" cannot make two `Platform`s.
 */
export function directoryController(auth: AuthService, directory: DirectoryService) {
  return new Elysia({ prefix: '/api' })
    .onError(({ error, set }) => {
      if (error instanceof BadSize) {
        set.status = 400;
        return { error: error.reason };
      }
      return undefined;
    })
    .get('/teams', async ({ headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      return { teams: await directory.listTeams() };
    })
    .post(
      '/teams',
      async ({ body, headers, set }) => {
        const user = await userFromHeaders(auth, headers);
        if (user === null) {
          set.status = 401;
          return { error: 'unauthenticated' };
        }
        const team = await directory.addTeam(body.name);
        if (team === null) {
          // A team called nothing helps nobody find anything, and it would sit
          // in every picker for ever.
          set.status = 422;
          return { error: 'name_required' };
        }
        return { team };
      },
      { body: named },
    )
    .patch(
      '/teams/:id',
      async ({ params, body, headers, set }) => {
        const user = await userFromHeaders(auth, headers);
        if (user === null) {
          set.status = 401;
          return { error: 'unauthenticated' };
        }
        const outcome = await directory.renameTeam(params.id, body.name);
        if (!outcome.ok) {
          if (outcome.reason === 'taken') {
            // The surviving name rides along because the caller has to say
            // which `Platform` is on screen now, and a bare 409 cannot.
            set.status = 409;
            return { error: outcome.reason, name: outcome.name };
          }
          set.status = statusFor(outcome.reason);
          return { error: outcome.reason };
        }
        return { team: outcome.result };
      },
      { body: named },
    )
    .patch('/teams/:id/size', async ({ params, body, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      const outcome = await directory.resizeTeam(params.id, sizeOf(body));
      if (!outcome.ok) {
        set.status = statusFor(outcome.reason === 'taken' ? 'not_found' : outcome.reason);
        return { error: outcome.reason };
      }
      return { team: outcome.result };
    })
    .get('/people', async ({ headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      return { people: await directory.listPeople() };
    })
    .post(
      '/people',
      async ({ body, headers, set }) => {
        const user = await userFromHeaders(auth, headers);
        if (user === null) {
          set.status = 401;
          return { error: 'unauthenticated' };
        }
        // No teams is a free agent, which is the absence of memberships rather
        // than membership of a magic row.
        const outcome = await directory.addPerson(body.name, body.teamIds ?? []);
        if (!outcome.ok) {
          // `taken` cannot arrive here — adding is idempotent by name — but the
          // outcome type carries it, and answering the same 409 the patch does
          // is the only honest thing to do with it.
          if (outcome.reason === 'taken') {
            set.status = 409;
            return { error: outcome.reason, name: outcome.name };
          }
          set.status = statusFor(outcome.reason);
          return { error: outcome.reason };
        }
        return { person: outcome.result };
      },
      { body: newPerson },
    )
    .patch(
      '/people/:id',
      async ({ params, body, headers, set }) => {
        const user = await userFromHeaders(auth, headers);
        if (user === null) {
          set.status = 401;
          return { error: 'unauthenticated' };
        }
        // Spread rather than passed whole: an absent `teamIds` leaves the
        // memberships alone and an empty one makes a free agent, and
        // `{ teamIds: undefined }` would have to be told apart from the
        // absence by every layer below.
        const outcome = await directory.patchPerson(params.id, {
          ...(body.name === undefined ? {} : { name: body.name }),
          ...(body.teamIds === undefined ? {} : { teamIds: body.teamIds }),
        });
        if (!outcome.ok) {
          if (outcome.reason === 'taken') {
            set.status = 409;
            return { error: outcome.reason, name: outcome.name };
          }
          set.status = statusFor(outcome.reason);
          return { error: outcome.reason };
        }
        return { person: outcome.result };
      },
      { body: personPatch },
    )
    .delete('/people/:id', async ({ params, query, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      return answerRemoval(await directory.removePerson(params.id, isCascade(query)), set);
    })
    .delete('/teams/:id', async ({ params, query, headers, set }) => {
      const user = await userFromHeaders(auth, headers);
      if (user === null) {
        set.status = 401;
        return { error: 'unauthenticated' };
      }
      return answerRemoval(await directory.removeTeam(params.id, isCascade(query)), set);
    });
}
