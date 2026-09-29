import { openConnection } from '@wbs/store-sqlite/db';
import {
  removeSavedWorkItemStatusFacts,
  restoreWorkItemStatusFacts,
  saveWorkItemStatusFacts,
} from '@wbs/store-sqlite/work-item-status-facts-rollback';

const dbPath = process.env['DB_PATH'];
if (dbPath === undefined || dbPath === '') throw new Error('DB_PATH must be set');

const args = process.argv.slice(2);
const [command, file] = args;
// Proof: bypassing this guard made `saves, removes and restores readiness and
// holds through the rollback CLI` fail on `Expected: not 0`: `erase` exited 0
// instead of being refused; watched 2026-09-29.
if (
  (command !== 'save' && command !== 'remove' && command !== 'restore') ||
  file === '' ||
  args.length !== 2
) {
  throw new Error('usage: work-item-status-facts-rollback-cli.ts <save|remove|restore> <file>');
}

const connection = openConnection(dbPath);
try {
  if (command === 'save') {
    const saved = saveWorkItemStatusFacts(connection.db);
    await Bun.write(file, JSON.stringify(saved));
    console.log(`work item status facts saved: ${String(saved.rows.length)}`);
  } else {
    const saved: unknown = await Bun.file(file).json();
    const count =
      command === 'remove'
        ? removeSavedWorkItemStatusFacts(connection.db, saved, Date.now())
        : restoreWorkItemStatusFacts(connection.db, saved, Date.now());
    console.log(
      `work item status facts ${command === 'remove' ? 'removed' : 'restored'}: ${String(count)}`,
    );
  }
} finally {
  connection.close();
}
