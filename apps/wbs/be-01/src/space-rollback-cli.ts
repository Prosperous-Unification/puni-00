import { openConnection } from '@wbs/store-sqlite/db';
import { removeSavedSpaces, restoreSpaces, saveSpaces } from '@wbs/store-sqlite/space-rollback';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');

const args = process.argv.slice(2);
const [command, file] = args;
// Proof, observed 2026-09-29: bypassing this guard made `saves, removes and
// restores spaces through the rollback CLI` fail on `Expected to contain:
// "usage:"` for `erase` instead of refusing that command.
if (
  (command !== 'save' && command !== 'remove' && command !== 'restore') ||
  file === '' ||
  args.length !== 2
) {
  throw new Error('usage: space-rollback-cli.ts <save|remove|restore> <file>');
}

const connection = openConnection(dbPath);
try {
  if (command === 'save') {
    const saved = saveSpaces(connection.db);
    await Bun.write(file, JSON.stringify(saved));
    console.log(`spaces saved: ${String(saved.spaces.length)}`);
  } else {
    const saved: unknown = await Bun.file(file).json();
    const count =
      command === 'remove'
        ? removeSavedSpaces(connection.db, saved)
        : restoreSpaces(connection.db, saved);
    console.log(`spaces ${command === 'remove' ? 'removed' : 'restored'}: ${String(count)}`);
  }
} finally {
  connection.close();
}
