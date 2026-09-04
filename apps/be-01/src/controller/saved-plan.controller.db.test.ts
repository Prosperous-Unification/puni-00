import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { buildApp } from '../app';
import { openConnection } from '../repository/db';
import { runMigrations } from '../repository/migrate';
import { ProjectRepository } from '../repository/project';
import { UserRepository } from '../repository/user';
import { AuthService } from '../service/auth.service';
import { ProjectService } from '../service/project.service';
import { TEST_JWT_KEY } from '../testing/auth-fixture';
import { testCapacityService } from '../testing/capacity-fixture';
import { testDirectoryService } from '../testing/directory-fixture';
import { testHistoryService } from '../testing/history-fixture';
import { testPriorityBandService } from '../testing/priority-band-fixture';
import { testReplay } from '../testing/replay-fixture';
import { savedPlanServiceOn } from '../testing/saved-plan-fixture';
import { testStepService } from '../testing/step-fixture';
import { testWorkItemService } from '../testing/work-item-fixture';
import { testWrites } from '../testing/writes-fixture';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

/**
 * The five saved-plan routes, over HTTP and against real SQLite (task 6.1).
 *
 * Real SQLite rather than this folder's usual in-memory doubles, and not by
 * preference: a saved plan is captured **from the database** on a second
 * connection, so there is no store to substitute — a Map-backed stand-in would
 * be a different thing rather than a smaller one.
 *
 * Three accounts, registered through `/api/auth/register` so the token names an
 * identity `userFromHeaders` really resolves: `owner` owns the project, `ada`
 * saves the plans, `mallory` is the third party. Two accounts cannot separate
 * the rule under test from its wrong versions — see
 * `service/saved-plan-touch.db.test.ts`, which proves the rule itself. What is
 * proved **here** is the part only a request can reach: the statuses, and that
 * the stored creator is the caller rather than anything a body said.
 */
