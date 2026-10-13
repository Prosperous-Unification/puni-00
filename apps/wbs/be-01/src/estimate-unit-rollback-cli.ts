import { openConnection } from '@wbs/store-sqlite/db';
import {
  removeSavedEstimateUnits,
  restoreEstimateUnits,
  saveEstimateUnits,
} from '@wbs/store-sqlite/estimate-unit-rollback';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');
const args = process.argv.slice(2);
const [command, file] = args;
// Proof: bypassing usage validation read a nonexistent file instead of refusing erase; CLI usage test failed (2026-10-12).
if (
  (command !== 'save' && command !== 'remove' && command !== 'restore') ||
  file === '' ||
  args.length !== 2
) {
  throw new Error('usage: estimate-unit-rollback-cli.ts <save|remove|restore> <file>');
}
const connection = openConnection(dbPath);
try {
  if (command === 'save') {
    const saved = saveEstimateUnits(connection.db);
    await Bun.write(file, JSON.stringify(saved));
    console.log(
      `estimate units saved: ${String(saved.steps.length)}, estimates: ${String(saved.rows.length)}`,
    );
  } else {
    const saved: unknown = await Bun.file(file).json();
    const counts =
      command === 'remove'
        ? removeSavedEstimateUnits(connection.db, saved)
        : restoreEstimateUnits(connection.db, saved);
    console.log(
      `estimate units ${command === 'remove' ? 'removed' : 'restored'}: ${String(counts.steps)}, estimates: ${String(counts.rows)}`,
    );
  }
} finally {
  connection.close();
}
