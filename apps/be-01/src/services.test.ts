import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLogger } from '@wbs/observability';
import { afterEach, describe, expect, it } from 'bun:test';

import { openDrizzle } from './repository/db';
import { DrizzleEventLogRepo } from './repository/event-log';
import { runMigrations } from './repository/migrate';
import { ProjectRepository } from './repository/project';
import { UserRepository } from './repository/user';
import { buildServices } from './services';

const FOLDER = new URL('../drizzle', import.meta.url).pathname;

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function bootstrap() {
  const dir = mkdtempSync(join(tmpdir(), 'wbs-services-'));
  dirs.push(dir);
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const db = openDrizzle(path);
  const services = buildServices({
    db,
    logger: createLogger({ service: 'test' }),
    jwtKey: 'k'.repeat(32),
    gwUrl: 'http://gw.invalid',
    internalAuthSecret: 's'.repeat(32),
  });
  return { db, services };
}

async function seedProject(db: ReturnType<typeof openDrizzle>): Promise<{
  projectId: string;
  ownerId: string;
}> {
  const ownerId = crypto.randomUUID();
  await new UserRepository(db).create({
    id: ownerId,
    username: 'owner',
    passwordHash: 'x',
    createdAt: 1,
  });
  const projectId = crypto.randomUUID();
  const project = await new ProjectRepository(db).create(
    {
      id: projectId,
      name: 'Rewire the shed',
      ownerId,
      restricted: false,
      estimateMethod: 'pert',
      pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
      estimateRounding: 'ceil',
      startDate: null,
      revision: 0,
      createdAt: 1,
    },
    [{ id: crypto.randomUUID(), projectId, name: 'Dev', position: 10 }],
  );
  return { projectId: project.id, ownerId };
}

describe('buildServices', () => {
  it('gives the broadcaster and the replay orchestrator the same buffer', async () => {
    // The wiring, not the classes. `GatewayBroadcaster` filling a buffer and
    // `ReplayOrchestrator` reading one were each proven in isolation, and both
    // proofs would have survived this file handing them two different buffers:
    // replay would still work, silently, off the database on every reconnect.
    //
    // Proof: `buffer: replayBuffer` in `services.ts` replaced with a freshly
    // constructed `new ReplayBuffer(...)` and only this test failed.
    const { db, services } = bootstrap();
    const { projectId, ownerId } = await seedProject(db);

    // The push has nowhere to go — `gw.invalid` — which is deliberate: the
    // buffer must be filled by the recording, not by a successful delivery.
    await services.workItems.create(projectId, ownerId, {
      parentId: null,
      afterId: null,
      name: 'Strip',
    });

    const subscription = `project:${projectId}`;
    const fromBuffer = await services.replay.replay({ [subscription]: -1 });
    expect(fromBuffer[subscription]).toMatchObject({ status: 'replaying' });

    // Emptying the log leaves the replay intact, which it could only do if the
    // event is in the buffer the orchestrator was handed.
    await new DrizzleEventLogRepo(db).pruneBeyond(0);
    expect(await services.replay.replay({ [subscription]: -1 })).toEqual(fromBuffer);
  });
});
