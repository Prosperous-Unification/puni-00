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
import type { ReservedSpawner, ReservedSpawnRequest } from './service/optimization-coordinator';
import { WriteLock } from './service/write-lock';
import { buildServices } from './services';
import { projectRow } from './testing/project-fixture';

const FOLDER = new URL('../drizzle', import.meta.url).pathname;

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function bootstrap(optimizer?: {
  solverVersion: string;
  budgetMs: number;
  spawn: ReservedSpawner;
}) {
  const dir = mkdtempSync(join(tmpdir(), 'wbs-services-'));
  dirs.push(dir);
  const path = join(dir, 'test.db');
  runMigrations(path, FOLDER);
  const db = openDrizzle(path);
  const services = buildServices({
    db,
    lock: new WriteLock(),
    logger: createLogger({ service: 'be-01' }),
    jwtKey: 'k'.repeat(32),
    gwUrl: 'http://gw.invalid',
    internalAuthSecret: 's'.repeat(32),
    optimizer,
  });
  return { db, services };
}

async function seedProject(db: ReturnType<typeof openDrizzle>): Promise<{
  projectId: string;
  ownerId: string;
}> {
  const ownerId = crypto.randomUUID();
  await new UserRepository(db).create(
    {
      id: ownerId,
      username: 'owner',
      passwordHash: 'x',
      createdAt: 1,
    },
    { at: 1, by: ownerId },
  );
  const projectId = crypto.randomUUID();
  const project = await new ProjectRepository(db).create(
    projectRow({
      id: projectId,
      ownerId,
    }),
    [{ id: crypto.randomUUID(), projectId, name: 'Dev', position: 10 }],
    { at: 1, by: ownerId },
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

  it('builds one available optimizer whose first enabled read launches both release-keyed variants', async () => {
    // This is the process graph, not an OptimizationCoordinator unit test. The
    // child process is the external boundary; SQLite admission, project gating,
    // plan reading and request composition are real. Proof: leave
    // `optimizerWiring(undefined)` in services.ts and the setting write refuses
    // `optimizer_unavailable`; wire availability without the reader and no
    // launch arrives here.
    const spawned: ReservedSpawnRequest[] = [];
    const { db, services } = bootstrap({
      solverVersion: '0.1.0',
      budgetMs: 60_000,
      spawn: (request) => {
        spawned.push(request);
        const empty = () =>
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.close();
            },
          });
        return {
          pid: 10_000 + spawned.length,
          stdout: empty(),
          stderr: empty(),
          exited: Promise.resolve(1),
          verdict: () => undefined,
          kill: () => undefined,
        };
      },
    });
    const { projectId, ownerId } = await seedProject(db);
    await services.workItems.create(projectId, ownerId, {
      parentId: null,
      afterId: null,
      name: 'Rewire',
    });

    expect(
      await services.projects.update(projectId, ownerId, {
        optimizationEnabled: true,
        scheduleEngine: 'fast',
      }),
    ).toHaveProperty('ok', true);
    await services.workItems.tree(projectId);
    await services.optimizer?.drain();

    expect(spawned.map((request) => request.objective)).toEqual(['pri', 'time']);
    expect(
      spawned.map((request) => [
        request.request.solverVersion,
        request.request.contractVersion,
        request.request.budgetMs,
      ]),
    ).toEqual([
      ['0.1.0', '7+0.1.0', 60_000],
      ['0.1.0', '7+0.1.0', 60_000],
    ]);
  });
});
