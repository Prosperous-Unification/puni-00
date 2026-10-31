import type { Database } from 'bun:sqlite';

import type { RecoveryResolutionPlan } from '../plan-recovery';
import type { RecoveryFence, RecoveryHistory, RecoveryObservation } from '../recovery-records';
import { readRuntimeRequest, runtimeScopeKey } from '../runtime-codecs';
import { insertRuntimeAcceptance } from './runtime-store';
import { CURRENT_FORMAT } from './schema';

/** Publishes a planned revision-zero journal and its active index in the caller's write transaction. Scope, run, attempt and reservation rows remain untouched. */
export function insertRecoveryBegin(database: Database, history: RecoveryHistory): void {
  const { intent } = history;
  const scope = runtimeScopeKey(readRuntimeRequest(intent.target.original.canonicalRequest).scope);
  database
    .query(
      `INSERT INTO ${CURRENT_FORMAT.family.recovery_journal}(recovery_id,command_id,scope_key,revision,record) VALUES (?,?,?,?,?)`,
    )
    .run(
      CURRENT_FORMAT.encode(intent.recoveryId),
      CURRENT_FORMAT.encode(intent.target.original.commandId),
      scope,
      history.revision,
      JSON.stringify(intent),
    );
  database
    .query(
      `INSERT INTO ${CURRENT_FORMAT.family.recovery_active}(scope_key,recovery_id) VALUES (?,?)`,
    )
    .run(scope, CURRENT_FORMAT.encode(intent.recoveryId));
  database.run(
    `UPDATE ${CURRENT_FORMAT.family.recovery_format} SET journal_count=journal_count+1,active_count=active_count+1 WHERE singleton=1`,
  );
}

/** Publishes the fence, journal revision and count within the caller's transaction; runtime and execution rows remain untouched. */
export function insertRecoveryFence(database: Database, fence: RecoveryFence): void {
  database
    .query(
      `INSERT INTO ${CURRENT_FORMAT.family.recovery_fence}(recovery_id,ordinal,command_id,revision,record) VALUES (?,?,?,?,?)`,
    )
    .run(
      CURRENT_FORMAT.encode(fence.recoveryId),
      fence.ordinal,
      CURRENT_FORMAT.encode(readRuntimeRequest(fence.canonicalRequest).operation.commandId),
      fence.stagedRevision,
      JSON.stringify(fence),
    );
  database
    .query(`UPDATE ${CURRENT_FORMAT.family.recovery_journal} SET revision=? WHERE recovery_id=?`)
    .run(fence.stagedRevision, CURRENT_FORMAT.encode(fence.recoveryId));
  database.run(
    `UPDATE ${CURRENT_FORMAT.family.recovery_format} SET fence_count=fence_count+1 WHERE singleton=1`,
  );
}

/** Publishes the complete observation, revision and count in the caller's transaction without changing execution or scope rows. */
export function insertRecoveryObservation(
  database: Database,
  observation: RecoveryObservation,
): void {
  database
    .query(
      `INSERT INTO ${CURRENT_FORMAT.family.recovery_observation}(recovery_id,ordinal,revision,record) VALUES (?,?,?,?)`,
    )
    .run(
      CURRENT_FORMAT.encode(observation.fence.recoveryId),
      observation.fence.ordinal,
      observation.observedRevision,
      JSON.stringify(observation),
    );
  database
    .query(`UPDATE ${CURRENT_FORMAT.family.recovery_journal} SET revision=? WHERE recovery_id=?`)
    .run(observation.observedRevision, CURRENT_FORMAT.encode(observation.fence.recoveryId));
  database.run(
    `UPDATE ${CURRENT_FORMAT.family.recovery_format} SET observation_count=observation_count+1 WHERE singleton=1`,
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
      .query(
        `INSERT INTO ${CURRENT_FORMAT.family.execution}(command_id,attempt_id,record,reply) VALUES (?,?,?,?)`,
      )
      .run(
        CURRENT_FORMAT.encode(execution.command.commandId),
        CURRENT_FORMAT.encode(reply.attempt.attemptId),
        JSON.stringify(execution),
        JSON.stringify(reply),
      );
  }
  database
    .query(
      `INSERT INTO ${CURRENT_FORMAT.family.recovery_closure}(recovery_id,revision,record) VALUES (?,?,?)`,
    )
    .run(
      CURRENT_FORMAT.encode(plan.closure.recoveryId),
      plan.closure.resolvedRevision,
      JSON.stringify(plan.closure),
    );
  database
    .query(
      `INSERT INTO ${CURRENT_FORMAT.family.recovery_barrier}(scope_key,scope_after,recovery_id,record) VALUES (?,?,?,?)`,
    )
    .run(
      scope,
      plan.barrier.scopeAfter,
      CURRENT_FORMAT.encode(plan.closure.recoveryId),
      JSON.stringify(plan.barrier),
    );
  if (plan.attempt !== null)
    database
      .query(`UPDATE ${CURRENT_FORMAT.family.attempt} SET record=? WHERE attempt_id=?`)
      .run(JSON.stringify(plan.attempt), CURRENT_FORMAT.encode(plan.attempt.attemptId));
  if (plan.run !== null)
    database
      .query(`UPDATE ${CURRENT_FORMAT.family.record} SET record=? WHERE run_id=?`)
      .run(JSON.stringify(plan.run), CURRENT_FORMAT.encode(plan.run.runId));
  database
    .query(`UPDATE ${CURRENT_FORMAT.family.runtime_scope} SET revision=? WHERE scope_key=?`)
    .run(plan.closure.scopeAfter, scope);
  database
    .query(`UPDATE ${CURRENT_FORMAT.family.recovery_journal} SET revision=? WHERE recovery_id=?`)
    .run(plan.history.revision, CURRENT_FORMAT.encode(plan.closure.recoveryId));
  database
    .query(`DELETE FROM ${CURRENT_FORMAT.family.recovery_active} WHERE recovery_id=?`)
    .run(CURRENT_FORMAT.encode(plan.closure.recoveryId));
  database
    .query(
      `UPDATE ${CURRENT_FORMAT.family.recovery_format} SET journal_count=?,fence_count=?,observation_count=?,closure_count=?,barrier_count=?,active_count=? WHERE singleton=1`,
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
