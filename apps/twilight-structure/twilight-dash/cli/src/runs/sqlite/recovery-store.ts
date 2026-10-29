import type { Database } from 'bun:sqlite';

import type { RecoveryFence, RecoveryHistory } from '../recovery-records';
import { readRuntimeRequest, runtimeScopeKey } from '../runtime-codecs';

/** Publishes a planned revision-zero journal and its active index in the caller's write transaction. Scope, run, attempt and reservation rows remain untouched. */
export function insertRecoveryBegin(database: Database, history: RecoveryHistory): void {
  const { intent } = history;
  const scope = runtimeScopeKey(readRuntimeRequest(intent.target.original.canonicalRequest).scope);
  database
    .query(
      'INSERT INTO run_recovery_journal(recovery_id,command_id,scope_key,revision,record) VALUES (?,?,?,?,?)',
    )
    .run(
      intent.recoveryId,
      intent.target.original.commandId,
      scope,
      history.revision,
      JSON.stringify(intent),
    );
  database
    .query('INSERT INTO run_recovery_active(scope_key,recovery_id) VALUES (?,?)')
    .run(scope, intent.recoveryId);
  database.run(
    'UPDATE run_recovery_format SET journal_count=journal_count+1,active_count=active_count+1 WHERE singleton=1',
  );
}

/** Publishes the fence, journal revision and count within the caller's transaction; runtime and execution rows remain untouched. */
export function insertRecoveryFence(database: Database, fence: RecoveryFence): void {
  database
    .query(
      'INSERT INTO run_recovery_fence(recovery_id,ordinal,command_id,revision,record) VALUES (?,?,?,?,?)',
    )
    .run(
      fence.recoveryId,
      fence.ordinal,
      readRuntimeRequest(fence.canonicalRequest).operation.commandId,
      fence.stagedRevision,
      JSON.stringify(fence),
    );
  database
    .query('UPDATE run_recovery_journal SET revision=? WHERE recovery_id=?')
    .run(fence.stagedRevision, fence.recoveryId);
  database.run('UPDATE run_recovery_format SET fence_count=fence_count+1 WHERE singleton=1');
}
