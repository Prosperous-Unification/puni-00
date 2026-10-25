import { clockOf, CREATOR_ADMISSION } from '@wbs/core';
import { servicesOver } from '@wbs/core/compose';
import { createPlanCommandRunner } from '@wbs/core/module/plan-commands/composition';
import { recordingBroadcaster } from '@wbs/core/testing/broadcast-fixture';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';

import { openSqliteSource } from './source';

interface RaceRequest {
  readonly path: string;
  readonly barrier: SharedArrayBuffer;
  readonly projectId: string;
  readonly workItemId: string;
  readonly personId: string;
  readonly actorId: string;
}

/**
 * One claim batch on a source of its own, as a second be-01 process would
 * run it: its own connection and its own write coordinator, released together
 * with the other worker's by the barrier.
 */
self.onmessage = async (message: MessageEvent<RaceRequest>) => {
  const { path, barrier, projectId, workItemId, personId, actorId } = message.data;
  const source = openSqliteSource({ dbPath: path });
  try {
    const options = {
      admission: CREATOR_ADMISSION,
      clock: clockOf({ now: () => 2_000, newId: () => crypto.randomUUID() }),
      broadcast: recordingBroadcaster(),
      scheduler: fastScheduler,
    };
    const graph = servicesOver(source.stores, options);
    const runner = createPlanCommandRunner({
      uow: source.uow,
      announcements: options.broadcast,
      publicServices: graph,
      batchServices: (scope, announcements) =>
        servicesOver(scope.stores, { ...options, broadcast: announcements }),
    });
    const state = new Int32Array(barrier);
    Atomics.add(state, 0, 1);
    Atomics.notify(state, 0);
    Atomics.wait(state, 1, 0);
    const outcome = await runner.run(projectId, actorId, [
      { kind: 'claimWorkItem', workItemId, personId },
    ]);
    self.postMessage(outcome.ok ? 'applied' : outcome.reason);
  } finally {
    await source.close();
  }
};
