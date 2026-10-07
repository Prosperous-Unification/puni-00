import { existsSync } from 'node:fs';

import { openConnection } from '@wbs/store-sqlite/db';
import { OPEN } from '@wbs/store-sqlite/gate';
import { JoinRequestRepository } from '@wbs/store-sqlite/join-request';

// Deep imports, not the `@wbs/store-sqlite` barrel, which loads the whole store.
const [databasePath, actorId, requestId, decision, lane] = process.argv.slice(2);
if (!databasePath || !actorId || !requestId || !decision || !lane)
  throw new Error('missing worker argument');
if (decision !== 'approve' && decision !== 'deny') throw new Error('invalid decision');

const connection = openConnection(databasePath);
try {
  process.stdout.write('ready\n');
  while (!existsSync(`${databasePath}.go`)) await Bun.sleep(1);
  process.stdout.write('attempt\n');
  const repository = new JoinRequestRepository(connection.db, OPEN);
  const stamp = { at: Date.now(), by: actorId };
  const answer =
    decision === 'approve'
      ? await repository.approve(
          'org',
          actorId,
          requestId,
          'viewer',
          `${databasePath}.${lane}-digest`,
          stamp.at + 1000,
          stamp,
        )
      : await repository.deny('org', actorId, requestId, stamp);
  process.stdout.write(JSON.stringify(answer));
} finally {
  connection.close();
}
