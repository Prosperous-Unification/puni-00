import { writeFile } from 'node:fs/promises';

import { openConnection } from '@wbs/store-sqlite/db';
import { digestSharedPeople } from '@wbs/store-sqlite/shared-people-backup';
import {
  removeSharedPeople,
  restoreSharedPeople,
  saveSharedPeople,
} from '@wbs/store-sqlite/shared-people-rollback';

const args = process.argv.slice(2);
const [command, file] = args;
// Proof: removing argument validation loses the usage refusal in the real CLI negative.
if (
  (command !== 'save' && command !== 'remove' && command !== 'restore' && command !== 'digest') ||
  args.length !== 2 ||
  file === ''
) {
  throw new Error('usage: shared-people-rollback-cli.ts <save|remove|restore|digest> <file>');
}
// Proof: requiring DB_PATH here failed the no-DB digest process case; opening it failed the poison-DB case.
if (command === 'digest') {
  const backup: unknown = await Bun.file(file).json();
  console.log(digestSharedPeople(backup));
} else {
  const dbPath = process.env['DB_PATH'];
  // Proof: bypassing the environment guard loses the named DB_PATH refusal in the real CLI test.
  if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');
  if (command === 'save') {
    const saved = saveSharedPeople(dbPath);
    // Proof: replacing wx with w overwrites the existing recovery file; 0644 fails the private-file assertion.
    await writeFile(file, JSON.stringify(saved), { flag: 'wx', mode: 0o600 });
    console.log(
      `shared people saved: ${String(saved.organizations.length)} organizations, ${String(saved.ranks.length)} ranks`,
    );
  } else {
    const backup: unknown = await Bun.file(file).json();
    const connection = openConnection(dbPath);
    try {
      const count =
        command === 'remove'
          ? removeSharedPeople(connection.db, backup, Date.now())
          : restoreSharedPeople(connection.db, backup, Date.now());
      console.log(
        `shared people ${command}: ${String(count.organizations)} organizations, ${String(count.ranks)} ranks`,
      );
    } finally {
      connection.close();
    }
  }
}
