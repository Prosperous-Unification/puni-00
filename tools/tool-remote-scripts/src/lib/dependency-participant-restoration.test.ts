import { rejects } from 'node:assert/strict';
import { rm } from 'node:fs/promises';

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
