import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildConnectedSolverRequest } from '@wbs/contracts/solver/build-connected-request';
import {
  encodeBoundaryCertificate,
  encodeConnectedSuccess,
} from '@wbs/contracts/solver/connected-durable';
import { schedule, scheduleResolved } from '@wbs/domain';
import { createScheduler } from '@wbs/runtime-portable';
import { afterEach, beforeEach, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';

import { capturedSchedulerIn } from './captured-scheduler';
import { response, stage } from './connected-optimization.fixture';
import { captureConnectedQuestion, hashConnectedBytes } from './connected-question-identity';
import { drizzleReadTransaction, openDatabase } from './db';
import { runMigrations } from './migrate';
import { createReadSnapshotLifetime } from './read-snapshot-lifetime';
import { optimizedScheduleCache } from './schema';

const installed = { solverVersion: '0.4.0', budgetMs: 1000, now: () => 12 };
const schedulerOf = () =>
  createScheduler(
    (rows, edges, slices, floors, pools, reach, deadlines, typed, elsewhere, capacities) =>
      schedule(
        rows,
        edges,
        slices,
        floors,
        pools,
        reach,
        deadlines,
        typed,
        undefined,
        elsewhere,
        capacities,
      ),
    scheduleResolved,
  );
let directory: string;
let path: string;
function connect() {
  const sqlite = openDatabase(path);
  return {
    sqlite,
    db: drizzle({ client: sqlite }),
    close: () => {
      sqlite.close();
    },
  };
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'captured-scheduler-'));
  path = join(directory, 'store.db');
  runMigrations(path, new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname);
  const connection = connect();
  connection.sqlite.run(
    "INSERT INTO users(id,username,password_hash,created_at) VALUES('u','u','x',1)",
  );
  connection.sqlite.run("INSERT INTO project(id,name,owner_id,created_at) VALUES('B','B','u',1)");
  connection.close();
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

it('keeps connected capability absent without the private explicit opt-in', () => {
  const connection = connect();
  const previous = process.env['WBS_LOCAL_SOLVER'];
  process.env['WBS_LOCAL_SOLVER'] = 'true';
  try {
    const view = capturedSchedulerIn(connection.db, { schedulerOf }, createReadSnapshotLifetime());
    expect(view.connected).toBeUndefined();
    expect(view.scheduler.supports('optimized')).toBe(false);
  } finally {
    if (previous === undefined) delete process.env['WBS_LOCAL_SOLVER'];
    else process.env['WBS_LOCAL_SOLVER'] = previous;
    connection.close();
  }
});

for (const mode of ['isolated', 'shared'] as const) {
  it(`keeps ${mode} connected selections in one borrowed observation without writes`, () => {
    const owner = connect();
    const publisher = connect();
    const lifetime = createReadSnapshotLifetime();
    const transaction = drizzleReadTransaction(owner.db);
    transaction.begin();
    try {
      const before = owner.sqlite.query('SELECT total_changes() AS count').get();
      const captured = { ...stage(), mode };
      const view = capturedSchedulerIn(owner.db, { schedulerOf }, lifetime, installed);
      if (view.connected === undefined) throw Error('connected capture capability absent');
      const ask = { stage: captured, enabled: true, objective: 'time' as const };
      expect(view.connected.readConnectedCaptured(ask).variants.time.state).toBe('idle');
      expect(owner.sqlite.query('SELECT total_changes() AS count').get()).toEqual(before);
      const question = captureConnectedQuestion(captured, 'time', installed);
      const { stageBytes, ...identity } = question;
      expect(stageBytes).toBeTruthy();
      const prepared = buildConnectedSolverRequest(captured, identity, installed, 'time');
      if (prepared.kind !== 'request') throw Error('fixture lacks request');
      const success = encodeConnectedSuccess(
        captured,
        identity,
        prepared.request,
        response(prepared.request).stdout,
        hashConnectedBytes,
      );
      publisher.db
        .insert(optimizedScheduleCache)
        .values({
          ...question,
          generation: 1,
          status: 'ok',
          resultJson: JSON.stringify(success),
          createdAt: 12,
        })
        .run();
      expect(view.connected.readConnectedCaptured(ask).variants.time.state).toBe('idle');
      expect(owner.sqlite.query('SELECT total_changes() AS count').get()).toEqual(before);
      lifetime.expire();
      transaction.commit();
      expect(() => view.connected?.readConnectedCaptured(ask)).toThrow('read snapshot is closed');
      const next = capturedSchedulerIn(
        owner.db,
        { schedulerOf },
        createReadSnapshotLifetime(),
        installed,
      );
      expect(next.connected?.readConnectedCaptured(ask).variants.time.state).toBe('ready');
      // The helper borrows its database: the owner may begin a later observation on it.
      expect(
        owner.sqlite.query('SELECT count(*) AS count FROM optimized_schedule_cache').get(),
      ).toEqual({ count: 1 });
    } finally {
      lifetime.expire();
      owner.close();
      publisher.close();
    }
  });
}

