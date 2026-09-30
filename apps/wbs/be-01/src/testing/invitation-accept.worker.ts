import { openConnection } from '@wbs/store-sqlite/db';
import { OPEN } from '@wbs/store-sqlite/gate';
import { InvitationRepository } from '@wbs/store-sqlite/invitation';

// Deep imports, not the `@wbs/store-sqlite` barrel: loading the whole store
// took this child 1.3 s on an idle machine and more than 5 s on a loaded CI runner.
const [databasePath] = process.argv.slice(2);
if (!databasePath) throw new Error('missing database path argument');

const connection = openConnection(databasePath);
try {
  process.stdout.write('ready\n');
  // The release is one stdin line carrying the acceptance, so the parent can
  // start this child before the invitation exists and overlap its cold start.
  let release: string | undefined;
  for await (const line of console) {
    release = line;
    break;
  }
  if (release === undefined) throw new Error('stdin closed before the release line');
  // Trusted: the parent test writes this line with JSON.stringify.
  const { userId, digest } = JSON.parse(release) as { userId: string; digest: string };
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
