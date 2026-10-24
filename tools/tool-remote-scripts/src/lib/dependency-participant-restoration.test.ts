import { rejects } from 'node:assert/strict';
import { readdirSync, readlinkSync } from 'node:fs';
import { copyFile, link, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { Database } from 'bun:sqlite';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { completeActivationFixture } from '../fixtures/dependency-complete-activation';
import { participantActivationFixture } from '../fixtures/dependency-participant-restoration';
import { roots } from '../fixtures/source-startup';
import {
  activateCompleteDependenciesUnderOwner,
  assertParticipantRestorationContext,
  consumePreparedDependencyActivation,
  prepareActivatedParticipantsUnderOwner,
  releasePreparedDependencyActivation,
} from './complete-dependency-exclusion';
import * as activationStorage from './dependency-activation-storage';
import * as ownership from './edge-ownership';
import { withDependencyOwner } from './edge-ownership';

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  delete process.env['WBS_EDGE_STATE'];
});
test('actual committed store observer survives source finalizers only under the same live outer owner', async () => {
  const fixture = await completeActivationFixture(['prod']);
  process.env['WBS_EDGE_STATE'] = fixture.root;
  const activate = activationStorage.activateDependencyStores;
  let observed: Awaited<ReturnType<typeof activate>>['stores'] | undefined;
  const storage = spyOn(activationStorage, 'activateDependencyStores').mockImplementation(
    async (owner, token) => {
      const completion = await activate(owner, token);
      observed = completion.stores;
      return completion;
    },
  );
  try {
    await withDependencyOwner(
      fixture.request.owner,
      async (owner) => {
        const completion = await activateCompleteDependenciesUnderOwner(
          owner,
          fixture.request,
          fixture.layouts,
          performance.now() + 300000,
          fixture.root,
          fixture.ports,
        );
        expect(completion.state).toBe('activation-committed-participants-fenced');
        if (observed === undefined) throw new Error('actual finalized store observer absent');
        await observed.inspect();
        const database = new Database(fixture.prodPath, { create: false });
        try {
          database
            .query(
              "UPDATE cross_project_dependency_activation_receipt SET receipt=json_set(receipt,'$.activationId',?) WHERE id=1",
            )
            .run('PRIVATE_RECEIPT_REPLACEMENT');
        } finally {
          database.close();
        }
        await rejects(observed.inspect());
        expect(fixture.source.State.Running).toBe(false);
        expect(fixture.commands.some((args) => ['start', 'restart', 'rm'].includes(args[0]))).toBe(
          false,
        );
      },
      fixture.root,
    );
  } finally {
    storage.mockRestore();
  }
  if (observed === undefined) throw new Error('actual store observer absent after owner');
  await rejects(observed.inspect());
}, 300000);

for (const lifetime of ['one-shot', 'expired-owner'] as const)
  test(`actual post-finalizer activation preparation enforces ${lifetime} identity before restart`, async () => {
    const fixture = await participantActivationFixture();
    process.env['WBS_EDGE_STATE'] = fixture.root;
    const retained = await withDependencyOwner(
      fixture.request.owner,
      async (owner) => {
        const prepared = await prepareActivatedParticipantsUnderOwner(
          owner,
          fixture.request,
          fixture.layouts,
          performance.now() + 300000,
          fixture.root,
          fixture.ports,
        );
        expect(JSON.stringify(prepared)).toBe('{}');
        await rejects(consumePreparedDependencyActivation(owner, { ...prepared }));
        if (lifetime === 'one-shot') {
          const context = await consumePreparedDependencyActivation(owner, prepared);
          expect(context.completion.activated).toEqual(['prod']);
          await assertParticipantRestorationContext(context);
          await rejects(assertParticipantRestorationContext({ ...context }));
          await rejects(consumePreparedDependencyActivation(owner, prepared));
          releasePreparedDependencyActivation(owner, prepared);
        }
        expect(fixture.commands.some((args) => ['start', 'restart', 'rm'].includes(args[0]))).toBe(
          false,
        );
        return { owner, prepared };
      },
      fixture.root,
    );
    await rejects(consumePreparedDependencyActivation(retained.owner, retained.prepared));
    expect(fixture.emissions()).toBe(1);
  }, 300000);

