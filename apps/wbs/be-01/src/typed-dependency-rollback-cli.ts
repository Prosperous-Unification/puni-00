import { openConnection } from '@wbs/store-sqlite/db';
import {
  removeSavedTypedDependencies,
  restoreTypedDependencies,
  saveTypedDependencies,
} from '@wbs/store-sqlite/typed-dependency-rollback';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');

const args = process.argv.slice(2);
const [command, file] = args;
// Proof: bypassing this guard made `saves, removes and restores typed rows
// through the rollback CLI` fail on `Expected to contain: "usage:"` for
// `erase` instead of refusing that command; watched 2026-09-27.
if (
  (command !== 'save' && command !== 'remove' && command !== 'restore') ||
  file === '' ||
  args.length !== 2
) {
  throw new Error('usage: typed-dependency-rollback-cli.ts <save|remove|restore> <file>');
}

const connection = openConnection(dbPath);
try {
  if (command === 'save') {
    const saved = saveTypedDependencies(connection.db);
    await Bun.write(file, JSON.stringify(saved));
    console.log(`typed dependencies saved: ${String(saved.rows.length)}`);
  } else {
    const saved: unknown = await Bun.file(file).json();
    const count =
      command === 'remove'
        ? removeSavedTypedDependencies(connection.db, saved)
        : restoreTypedDependencies(connection.db, saved);
    console.log(
      `typed dependencies ${command === 'remove' ? 'removed' : 'restored'}: ${String(count)}`,
    );
  }
} finally {
  connection.close();
}
