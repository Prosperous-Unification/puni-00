import { Elysia, t } from 'elysia';

import { userFromHeaders } from '../middleware/authenticated';
import type { AuthService } from '../service/auth.service';
import type { DirectoryService } from '../service/directory.service';

const named = t.Object({ name: t.String() });
const newPerson = t.Object({ name: t.String(), teamIds: t.Optional(t.Array(t.String())) });

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
    );
}
