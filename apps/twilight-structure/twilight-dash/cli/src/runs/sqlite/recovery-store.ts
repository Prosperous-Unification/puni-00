import type { Database } from 'bun:sqlite';

import type { RecoveryResolutionPlan } from '../plan-recovery';
import type { RecoveryFence, RecoveryHistory, RecoveryObservation } from '../recovery-records';
import { readRuntimeRequest, runtimeScopeKey } from '../runtime-codecs';
import { insertRuntimeAcceptance } from './runtime-store';

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

/** Publishes the complete observation, revision and count in the caller's transaction without changing execution or scope rows. */
export function insertRecoveryObservation(
  database: Database,
  observation: RecoveryObservation,
): void {
  database
    .query(
      'INSERT INTO run_recovery_observation(recovery_id,ordinal,revision,record) VALUES (?,?,?,?)',
    )
    .run(
      observation.fence.recoveryId,
      observation.fence.ordinal,
      observation.observedRevision,
      JSON.stringify(observation),
    );
  database
    .query('UPDATE run_recovery_journal SET revision=? WHERE recovery_id=?')
    .run(observation.observedRevision, observation.fence.recoveryId);
  database.run(
    'UPDATE run_recovery_format SET observation_count=observation_count+1 WHERE singleton=1',
  );
}

/** Proof: T6S07 injecting readHistory after original writes triggered the production-path no-intermediate-read assertion; exact restoration passed. Applies only the precomputed complete closure within the caller's synchronous write transaction. No reads, plans or public ports occur between writes; reservations stay held. */
export function insertRecoveryResolution(
  database: Database,
  plan: RecoveryResolutionPlan,
  previousAcceptances: number,
): void {
  const scope = runtimeScopeKey(plan.barrier.scope);
  if (plan.originalAcceptance !== null)
    insertRuntimeAcceptance(
      database,
      plan.barrier.scope,
      plan.originalAcceptance,
      previousAcceptances,
    );
  if (plan.originalExecution !== null) {
    const { reply, ...execution } = plan.originalExecution;
    database
      .query('INSERT INTO run_execution(command_id,attempt_id,record,reply) VALUES (?,?,?,?)')
      .run(
        execution.command.commandId,
        reply.attempt.attemptId,
        JSON.stringify(execution),
        JSON.stringify(reply),
      );
  }
  database
    .query('INSERT INTO run_recovery_closure(recovery_id,revision,record) VALUES (?,?,?)')
    .run(plan.closure.recoveryId, plan.closure.resolvedRevision, JSON.stringify(plan.closure));
  database
    .query(
      'INSERT INTO run_recovery_barrier(scope_key,scope_after,recovery_id,record) VALUES (?,?,?,?)',
    )
    .run(scope, plan.barrier.scopeAfter, plan.closure.recoveryId, JSON.stringify(plan.barrier));
  if (plan.attempt !== null)
    database
      .query('UPDATE run_attempt SET record=? WHERE attempt_id=?')
      .run(JSON.stringify(plan.attempt), plan.attempt.attemptId);
  if (plan.run !== null)
    database
      .query('UPDATE run_record SET record=? WHERE run_id=?')
      .run(JSON.stringify(plan.run), plan.run.runId);
  database
    .query('UPDATE run_runtime_scope SET revision=? WHERE scope_key=?')
    .run(plan.closure.scopeAfter, scope);
  database
    .query('UPDATE run_recovery_journal SET revision=? WHERE recovery_id=?')
    .run(plan.history.revision, plan.closure.recoveryId);
  database
    .query('DELETE FROM run_recovery_active WHERE recovery_id=?')
    .run(plan.closure.recoveryId);
  database
    .query(
      'UPDATE run_recovery_format SET journal_count=?,fence_count=?,observation_count=?,closure_count=?,barrier_count=?,active_count=? WHERE singleton=1',
    )
    .run(
      plan.counts.journals,
      plan.counts.fences,
      plan.counts.observations,
      plan.counts.closures,
      plan.counts.barriers,
      plan.counts.active,
    );
}
