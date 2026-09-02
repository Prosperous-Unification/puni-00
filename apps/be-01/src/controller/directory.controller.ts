import { Elysia } from 'elysia';

import { callerGuard } from '../middleware/caller';
import type { AuthService } from '../service/auth.service';
import type { DirectoryService } from '../service/directory.service';

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
 *
 * Every route here is a bare read behind {@link callerGuard} — the six of them
 * carried thirty lines of identical 401 block until 2026-09-02.
 */
export function directoryController(auth: AuthService, directory: DirectoryService) {
  const signedIn = { caller: 'signed-in' } as const;
  return new Elysia({ prefix: '/api' })
    .use(callerGuard(auth))
    .get('/teams', async () => ({ teams: await directory.listTeams() }), signedIn)
    .get('/people', async () => ({ people: await directory.listPeople() }), signedIn)
    .get('/tags', async () => ({ tags: await directory.listTags() }), signedIn)
    .get('/services', async () => ({ services: await directory.listServices() }), signedIn)
    .get(
      '/work-item-types',
      async () => ({ workItemTypes: await directory.listWorkItemTypes() }),
      signedIn,
    )
    .get(
      '/external-systems',
      async () => ({ externalSystems: await directory.listExternalSystems() }),
      signedIn,
    );
}
