import { parseOrThrow, type } from '@shared/validation';
import type { Database } from 'bun:sqlite';

const usageCodec = type({ singleton: '1', used: '0 | 1' }).onUndeclaredKey('reject');

/** The required single marker distinguishes preserving copies from applied format5 semantics. */
export function readIdentityUsage(database: Database): 0 | 1 {
  const markers = database.query('SELECT * FROM run5_usage').all();
  // Proof: Task3 036 removed this count check; public manifest read accepted an extra usage row. Restored 042 passed.
  if (markers.length !== 1) throw new Error('corrupt identity usage marker');
  return parseOrThrow(usageCodec, markers[0]).used;
}

/** Marks applied semantic replies inside their existing transaction; suppressed updates must abort that work. */
export function markIdentityUsage(database: Database): void {
  const update = database
    .query('UPDATE run5_usage SET used=1 WHERE singleton=1 AND used IN (0,1)')
    .run();
  // Proof: Task3 033 removed affected-row validation; a suppressed update of an already-used marker allowed renewal. Task3 034 removed readback; an AFTER trigger reset used=0 and renewal applied. Restored 042 passed both independent negatives.
  if (update.changes !== 1 || readIdentityUsage(database) !== 1)
    throw new Error('identity usage marker was not updated');
}