for (const capability of [
  'acquisition',
  'local callback',
  'supports',
  'resolved Fast',
  'local schedule',
  'connected callback',
] as const) {
  it(`expires retained ${capability} while its database remains usable`, () => {
    const connection = connect();
    const lifetime = createReadSnapshotLifetime();
    try {
      let retained: Parameters<Parameters<typeof capturedSchedulerIn>[1]['schedulerOf']>[0];
      const view = capturedSchedulerIn(
        connection.db,
        {
          schedulerOf: (readCaptured) => {
            retained = readCaptured;
            return schedulerOf();
          },
          optimization: { contractVersion: 'fixture', budgetMs: 1000, now: () => 12 },
        },
        lifetime,
        installed,
      );
      lifetime.expire();
      const input = {
        rows: [],
        edges: [],
        slices: [],
        notBefore: new Map(),
        poolSizes: new Map(),
        reach: 'whole-item' as const,
        deadlines: new Map(),
        typed: [],
      };
      const invoke = {
        acquisition: () => capturedSchedulerIn(connection.db, { schedulerOf }, lifetime, installed),
        'local callback': () =>
          retained?.({ projectId: 'B', objective: 'time', input, enabled: true }),
        supports: () => view.scheduler.supports('fast'),
        'resolved Fast': () => view.scheduler.readResolvedFast(stage().input),
        'local schedule': () =>
          view.scheduler.read({
            mode: 'capture',
            projectId: 'B',
            objective: 'time',
            engine: 'fast',
            enabled: false,
            input,
          }),
        'connected callback': () =>
          view.connected?.readConnectedCaptured({
            stage: stage(),
            enabled: true,
            objective: 'time',
          }),
      }[capability];
      expect(invoke).toThrow('read snapshot is closed');
      expect(connection.sqlite.query('SELECT count(*) AS count FROM project').get()).toEqual({
        count: 1,
      });
    } finally {
      connection.close();
    }
  });
}

it('retains a stored boundary certificate and refuses malformed terminal evidence without writes', () => {
  const connection = connect();
  try {
    const captured = stage(true);
    const question = captureConnectedQuestion(captured, 'time', installed);
    const { stageBytes, ...identity } = question;
    expect(stageBytes).toBeTruthy();
    const prepared = buildConnectedSolverRequest(captured, identity, installed, 'time');
    if (prepared.kind !== 'boundary-infeasible') throw Error('fixture lacks certificate');
    const certificate = encodeBoundaryCertificate(
      captured,
      identity,
      prepared.request,
      prepared.evidence,
      hashConnectedBytes,
    );
    connection.sqlite.run(
      'INSERT INTO optimization_boundary_certificate(project_id,input_hash,objective,contract_version,budget_ms,certificate_json,generation,attempt_token,created_at) VALUES(?,?,?,?,?,?,1,?,1)',
      [
        'B',
        question.inputHash,
        'time',
        question.contractVersion,
        1000,
        JSON.stringify(certificate),
        'attempt',
      ],
    );
    const before = connection.sqlite.query('SELECT total_changes() AS count').get();
    const view = capturedSchedulerIn(
      connection.db,
      { schedulerOf },
      createReadSnapshotLifetime(),
      installed,
    );
    const ask = { stage: captured, enabled: true, objective: 'time' as const };
    expect(view.connected?.readConnectedCaptured(ask).variants.time.state).toBe(
      'boundary-infeasible',
    );
    expect(connection.sqlite.query('SELECT total_changes() AS count').get()).toEqual(before);
    connection.sqlite.run("UPDATE optimization_boundary_certificate SET certificate_json = '{'");
    expect(() => view.connected?.readConnectedCaptured(ask)).toThrow();
  } finally {
    connection.close();
  }
});
