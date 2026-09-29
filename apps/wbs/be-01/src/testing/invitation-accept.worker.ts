import { existsSync } from 'node:fs';

import { openConnection } from '@wbs/store-sqlite/db';
import { OPEN } from '@wbs/store-sqlite/gate';
import { InvitationRepository } from '@wbs/store-sqlite/invitation';

// Deep imports, not the `@wbs/store-sqlite` barrel: loading the whole store
// took this child 1.3 s on an idle machine and more than 5 s on a loaded CI runner.
const [databasePath, userId, digest] = process.argv.slice(2);
if (!databasePath || !userId || !digest) throw new Error('missing worker argument');

const connection = openConnection(databasePath);
try {
  process.stdout.write('ready\n');
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
