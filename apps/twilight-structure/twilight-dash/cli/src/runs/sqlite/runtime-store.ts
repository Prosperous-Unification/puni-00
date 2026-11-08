import type { Database } from 'bun:sqlite';

import { addInteger } from '../record-codecs';
import { runtimeScopeKey } from '../runtime-codecs';
import type {
  RuntimeAcceptance,
  RuntimeIntent,
  RuntimePin,
  RuntimeScope,
} from '../runtime-records';
import { CURRENT_FORMAT } from './schema';

/** Writes named rows and retained counters only inside the provider's existing verified write transaction. */
export function insertRuntimePin(database: Database, pin: RuntimePin, previousCount: number): void {
  database
    .query(
      `INSERT INTO ${CURRENT_FORMAT.family.runtime_scope}(scope_key,pin,revision) VALUES (?,?,0)`,
    )
    .run(runtimeScopeKey(pin.scope), JSON.stringify(pin));
  database
    .query(`UPDATE ${CURRENT_FORMAT.family.runtime_format} SET scope_count=? WHERE singleton=1`)
    .run(addInteger(previousCount, 1));
}
/** Commits one scope revision, exact intent and count together; no run, attempt or reservation is touched. */
export function insertRuntimeIntent(
  database: Database,
  scope: RuntimeScope,
  intent: RuntimeIntent,
  previousCount: number,
): void {
  const key = runtimeScopeKey(scope);
  database
    .query(
      `INSERT INTO ${CURRENT_FORMAT.family.runtime_intent}(command_id,scope_key,record) VALUES (?,?,?)`,
    )
    .run(CURRENT_FORMAT.encode(intent.commandId), key, JSON.stringify(intent));
  database
    .query(`UPDATE ${CURRENT_FORMAT.family.runtime_scope} SET revision=? WHERE scope_key=?`)
    .run(intent.stagedRevision, key);
  database
    .query(`UPDATE ${CURRENT_FORMAT.family.runtime_format} SET intent_count=? WHERE singleton=1`)
    .run(addInteger(previousCount, 1));
}
/** Commits immutable evidence, its consecutive revision and count in the existing transaction. Receipt bytes must already be independently verified. */
export function insertRuntimeAcceptance(
  database: Database,
  scope: RuntimeScope,
  acceptance: RuntimeAcceptance,
  previousCount: number,
): void {
  const key = runtimeScopeKey(scope);
  database
    .query(
      `INSERT INTO ${CURRENT_FORMAT.family.runtime_acceptance}(command_id,scope_key,record) VALUES (?,?,?)`,
    )
    .run(CURRENT_FORMAT.encode(acceptance.commandId), key, JSON.stringify(acceptance));
  database
    .query(`UPDATE ${CURRENT_FORMAT.family.runtime_scope} SET revision=? WHERE scope_key=?`)
    .run(acceptance.acceptedRevision, key);
  database
    .query(
      `UPDATE ${CURRENT_FORMAT.family.runtime_format} SET acceptance_count=? WHERE singleton=1`,
    )
    .run(addInteger(previousCount, 1));
}
