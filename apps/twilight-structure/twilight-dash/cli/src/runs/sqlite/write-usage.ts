import { parseOrThrow, type } from '@shared/validation';
import type { Database } from 'bun:sqlite';
// Proof: usage-marker-values broke “every public entry audits malformed semantic usage marker behind plausible current write state”; exact source hash restored.
const usageCodec = type({ singleton: '1', used: '0 | 1' }).onUndeclaredKey('reject');
/** Required format6 marker distinguishes preserving copy from every applied semantic mutation. */
export function readWriteUsage(database: Database): 0 | 1 {
  const markers = database.query('SELECT * FROM run6_usage').all();
  // Proof: usage-marker-cardinality broke “every public entry audits duplicate semantic usage marker behind plausible current write state”; exact source hash restored.
  if (markers.length !== 1) throw new Error('corrupt write usage marker');
  return parseOrThrow(usageCodec, markers[0]).used;
}
/** Must succeed inside the existing publication transaction, including when the marker was already used. */
export function markWriteUsage(database: Database): void {
  const update = database
    .query('UPDATE run6_usage SET used=1 WHERE singleton=1 AND used IN (0,1)')
    .run();
  // Proof: usage-update-count broke “semantic usage ignored update aborts actual stage before publishing a bundle”; exact source hash restored.
  if (update.changes !== 1 || readWriteUsage(database) !== 1)
    throw new Error('write usage marker was not updated');
}
