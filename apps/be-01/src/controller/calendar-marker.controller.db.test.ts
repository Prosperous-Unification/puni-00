import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { buildApp } from '../app';
import { CalendarMarkerRepository } from '../repository/calendar-marker';
import { openConnection } from '../repository/db';
import { runMigrations } from '../repository/migrate';
import { ProjectRepository } from '../repository/project';
import { UserRepository } from '../repository/user';
import { AuthService } from '../service/auth.service';
import { CalendarMarkerService } from '../service/calendar-marker.service';
import { clockOf } from '../service/clock';
import { ProjectService } from '../service/project.service';
import { TEST_JWT_KEY } from '../testing/auth-fixture';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { testCapacityService } from '../testing/capacity-fixture';
import { testDirectoryService } from '../testing/directory-fixture';
import { testHistoryService } from '../testing/history-fixture';
import { testPriorityBandService } from '../testing/priority-band-fixture';
import { testReplay } from '../testing/replay-fixture';
import { testSavedPlanService } from '../testing/saved-plan-fixture';
import { testStepService } from '../testing/step-fixture';
import { testWorkItemService } from '../testing/work-item-fixture';
import { testWrites } from '../testing/writes-fixture';

const FOLDER = new URL('../../drizzle', import.meta.url).pathname;

/** The one instant every marker in this file is created at — see {@link tied}. */
const FIXED_NOW = 1_756_900_000_000;

/**
 * The two ids the tie case is pinned on, **in the reverse of their lexical
 * order**, which is the order they are inserted in.
 *
 * `b…` sorts before `f…`, so insertion order and lexical order disagree and
 * only the `id` key of the `ORDER BY` can produce the asserted sequence. Two
 * reads of a tied pair can both come back in insertion order with that key
 * gone — that flakiness is the whole finding, and an
 * equality-of-two-reads assertion would pass straight through it.
 */
const TIED = ['f1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001'];

/**
 * The five marker routes, over HTTP and against real SQLite (task 4.1's HTTP
 * half).
 *
 * Real SQLite rather than this folder's usual in-memory doubles, and not by
 * preference: the ordering this slice is about is the **database's** tie-break,
 * so a Map-backed stand-in would be asserting its own `sort` rather than the
 * `ORDER BY` that ships. `repository/calendar-marker-repository.db.test.ts`
 * proves the store; what is proved here is the part only a request can reach —
 * the statuses, the shapes, and that the routes are wired to that store at all.
 *
 * Two accounts, registered through `/api/auth/register` so a token names an
 * identity `userFromHeaders` really resolves: `owner` owns the project and
 * `mallory` is the third party the permission case needs.
 */
