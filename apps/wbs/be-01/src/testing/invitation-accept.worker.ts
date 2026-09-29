import { existsSync, writeFileSync } from 'node:fs';

import { InvitationRepository, OPEN, openConnection } from '@wbs/store-sqlite';

const [databasePath, userId, digest, marker] = process.argv.slice(2);
if (!databasePath || !userId || !digest || !marker) throw new Error('missing worker argument');

const connection = openConnection(databasePath);
try {
  writeFileSync(`${marker}.ready`, 'ready');
  while (!existsSync(`${databasePath}.go`)) await Bun.sleep(1);
  const answer = await new InvitationRepository(connection.db, OPEN).accept(
    userId,
    digest,
    userId,
    Date.now,
  );
  process.stdout.write(JSON.stringify(answer));
} finally {
  connection.close();
}
