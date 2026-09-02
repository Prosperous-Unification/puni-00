import { type Broadcaster, DeferringBroadcaster } from '../service/broadcast';
import type { OuterTransaction } from '../service/outer-transaction';
import { WriteLock } from '../service/write-lock';

/**
 * An {@link OuterTransaction} for tests whose stores are the in-memory
 * fixtures: there is no connection to hold a transaction on, so the three calls
 * only count. Atomicity itself is proven on real SQLite in
 * `plan-commands.test.ts`; what a test on the fixtures can still assert is that
 * the runner opened, and committed or rolled back, exactly once.
 */
export function countingOuterTransaction(): OuterTransaction & {
  readonly calls: ('begin' | 'commit' | 'rollback')[];
} {
  const calls: ('begin' | 'commit' | 'rollback')[] = [];
  return {
    calls,
    begin() {
      calls.push('begin');
    },
    commit() {
      calls.push('commit');
    },
    rollback() {
      calls.push('rollback');
    },
  };
}

/** What `buildApp` needs to run command batches, for a test on the fixtures. */
export function testWrites(broadcast: Broadcaster = silentBroadcaster()): {
  transactions: ReturnType<typeof countingOuterTransaction>;
  lock: WriteLock;
  announcements: DeferringBroadcaster;
} {
  return {
    transactions: countingOuterTransaction(),
    lock: new WriteLock(),
    // Wrapping the broadcaster the services were built with is the whole
    // contract: a second one would hold nothing, and the runner would drain an
    // empty queue while the services published straight through it.
    announcements: new DeferringBroadcaster(broadcast),
  };
}

/** A broadcaster for a test that does not read what was published. */
function silentBroadcaster(): Broadcaster {
  return {
    publish: () => Promise.resolve(),
    latestSeq: () => Promise.resolve(-1),
  };
}
