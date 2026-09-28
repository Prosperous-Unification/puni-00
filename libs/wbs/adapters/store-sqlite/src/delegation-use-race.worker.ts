import { openConnection } from './db';
import { SqliteDelegationUse } from './delegation-use';

interface RaceRequest {
  readonly path: string;
  readonly barrier: SharedArrayBuffer;
}

/** Starts a separate SQLite writer after both worker connections are ready. */
self.onmessage = (message: MessageEvent<RaceRequest>) => {
  const connection = openConnection(message.data.path);
  const barrier = new Int32Array(message.data.barrier);
  Atomics.add(barrier, 0, 1);
  Atomics.notify(barrier, 0);
  Atomics.wait(barrier, 1, 0);
  try {
    self.postMessage(new SqliteDelegationUse(connection.db).consume('wbs', 'same', 200, 100));
  } finally {
    connection.close();
  }
};
