import { openConnection } from '@wbs/store-sqlite/db';
import {
  removeSavedStepNodeAttempts,
  restoreStepNodeAttempts,
  saveStepNodeAttempts,
} from '@wbs/store-sqlite/step-node-attempt-rollback';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');

const args = process.argv.slice(2);
const [command, file] = args;
// Proof: bypassing this guard made `guards the attempt rollback CLI usage and
// refuses a database without attempts` fail on `Expected to contain: "usage:"`:
// `erase` went on to read the file it was given (ENOENT); watched 2026-10-12.
if (
  (command !== 'save' && command !== 'remove' && command !== 'restore') ||
  file === '' ||
  args.length !== 2
) {
  throw new Error('usage: step-node-attempt-rollback-cli.ts <save|remove|restore> <file>');
}

const connection = openConnection(dbPath);
try {
  if (command === 'save') {
    const saved = saveStepNodeAttempts(connection.db);
    await Bun.write(file, JSON.stringify(saved));
    console.log(`step node attempts saved: ${String(saved.rows.length)}`);
  } else {
    const saved: unknown = await Bun.file(file).json();
    const count =
      command === 'remove'
        ? removeSavedStepNodeAttempts(connection.db, saved)
        : restoreStepNodeAttempts(connection.db, saved);
    console.log(
      `step node attempts ${command === 'remove' ? 'removed' : 'restored'}: ${String(count)}`,
    );
  }
} finally {
  connection.close();
}
