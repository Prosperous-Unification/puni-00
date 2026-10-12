import { openConnection } from './db';
import { WriteCoordinator } from './gate';
import { StepNodeAttemptRepository } from './step-node-attempt';

interface RaceRequest {
  readonly path: string;
  readonly barrier: SharedArrayBuffer;
  readonly startedAt: number;
}

/**
 * Starts an attempt on `a`/`dev` from its own connection once both workers are
 * ready, answering the store's outcome or the message of what it threw.
 */
self.onmessage = async (message: MessageEvent<RaceRequest>) => {
  const connection = openConnection(message.data.path);
  const barrier = new Int32Array(message.data.barrier);
  Atomics.add(barrier, 0, 1);
  Atomics.notify(barrier, 0);
  Atomics.wait(barrier, 1, 0);
  try {
    const started = await new StepNodeAttemptRepository(
      connection.db,
      new WriteCoordinator(),
    ).start(
      {
        workItemId: 'a',
        stepId: 'dev',
        startedAt: message.data.startedAt,
        executorPersonId: null,
        reference: null,
        note: null,
      },
      { at: message.data.startedAt, by: 'u' },
    );
    self.postMessage(started.ok ? 'started' : started.reason);
  } catch (cause) {
    self.postMessage(cause instanceof Error ? `threw: ${cause.message}` : 'threw');
  } finally {
    connection.close();
  }
};
