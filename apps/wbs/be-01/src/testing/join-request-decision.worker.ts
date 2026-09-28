import { existsSync, writeFileSync } from 'node:fs';

import { JoinRequestRepository, OPEN, openConnection } from '@wbs/store-sqlite';

const [databasePath, actorId, requestId, decision, marker] = process.argv.slice(2);
if (!databasePath || !actorId || !requestId || !decision || !marker)
  throw new Error('missing worker argument');
if (decision !== 'approve' && decision !== 'deny') throw new Error('invalid decision');

const connection = openConnection(databasePath);
try {
  writeFileSync(`${marker}.ready`, 'ready');
  while (!existsSync(`${databasePath}.go`)) await Bun.sleep(1);
  writeFileSync(`${marker}.attempt`, 'attempt');
  const repository = new JoinRequestRepository(connection.db, OPEN);
  const stamp = { at: Date.now(), by: actorId };
  const answer =
    decision === 'approve'
      ? await repository.approve(
          'org',
          actorId,
          requestId,
          'viewer',
          `${marker}-digest`,
          stamp.at + 1000,
          stamp,
        )
      : await repository.deny('org', actorId, requestId, stamp);
  process.stdout.write(JSON.stringify(answer));
} finally {
  connection.close();
}
