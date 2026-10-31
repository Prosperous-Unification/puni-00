/** Encodes adapter-private identities without changing their domain validation. */
export function encodeKey(identity: string): string {
  return JSON.stringify(identity);
}

/** Requires a canonical JSON string before returning its logical identity. */
export function decodeKey(physical: string): string {
  const identity: unknown = JSON.parse(physical);
  // Proof: Task3 021 removed canonical validation only; public readManifest accepted a noncanonical retained key with inherited identity comparisons installed. Restored 022 passed.
  if (typeof identity !== 'string' || encodeKey(identity) !== physical)
    throw new Error('corrupt noncanonical sqlite identity key');
  return identity;
}

/** Compiled identifiers only: callers cannot supply SQL table names. */
export const RAW_TABLES = {
  record: 'run_record',
  attempt: 'run_attempt',
  reservation: 'run_reservation',
  execution: 'run_execution',
  completion: 'run_completion',
  outbox: 'run_outbox',
  decision: 'run_decision',
  consumption: 'run_consumption',
  receipt: 'run_receipt',
  runtime_scope: 'run_runtime_scope',
  runtime_intent: 'run_runtime_intent',
  runtime_acceptance: 'run_runtime_acceptance',
  recovery_journal: 'run_recovery_journal',
  recovery_fence: 'run_recovery_fence',
  recovery_observation: 'run_recovery_observation',
  recovery_closure: 'run_recovery_closure',
  recovery_barrier: 'run_recovery_barrier',
  recovery_active: 'run_recovery_active',
  recovery_format: 'run_recovery_format',
  runtime_format: 'run_format',
} as const;

export const KEYED_TABLES = {
  record: 'run5_record',
  attempt: 'run5_attempt',
  reservation: 'run5_reservation',
  execution: 'run5_execution',
  completion: 'run5_completion',
  outbox: 'run5_outbox',
  decision: 'run5_decision',
  consumption: 'run5_consumption',
  receipt: 'run5_receipt',
  runtime_scope: 'run5_runtime_scope',
  runtime_intent: 'run5_runtime_intent',
  runtime_acceptance: 'run5_runtime_acceptance',
  recovery_journal: 'run5_recovery_journal',
  recovery_fence: 'run5_recovery_fence',
  recovery_observation: 'run5_recovery_observation',
  recovery_closure: 'run5_recovery_closure',
  recovery_barrier: 'run5_recovery_barrier',
  recovery_active: 'run5_recovery_active',
  recovery_format: 'run5_recovery_format',
  runtime_format: 'run5_runtime_format',
} as const;
