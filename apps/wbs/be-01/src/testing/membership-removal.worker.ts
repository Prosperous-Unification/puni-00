import { openConnection } from '@wbs/store-sqlite/db';
import { OPEN } from '@wbs/store-sqlite/gate';
import { OrganizationRepository } from '@wbs/store-sqlite/organization';

const databasePath = process.argv.at(2);
const actorId = process.argv.at(3);
const targetId = process.argv.at(4);
const source = process.argv.at(5);
if (
  databasePath === undefined ||
  actorId === undefined ||
  targetId === undefined ||
  (source !== 'route' && source !== 'self_leave')
)
  throw new Error('missing membership worker argument');
const connection = openConnection(databasePath);
try {
  process.stdout.write('ready\n');
  let released = false;
  for await (const line of console) {
    if (line !== 'release') throw new Error('invalid membership worker release');
    released = true;
    break;
  }
  if (!released) throw new Error('membership release missing');
  const answer = await new OrganizationRepository(connection.db, OPEN).administer(
    'org',
    { id: actorId },
    targetId,
    { actor: actorId, stamp: { at: 10, by: actorId }, auditId: crypto.randomUUID() },
    source,
  );
  process.stdout.write(JSON.stringify(answer));
} finally {
  connection.close();
}
