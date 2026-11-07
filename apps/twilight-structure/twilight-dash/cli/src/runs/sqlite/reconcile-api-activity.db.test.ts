import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { organizationId } from '../record-codecs';
import { apiRecoveryContract } from '../testing/api-recovery-contract';
import { FixtureClock } from '../testing/fixtures';
import { bootstrapSqliteStores, openSqliteStores } from './open-stores';

apiRecoveryContract('SQLite reopened API recovery', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'api-recovery-'));
  const clock = new FixtureClock();
  const options = {
    path: join(directory, 'runs.sqlite'),
    organizationId: organizationId('organization'),
    capacity: 2,
    leaseMilliseconds: 100,
    clock,
    maxBusyAttempts: 20,
    busyDelayMilliseconds: 1,
  };
  let active = await bootstrapSqliteStores(options);
  return {
    get runs() {
      return active.runs;
    },
    get artifacts() {
      return active.artifacts;
    },
    get ownership() {
      return active.ownership;
    },
    clock,
    async reopen() {
      await active.close();
      active = await openSqliteStores(options);
    },
    async close() {
      await active.close();
      rmSync(directory, { recursive: true });
    },
  };
});
