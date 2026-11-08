import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { organizationId } from '../record-codecs';
import { claimRequestContract } from '../testing/claim-request-contract';
import { FixtureClock } from '../testing/fixtures';
import { bootstrapSqliteStores } from './open-stores';

claimRequestContract('sqlite claim request', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'claim-request-'));
  const clock = new FixtureClock();
  try {
    const connection = await bootstrapSqliteStores({
      path: join(directory, 'runs.sqlite'),
      organizationId: organizationId('organization'),
      capacity: 2,
      leaseMilliseconds: 100,
      clock,
      maxBusyAttempts: 20,
      busyDelayMilliseconds: 1,
    });
    let closing: Promise<void> | undefined;
    return {
      ...connection,
      clock,
      close(): Promise<void> {
        if (closing !== undefined) return closing;
        closing = (async () => {
          await connection.close();
          rmSync(directory, { recursive: true, force: true });
        })();
        return closing;
      },
    };
  } catch (cause) {
    rmSync(directory, { recursive: true, force: true });
    throw cause;
  }
});