test('genuine prepared stores recheck full ledger, nonselected authority and original anchors after finalizers', async () => {
  const fixture = await participantActivationFixture();
  process.env['WBS_EDGE_STATE'] = fixture.root;
  await withDependencyOwner(
    fixture.request.owner,
    async (owner) => {
      const prepared = await prepareActivatedParticipantsUnderOwner(
        owner,
        fixture.request,
        fixture.layouts,
        performance.now() + 300000,
        fixture.root,
        fixture.ports,
      );
      try {
        const context = await consumePreparedDependencyActivation(owner, prepared);
        const commands = structuredClone(fixture.commands);
        const policyPath = join(fixture.root, 'edge-policy.json');
        const policy = await readFile(policyPath, 'utf8');
        const assertClosed = () => {
          const openStores: string[] = [];
          for (const descriptor of readdirSync('/proc/self/fd')) {
            let target: string;
            try {
              target = readlinkSync('/proc/self/fd/' + descriptor);
            } catch (cause) {
              // The proc enumeration itself can retire its own descriptor before readlink.
              if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue;
              throw cause;
            }
            if (
              [fixture.prodPath, fixture.devPath].some(
                (path) =>
                  target === path ||
                  target.startsWith(path + '-') ||
                  target.startsWith(path + '.') ||
                  target === join(dirname(path) + '.PRIVATE_retained', basename(path)) ||
                  target === path + ' (deleted)',
              )
            )
              openStores.push(target);
          }
          expect(openStores).toEqual([]);
        };
        const assertOwner = ownership.assertDependencyOwner;
        let awaitedBoundaries = 0;
        const boundary = spyOn(ownership, 'assertDependencyOwner').mockImplementation(
          async (...args) => {
            assertClosed();
            awaitedBoundaries++;
            await assertOwner(...args);
          },
        );
        const inspect = async (refuses: boolean) => {
          try {
            if (refuses) {
              await rejects(context.storage.stores.inspect(), (failure: unknown) => {
                expect(failure).toBeInstanceOf(Error);
                if (!(failure instanceof Error)) return false;
                expect(failure.message).toContain('stage=restoration-store-readback');
                expect(failure.message).not.toContain('PRIVATE_');
                expect(failure.cause).toBeUndefined();
                return true;
              });
            } else await context.storage.stores.inspect();
          } finally {
            assertClosed();
            expect(fixture.commands).toEqual(commands);
            expect(await readFile(policyPath, 'utf8')).toBe(policy);
            expect(fixture.source.State.Running).toBe(false);
            expect(fixture.backend.State.Running).toBe(false);
            expect(fixture.gateway.State.Running).toBe(false);
          }
        };
        try {
          await inspect(false);
          const database = new Database(fixture.devPath, { create: false });
          const migration = database
            .query<{ id: number; name: string; hash: string; created_at: number }, []>(
              "SELECT id,name,hash,created_at FROM __drizzle_migrations WHERE name NOT IN ('20261022211000_add_external_dependencies','20261022212000_add_cross_project_dependency_activation') ORDER BY name LIMIT 1",
            )
            .get();
          try {
            if (migration === null) throw new Error('actual retained migration absent');
            database.query('DELETE FROM __drizzle_migrations WHERE id=?').run(migration.id);
          } finally {
            database.close();
          }
          try {
            await inspect(true);
          } finally {
            const repaired = new Database(fixture.devPath, { create: false });
            try {
              repaired
                .query(
                  'INSERT INTO __drizzle_migrations (id,name,hash,created_at) VALUES (?,?,?,?)',
                )
                .run(migration.id, migration.name, migration.hash, migration.created_at);
            } finally {
              repaired.close();
            }
          }
          await inspect(false);
          const authority = new Database(fixture.devPath, { create: false });
          try {
            authority.run(
              "UPDATE cross_project_dependency_activation SET state='ENABLED' WHERE id=1",
            );
          } finally {
            authority.close();
          }
          try {
            await inspect(true);
          } finally {
            const repaired = new Database(fixture.devPath, { create: false });
            try {
              repaired.run(
                "UPDATE cross_project_dependency_activation SET state='DISABLED' WHERE id=1",
              );
            } finally {
              repaired.close();
            }
          }
          await inspect(false);
          const retainedMain = fixture.prodPath + '.PRIVATE_retained';
          await rename(fixture.prodPath, retainedMain);
          try {
            await copyFile(retainedMain, fixture.prodPath);
            await inspect(true);
          } finally {
            await rm(fixture.prodPath, { force: true });
            await rename(retainedMain, fixture.prodPath);
          }
          await inspect(false);
          const parent = dirname(fixture.prodPath);
          const retainedParent = parent + '.PRIVATE_retained';
          await rename(parent, retainedParent);
          try {
            await mkdir(parent);
            await link(join(retainedParent, basename(fixture.prodPath)), fixture.prodPath);
            await inspect(true);
          } finally {
            await rm(parent, { recursive: true, force: true });
            await rename(retainedParent, parent);
          }
          await inspect(false);
          expect(awaitedBoundaries).toBeGreaterThan(0);
        } finally {
          boundary.mockRestore();
        }
      } finally {
        releasePreparedDependencyActivation(owner, prepared);
      }
    },
    fixture.root,
  );
}, 300000);