describe('the saved-plan routes', () => {
  let dir: string;
  let app: ReturnType<typeof buildApp>;
  let tokens: Record<string, string>;
  let projectId: string;

  /**
   * One authenticated request. `headers` is set rather than merged: every
   * caller here wants exactly these two, and `RequestInit['headers']` may be an
   * array of pairs, which spreading into an object turns into indices.
   */
  const as = (token: string, path: string, init: Omit<RequestInit, 'headers'> = {}) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
      }),
    );

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-saved-plan-http-'));
    const path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const connection = openConnection(path);
    const projects = new ProjectRepository(connection.db);

    app = buildApp({
      auth: new AuthService({ users: new UserRepository(connection.db), jwtKey: TEST_JWT_KEY }),
      projects: new ProjectService({ projects }),
      savedPlans: savedPlanServiceOn(path),
      steps: testStepService(),
      workItems: testWorkItemService(),
      directory: testDirectoryService(),
      capacity: testCapacityService(),
      priorityBands: testPriorityBandService(),
      history: testHistoryService(),
      replay: testReplay().replay,
      probeDatabase: () => 'ok',
      internalAuthSecret: 'x'.repeat(32),
      writes: testWrites(),
      migrationsApplied: true,
    });

    tokens = {};
    for (const username of ['owner', 'ada', 'mallory']) {
      const res = await app.handle(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password: 'correct-horse' }),
        }),
      );
      tokens[username] = ((await res.json()) as { token: string }).token;
    }

    // Created through the route, so the project's `ownerId` is the account the
    // token names rather than an id this file invented.
    const created = await as(tokens['owner'], '/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'Rewire the shed' }),
    });
    projectId = ((await created.json()) as { project: { id: string } }).project.id;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const save = (who: string, name = 'before the rewire') =>
    as(tokens[who], `/api/projects/${projectId}/saved-plans`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });

  const savedIdOf = async (res: Response): Promise<string> =>
    ((await res.json()) as { savedPlan: { id: string } }).savedPlan.id;

  /**
   * The identity assertion, and the one a body-supplied creator would fail.
   * `createdBy` is the *caller's* username — the project is unrestricted, so
   * `ada` may save on it, and nothing in the request said who she was except
   * her token.
   */
  it('stores the caller as the creator, not anything the body said', async () => {
    const res = await save('ada');
    expect(res.status).toBe(201);

    const read = await as(tokens['mallory'], `/api/saved-plans/${await savedIdOf(res)}`);
    expect(read.status).toBe(200);
    expect(((await read.json()) as { savedPlan: { createdBy: string } }).savedPlan.createdBy).toBe(
      'ada',
    );
  });

  it('lists a project’s plans to any authenticated account', async () => {
    await save('ada');
    const res = await as(tokens['mallory'], `/api/projects/${projectId}/saved-plans`);

    expect(res.status).toBe(200);
    expect(((await res.json()) as { savedPlans: unknown[] }).savedPlans).toHaveLength(1);
  });

  /**
   * The route-level half of the permission rule. `ada` saved it on a project
   * she does not own, and the project is unrestricted — so the ordinary write
   * rule says `mallory` may write to it, and the rename must still refuse her.
   */
  it('lets the creator and the project owner rename, and refuses a third party', async () => {
    const id = await savedIdOf(await save('ada'));
    const rename = (who: string, name: string) =>
      as(tokens[who], `/api/saved-plans/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });

    expect((await rename('mallory', 'mine now')).status).toBe(403);
    expect((await rename('ada', 'hers')).status).toBe(200);
    expect((await rename('owner', 'his')).status).toBe(200);

    const read = await as(tokens['ada'], `/api/saved-plans/${id}`);
    expect(((await read.json()) as { savedPlan: { name: string } }).savedPlan.name).toBe('his');
  });

  it('answers 204 on a delete and 404 on the read that follows', async () => {
    const id = await savedIdOf(await save('ada'));

    expect(
      (await as(tokens['mallory'], `/api/saved-plans/${id}`, { method: 'DELETE' })).status,
    ).toBe(403);
    expect((await as(tokens['ada'], `/api/saved-plans/${id}`, { method: 'DELETE' })).status).toBe(
      204,
    );
    expect((await as(tokens['ada'], `/api/saved-plans/${id}`)).status).toBe(404);
  });

  /**
   * A mistyped project id and an empty shelf both list as `[]` at the service,
   * so the route reads the project first and a client can tell them apart.
   */
  it('answers 404 for a project that is not there', async () => {
    expect((await as(tokens['owner'], '/api/projects/nope/saved-plans')).status).toBe(404);
    expect((await save('owner')).status).toBe(201);
  });

  it('refuses an unauthenticated caller before it decides anything else', async () => {
    const res = await app.handle(
      new Request(`http://localhost/api/projects/${projectId}/saved-plans`),
    );
    expect(res.status).toBe(401);
  });

  /**
   * Task 6.2's matrix: every caller a saved-plan route can have, against all
   * **five** routes, on a project that is unrestricted and then restricted.
   *
   * **The cell that carries the task is `restricted` × `ada`.** She created the
   * plans and does not own the project, so on a restricted project `canEdit` is
   * false for her — she may not save a new plan — and yet she may still rename
   * and delete the ones she already made. No single rule produces both answers,
   * which is exactly what 6.1 separated: saving is an ordinary project write,
   * renaming and deleting are the creator-or-owner rule. The tests above prove
   * that rule holds on an *unrestricted* project, where the ordinary rule is
   * permissive; this proves it is not merely `canEdit` wearing a second name on
   * a project where the ordinary rule is strict.
   *
   * The `anonymous` row is not padding either: it says the guard runs *before*
   * the permission rule, so a restricted project answers an unauthenticated
   * caller 401 and never 403 — a 403 there would tell a stranger the project
   * exists.
   */
  describe('the permission matrix', () => {
    type Actor = 'anonymous' | 'owner' | 'ada' | 'mallory';
    interface Row {
      save: number;
      list: number;
      read: number;
      rename: number;
      delete: number;
    }

    const ACTORS: readonly Actor[] = ['anonymous', 'owner', 'ada', 'mallory'];

    const MATRIX: Record<'unrestricted' | 'restricted', Record<Actor, Row>> = {
      unrestricted: {
        anonymous: { save: 401, list: 401, read: 401, rename: 401, delete: 401 },
        owner: { save: 201, list: 200, read: 200, rename: 200, delete: 204 },
        ada: { save: 201, list: 200, read: 200, rename: 200, delete: 204 },
        // The ordinary write rule would let her save — the project is open —
        // and the creator-or-owner rule still refuses her the other two.
        mallory: { save: 201, list: 200, read: 200, rename: 403, delete: 403 },
      },
      restricted: {
        anonymous: { save: 401, list: 401, read: 401, rename: 401, delete: 401 },
        owner: { save: 201, list: 200, read: 200, rename: 200, delete: 204 },
        // Refused a new plan and allowed to rename and delete her own: the two
        // rules disagreeing about one caller is the point of the whole column.
        ada: { save: 403, list: 200, read: 200, rename: 200, delete: 204 },
        mallory: { save: 403, list: 200, read: 200, rename: 403, delete: 403 },
      },
    };

    /** As {@link as}, except that `anonymous` sends no `authorization` header. */
    const request = (actor: Actor, path: string, init: Omit<RequestInit, 'headers'> = {}) =>
      actor === 'anonymous'
        ? app.handle(
            new Request(`http://localhost${path}`, {
              ...init,
              headers: { 'content-type': 'application/json' },
            }),
          )
        : as(tokens[actor], path, init);

    for (const column of ['unrestricted', 'restricted'] as const) {
      for (const actor of ACTORS) {
        it(`${column}: ${actor} against all five routes`, async () => {
          // Seeded before the project is restricted, because on a restricted
          // project `ada` could not create them — and a matrix whose rename and
          // delete targets were the owner's would be asking a different
          // question in the two columns.
          const toRead = await savedIdOf(await save('ada', 'the read target'));
          const toRename = await savedIdOf(await save('ada', 'the rename target'));
          const toDelete = await savedIdOf(await save('ada', 'the delete target'));

          if (column === 'restricted') {
            const restricted = await as(tokens['owner'], `/api/projects/${projectId}`, {
              method: 'PATCH',
              body: JSON.stringify({ restricted: true }),
            });
            expect(restricted.status).toBe(200);
          }

          // Collected into one object and compared whole, so a wrong rule
          // reports every cell it moved rather than stopping at the first.
          const row: Row = {
            save: (
              await request(actor, `/api/projects/${projectId}/saved-plans`, {
                method: 'POST',
                body: JSON.stringify({ name: 'one more' }),
              })
            ).status,
            list: (await request(actor, `/api/projects/${projectId}/saved-plans`)).status,
            read: (await request(actor, `/api/saved-plans/${toRead}`)).status,
            rename: (
              await request(actor, `/api/saved-plans/${toRename}`, {
                method: 'PATCH',
                body: JSON.stringify({ name: 'renamed' }),
              })
            ).status,
            delete: (await request(actor, `/api/saved-plans/${toDelete}`, { method: 'DELETE' }))
              .status,
          };

          expect(row).toEqual(MATRIX[column][actor]);
        });
      }
    }
  });
});
