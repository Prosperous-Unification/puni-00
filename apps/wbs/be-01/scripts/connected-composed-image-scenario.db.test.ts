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
import { expect, test } from 'bun:test';

import { BACKEND_DEPENDENCY_CAPABILITY } from '../src/runtime/dependency-support';
import { buildServices } from '../src/services';
import { openComposedImageFixture, TARGET_PROJECT_ID } from './connected-composed-image-scenario';

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