describe('the calendar-marker routes', () => {
  let dir: string;
  let app: ReturnType<typeof buildApp>;
  let tokens: Record<string, string>;
  let projectId: string;

  /** One authenticated request — `saved-plan.controller.db.test.ts`'s helper. */
  const as = (token: string, path: string, init: Omit<RequestInit, 'headers'> = {}) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        ...init,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      }),
    );

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'wbs-calendar-marker-http-'));
    const path = join(dir, 'test.db');
    runMigrations(path, FOLDER);
    const broadcast = recordingBroadcaster();
    const connection = openConnection(path);
    const projects = new ProjectRepository(connection.db);

    app = buildApp({
      auth: new AuthService({ users: new UserRepository(connection.db), jwtKey: TEST_JWT_KEY }),
      projects: new ProjectService({ projects, broadcast }),
      // A clock held still, because `createdAt` is an ordering key here rather
      // than a stamp: every marker this file creates ties on `(date,
      // createdAt)`, which is the only state in which the third key decides
      // anything at all.
      calendarMarkers: new CalendarMarkerService({
        projects,
        markers: new CalendarMarkerRepository(connection.db),
        clock: clockOf({ now: () => FIXED_NOW }),
      }),
      savedPlans: testSavedPlanService(),
      steps: testStepService(),
      workItems: testWorkItemService(),
      directory: testDirectoryService(),
      capacity: testCapacityService(),
      priorityBands: testPriorityBandService(),
      history: testHistoryService(),
      replay: testReplay().replay,
      probeDatabase: () => 'ok',
      internalAuthSecret: 'x'.repeat(32),
      writes: testWrites(broadcast),
      migrationsApplied: true,
    });

    tokens = {};
    for (const username of ['owner', 'mallory']) {
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

  const create = (who: string, body: Record<string, unknown>) =>
    as(tokens[who], `/api/projects/${projectId}/calendar-markers`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

  const patch = (who: string, id: string, body: Record<string, unknown>) =>
    as(tokens[who], `/api/projects/${projectId}/calendar-markers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

  const list = async (who: string) => {
    const res = await as(tokens[who], `/api/projects/${projectId}/calendar-markers`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { markers: { id: string; name: string; color: string | null }[] })
      .markers;
  };

  /**
   * The round trip: all five verbs through the routes, in the order a composer
   * makes them.
   *
   * The colour is asserted at each step because rename and recolour share one
   * `PATCH` and take body-specific branches inside it — a rename that also
   * wrote the colour column would answer 200 and be invisible to a test that
   * only read the name back.
   */
  it('round-trips list, create, rename, recolour and delete', async () => {
    expect(await list('owner')).toEqual([]);

    const made = await create('owner', {
      id: 'a1000000-0000-4000-8000-000000000001',
      date: '2026-09-14',
      name: 'Site visit',
    });
    expect(made.status).toBe(201);
    expect(((await made.json()) as { marker: unknown }).marker).toEqual({
      id: 'a1000000-0000-4000-8000-000000000001',
      projectId,
      date: '2026-09-14',
      name: 'Site visit',
      // Absent in the body and `null` in the answer: automatic has one
      // spelling and it is the absence of a fill.
      color: null,
      createdAt: FIXED_NOW,
    });

    const renamed = await patch('owner', 'a1000000-0000-4000-8000-000000000001', {
      name: 'Site visit, rescheduled',
    });
    expect(renamed.status).toBe(200);
    expect(await list('owner')).toMatchObject([
      { name: 'Site visit, rescheduled', date: '2026-09-14', color: null },
    ]);

    const recoloured = await patch('owner', 'a1000000-0000-4000-8000-000000000001', {
      color: '#4c3a86',
    });
    expect(recoloured.status).toBe(200);
    expect(await list('owner')).toMatchObject([
      { name: 'Site visit, rescheduled', color: '#4c3a86' },
    ]);

    const removed = await as(
      tokens['owner'],
      `/api/projects/${projectId}/calendar-markers/a1000000-0000-4000-8000-000000000001`,
      { method: 'DELETE' },
    );
    expect(removed.status).toBe(204);
    expect(await list('owner')).toEqual([]);
  });

  /**
   * The slice's point, through the routes this time.
   *
   * Both markers are created at {@link FIXED_NOW} on one date, so `(date,
   * createdAt)` ties and the `id` key is the only thing left to decide the
   * order. The list is read **twice** and the exact lexical sequence asserted
   * both times — not merely that the two reads agree, because two reads of a
   * tied pair can agree in insertion order with the key gone.
   *
   * Negative: `asc(calendarMarker.id)` struck from
   * `CalendarMarkerRepository.listFor`'s `orderBy`. Watched failing on the
   * first read already, `Expected ["b1…", "f1…"] / Received ["f1…", "b1…"]`,
   * with every other case in this file green. Against SQLite rather than a
   * stub — the tie-break is the database's, so a fake store proves nothing
   * about it. Watched 2026-09-05.
   */
  it('orders a tie on (date, created_at) by id, on every read', async () => {
    for (const id of TIED) {
      expect((await create('owner', { id, date: '2026-09-14', name: id.slice(0, 2) })).status).toBe(
        201,
      );
    }
    const expected = [...TIED].sort();

    expect((await list('owner')).map((marker) => marker.id)).toEqual(expected);
    expect((await list('owner')).map((marker) => marker.id)).toEqual(expected);
  });

  /**
   * A date outside every horizon the project could draw is **stored and
   * returned**, because a marker's date is absolute (ADR 0014).
   *
   * "Stored, not drawn" is the rule an undated plan gets, and this is the same
   * rule one step along: be-01 knows nothing about which days the axis is
   * showing, so a refusal here would be be-01 inventing a horizon.
   */
  it('accepts and returns a marker outside any drawable horizon', async () => {
    const made = await create('owner', {
      id: 'c1000000-0000-4000-8000-000000000003',
      date: '2099-12-31',
      name: 'The far side',
    });
    expect(made.status).toBe(201);
    expect(await list('owner')).toMatchObject([{ date: '2099-12-31', name: 'The far side' }]);
  });

  /**
   * The write gate exists, proved on the one verb that would otherwise leave a
   * row behind.
   *
   * **Task 4.2 still owes the other three mutations and the negative** — a
   * permission check removed from the create path, watched failing here. This
   * case is not that slice; it is the assertion that keeps `canEdit` from
   * shipping in this chunk as code nothing executes.
   */
  it('refuses a create from a non-owner of a restricted project, and writes nothing', async () => {
    expect(
      (
        await as(tokens['owner'], `/api/projects/${projectId}`, {
          method: 'PATCH',
          body: JSON.stringify({ restricted: true }),
        })
      ).status,
    ).toBe(200);

    const refused = await create('mallory', {
      id: 'd1000000-0000-4000-8000-000000000004',
      date: '2026-09-14',
      name: 'Not mine to add',
    });
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: string }).error).toBe('forbidden');
    expect(await list('owner')).toEqual([]);
  });
});
