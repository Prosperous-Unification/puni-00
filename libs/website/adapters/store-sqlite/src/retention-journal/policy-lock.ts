import { Database } from 'bun:sqlite';

/** How long a policy mutation waits for another process's policy lock before refusing. */
export const policyLockTimeoutMilliseconds = 30_000;

const pollMilliseconds = 50;

/** Another process held the retention policy lock for the whole bounded wait. */
export class RetentionPolicyBusyError extends Error {
  override readonly name = 'RetentionPolicyBusyError';
}

function isBusy(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'SQLITE_BUSY';
}

/**
 * Runs `work` while holding the cross-process retention policy lock: `BEGIN IMMEDIATE` on the
 * separate file `<databasePath>.policy-lock`, so journal round trips never hold the primary
 * database's write lock (veto V9). The wait polls without blocking the event loop and gives up
 * after `timeoutMilliseconds`. The file is ephemeral and outside every backup.
 *
 * @throws RetentionPolicyBusyError when the wait expires; `work`'s own error otherwise.
 */
export async function withPolicyLock<T>(
  databasePath: string,
  work: () => Promise<T>,
  timeoutMilliseconds = policyLockTimeoutMilliseconds,
): Promise<T> {
  // Proof: running `work` without the lock made `concurrent appends serialise under the policy lock` reject one append.
  const lock = new Database(`${databasePath}.policy-lock`, { create: true });
  try {
    lock.run('PRAGMA busy_timeout = 0');
    lock.run('CREATE TABLE IF NOT EXISTS policy_lock (singleton INTEGER PRIMARY KEY)');
    const deadline = Date.now() + timeoutMilliseconds;
    for (;;) {
      try {
        lock.run('BEGIN IMMEDIATE');
        break;
      } catch (error) {
        if (!isBusy(error)) throw error;
        // Proof: never expiring made `policy lock expiry refuses, not hangs` wait out the 3 s holder and resolve.
        if (Date.now() >= deadline)
          throw new RetentionPolicyBusyError(
            `retention policy lock ${databasePath}.policy-lock is held by another process`,
            { cause: error },
          );
        await Bun.sleep(pollMilliseconds);
      }
    }
    try {
      return await work();
    } finally {
      lock.run('ROLLBACK');
    }
  } finally {
    lock.close();
  }
}
