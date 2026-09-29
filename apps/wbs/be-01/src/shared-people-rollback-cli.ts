import { openConnection } from '@wbs/store-sqlite/db';
import {
  removeSavedSharedPeople,
  restoreSharedPeople,
  saveSharedPeople,
} from '@wbs/store-sqlite/shared-people-rollback';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');

const args = process.argv.slice(2);
const [command, file] = args;
// Proof, observed 2026-09-29: this guard cut to the empty-file check made
// `saves, resets and restores shared organizations through the rollback CLI`
// fail on `Expected: not 0`: `erase` ran as a restore instead of refusing.
if (
  (command !== 'save' && command !== 'remove' && command !== 'restore') ||
  file === '' ||
  args.length !== 2
) {
  throw new Error('usage: shared-people-rollback-cli.ts <save|remove|restore> <file>');
}

const connection = openConnection(dbPath);
try {
  if (command === 'save') {
    const saved = saveSharedPeople(connection.db);
    await Bun.write(file, JSON.stringify(saved));
    console.log(`shared organizations saved: ${String(saved.organizations.length)}`);
  } else {
    const saved: unknown = await Bun.file(file).json();
    const count =
      command === 'remove'
        ? removeSavedSharedPeople(connection.db, saved, Date.now())
        : restoreSharedPeople(connection.db, saved, Date.now());
    console.log(
      `shared organizations ${command === 'remove' ? 'reset' : 'restored'}: ${String(count)}`,
    );
  }
} finally {
  connection.close();
}
