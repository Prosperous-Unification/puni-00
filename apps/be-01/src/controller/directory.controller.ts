import { Elysia, t } from 'elysia';

import { userFromHeaders } from '../middleware/authenticated';
import type { AuthService } from '../service/auth.service';
import type { DirectoryRefusal, DirectoryService } from '../service/directory.service';

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
        const person = await directory.addPerson(body.name, body.teamIds ?? []);
        if (person === null) {
          set.status = 422;
          return { error: 'name_required' };
        }
        return { person };
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
    );
}
