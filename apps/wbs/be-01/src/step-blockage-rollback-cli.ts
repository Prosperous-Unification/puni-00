import { writeFile } from 'node:fs/promises';

import { openExistingConnection } from '@wbs/store-sqlite/db';
import {
  removeSavedStepBlockages,
  restoreStepBlockages,
  saveStepBlockages,
} from '@wbs/store-sqlite/step-blockage-rollback';

const path = process.env['DB_PATH'];
// Proof: path guard removed; DB_PATH CLI boundary negative failed; watched 2026-10-13.
if (path === undefined || path === '') throw new Error('DB_PATH must be set');
const args = process.argv.slice(2);
const [command, file] = args;
// Proof: verb, argument-count and empty-file clauses removed separately; CLI
// usage negatives failed each time; watched 2026-10-13.
if (
  (command !== 'save' && command !== 'remove' && command !== 'restore') ||
  args.length !== 2 ||
  file === ''
) {
  throw new Error('usage: step-blockage-rollback-cli.ts <save|remove|restore> <file>');
}
const connection = openExistingConnection(path);
try {
  if (command === 'save') {
    const saved = saveStepBlockages(connection.db);
    // Proof: exclusive flag replaced with 'w'; recovery-file overwrite negative
    // failed because the repeated save exited 0; watched 2026-10-13.
    await writeFile(file, JSON.stringify(saved), { flag: 'wx' });
    console.log(`step blockages saved: ${String(saved.rows.length)}`);
  } else {
    const saved: unknown = await Bun.file(file).json();
    const count =
      command === 'remove'
        ? removeSavedStepBlockages(connection.db, saved)
        : restoreStepBlockages(connection.db, saved);
    console.log(
      `step blockages ${command === 'remove' ? 'removed' : 'restored'}: ${String(count)}`,
    );
  }
} finally {
  connection.close();
}
