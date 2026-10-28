import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildConnectedSolverRequest } from '@wbs/contracts/solver/build-connected-request';
import {
  decodeConnectedStage,
  encodeConnectedStage,
} from '@wbs/contracts/solver/connected-durable';
import {
  decodeSupervisorStartFrame,
  SUPERVISOR_PROTOCOL_VERSION,
} from '@wbs/contracts/solver/supervisor-protocol';
import { clockOf } from '@wbs/core';
import { localCommandAccess } from '@wbs/core/testing/organization-access-fixture';
import { createLogger } from '@wbs/observability';
import { openSqliteSource } from '@wbs/store-sqlite';
import { captureConnectedQuestion } from '@wbs/store-sqlite/connected-question-identity';
import { openReadOnlyConnection } from '@wbs/store-sqlite/db';
import { expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';

import { BACKEND_DEPENDENCY_CAPABILITY } from '../src/runtime/dependency-support';
import { buildServices } from '../src/services';
import {
  openComposedImageFixture,
  TARGET_PROJECT_ID,
  trackComposedImageReaders,
} from './connected-composed-image-scenario';

test('disposable composed image fixture captures a feasible priority improvement with exact foreign pins', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'connected-image-fixture-'));
  const path = await openComposedImageFixture(folder);
  const source = openSqliteSource({
    dependencyCapability: BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
  });
  const installed = { solverVersion: '0.4.0', budgetMs: 30_000 };
  const services = buildServices({
    source,
    commandAccess: localCommandAccess,
    clock: clockOf({ now: Date.now, newId: () => crypto.randomUUID() }),
    logger: createLogger({ service: 'be-01', destination: { write: () => undefined } }),
    jwtKey: 'k'.repeat(32),
    gwUrl: 'http://gw.invalid',
    internalAuthSecret: 's'.repeat(32),
    pushFetch: () => Promise.resolve(Response.json({ delivered_to_sockets: 0 })),
    optimizer: {
      ...installed,
      spawn: () => {
        throw new Error('capture-only fixture test cannot launch children');
      },
    },
  });
  try {
    const captured = await services.workItems.optimizationCapture(TARGET_PROJECT_ID);
    if (captured.kind !== 'scheduled' || captured.input.kind !== 'connected') {
      throw new Error('fixture omitted installed connected stage');
    }
    const stage = captured.input.stage;
    expect(encodeConnectedStage(decodeConnectedStage(encodeConnectedStage(stage)))).toEqual(
      encodeConnectedStage(stage),
    );
    expect([...stage.starts]).toEqual([
      ['a1-long\u0000a1-s', 1],
      ['a1-short\u0000a1-s', 3],
      ['a2-foreign\u0000a2-s', 0],
    ]);
    const question = captureConnectedQuestion(stage, 'pri', installed);
    const prepared = buildConnectedSolverRequest(stage, question, installed, 'pri');
    if (prepared.kind !== 'request')
      throw new Error('fixture did not prepare feasible child question');
    expect(prepared.request.scope.fixed.map(({ start, finish }) => [start, finish])).toEqual([
      [0, 1],
    ]);
    const accepted = decodeSupervisorStartFrame(
      JSON.stringify({
        type: 'start',
        protocolVersion: SUPERVISOR_PROTOCOL_VERSION,
        callerId: 'a'.repeat(12),
        projectId: stage.projectId,
        objective: 'pri',
        attemptToken: crypto.randomUUID(),
        childDeadlineAt: Date.now() + 60_000,
        searchWorkers: 2,
        memoryLimitMb: 512,
        request: prepared.request,
      }),
      {
        now: Date.now(),
        peerCallerId: 'a'.repeat(64),
        maxInputBytes: 2 * 1024 * 1024,
        maxSearchWorkers: 2,
        maxMemoryLimitMb: 512,
      },
    );
    expect(accepted.projectId).toBe(TARGET_PROJECT_ID);
    expect(prepared.request.slices).toHaveLength(2);
    expect(prepared.request.slices.map(({ durationUnits }) => durationUnits)).toEqual([96, 48]);
    expect(source.db.all('SELECT * FROM solver_slot')).toEqual([]);
    expect(source.db.all('SELECT * FROM optimized_schedule_cache')).toEqual([]);
  } finally {
    await services.optimizer?.stop();
    await source.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('composed image admission permits idle pooled readers and source close drains them', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'connected-image-pooled-'));
  const path = await openComposedImageFixture(folder);
  const readers = trackComposedImageReaders();
  const source = openSqliteSource({
    dependencyCapability: BACKEND_DEPENDENCY_CAPABILITY,
    dbPath: path,
    openReadOnlyConnection: readers.openConnection,
  });
  try {
    const observation = await source.stores.claims.observeProject(TARGET_PROJECT_ID, {
      kind: 'scoped',
      scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
    });
    expect(observation).toBeDefined();
    expect(() => {
      readers.assertClosed();
    }).toThrow('source retained a physical read connection');
    readers.assertSettled();
  } finally {
    await source.close();
    readers.assertClosed();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('composed image admission refuses active read transactions until real commit or rollback', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'connected-image-transaction-'));
  const path = await openComposedImageFixture(folder);
  const readers = trackComposedImageReaders();
  const connection = readers.openConnection(path);
  try {
    expect(() => {
      readers.assertSettled();
    }).toThrow('fixture read transaction was not observed');
    for (const terminal of ['COMMIT', 'ROLLBACK']) {
      connection.db.run(sql.raw('BEGIN DEFERRED'));
      connection.db.all(sql.raw('SELECT id FROM project'));
      expect(() => {
        readers.assertSettled();
      }).toThrow();
      connection.db.run(sql.raw(terminal));
      readers.assertSettled();
    }
  } finally {
    connection.close();
    readers.assertClosed();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('COMMIT rejected by its real run logger keeps the composed image transaction unsettled', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'connected-image-failed-commit-'));
  const path = await openComposedImageFixture(folder);
  const readers = trackComposedImageReaders((filename, logger) =>
    openReadOnlyConnection(filename, {
      logQuery(query, parameters) {
        logger?.logQuery(query, parameters);
        if (query.trim().toUpperCase() === 'COMMIT')
          throw new Error('injected real COMMIT refusal');
      },
    }),
  );
  const connection = readers.openConnection(path);
  try {
    connection.db.run(sql.raw('BEGIN DEFERRED'));
    connection.db.all(sql.raw('SELECT id FROM project'));
    expect(() => connection.db.run(sql.raw('COMMIT'))).toThrow('injected real COMMIT refusal');
    expect(() => {
      readers.assertSettled();
    }).toThrow();
    connection.db.run(sql.raw('ROLLBACK'));
    readers.assertSettled();
  } finally {
    connection.close();
    readers.assertClosed();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('composed image admission refuses absent transaction instrumentation', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'connected-image-no-observation-'));
  const path = await openComposedImageFixture(folder);
  const readers = trackComposedImageReaders((filename) => openReadOnlyConnection(filename));
  const connection = readers.openConnection(path);
  try {
    expect(() => connection.db.run(sql.raw('BEGIN DEFERRED'))).toThrow(
      'fixture read statement was not observed',
    );
    expect(() => {
      readers.assertSettled();
    }).toThrow('fixture read transaction was not observed');
  } finally {
    connection.close();
    readers.assertClosed();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('composed image admission refuses missing instrumentation on a second physical reader', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'connected-image-mixed-readers-'));
  const path = await openComposedImageFixture(folder);
  let opened = 0;
  const readers = trackComposedImageReaders((filename, logger) => {
    opened++;
    return openReadOnlyConnection(filename, opened === 1 ? logger : undefined);
  });
  const first = readers.openConnection(path);
  const second = readers.openConnection(path);
  try {
    first.db.run(sql.raw('BEGIN DEFERRED'));
    first.db.run(sql.raw('COMMIT'));
    readers.assertSettled();
    expect(() => second.db.run(sql.raw('BEGIN DEFERRED'))).toThrow(
      'fixture read statement was not observed',
    );
    expect(() => {
      readers.assertSettled();
    }).toThrow();
  } finally {
    first.close();
    second.close();
    readers.assertClosed();
    rmSync(folder, { recursive: true, force: true });
  }
});

test('settling one physical reader cannot hide another active transaction', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'connected-image-overlapping-readers-'));
  const path = await openComposedImageFixture(folder);
  const readers = trackComposedImageReaders();
  const first = readers.openConnection(path);
  const second = readers.openConnection(path);
  try {
    first.db.run(sql.raw('BEGIN DEFERRED'));
    second.db.run(sql.raw('BEGIN DEFERRED'));
    first.db.run(sql.raw('COMMIT'));
    expect(() => {
      readers.assertSettled();
    }).toThrow();
    second.db.run(sql.raw('ROLLBACK'));
    readers.assertSettled();
  } finally {
    first.close();
    second.close();
    readers.assertClosed();
    rmSync(folder, { recursive: true, force: true });
  }
});
