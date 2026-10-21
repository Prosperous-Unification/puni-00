import { parseOrThrow, type } from '@shared/validation';

import { advanceAttempt, isExecuting, planExecutionTransition } from '../plan-execution';
import {
  assertInteger,
  attemptId,
  decodeAdmission,
  decodeAttempt,
  decodeCompletion,
  decodeExecutionCommand,
  decodeManifest,
  decodeRun,
  equalRecords,
  OwnershipStatusCodec,
} from '../record-codecs';
import type { Attempt, Run } from '../records';

const MetaCodec = type({
  schema_version: 'number',
  migration_hash: 'string',
  down_hash: 'string',
  ownership: 'string',
  capacity: 'number',
  lease_milliseconds: 'number',
  last_observed_at: 'number',
});
const ManifestRowCodec = type({ digest: 'string', record: 'string' });
const RunRowCodec = type({
  run_id: 'string',
  manifest_digest: 'string',
  record: 'string',
  initial_record: 'string',
});
const AttemptRowCodec = type({
  attempt_id: 'string',
  run_id: 'string',
  occurrence_id: 'string',
  ordinal: 'number',
  record: 'string',
  admission: 'string',
});

/** Decodes trusted physical metadata; malformed/null records are never initialization signals. */
export function decodeMeta(input: unknown) {
  const row = parseOrThrow(MetaCodec, input);
  // Proof: independently omitting these integer checks failed unsafe persisted capacity, lease and clock tests before configuration matching.
  assertInteger(row.capacity, 1);
  assertInteger(row.lease_milliseconds, 1);
  assertInteger(row.last_observed_at);
  const ownership = parseOrThrow(OwnershipStatusCodec, JSON.parse(row.ownership));
  // Proof: removing metadata identity validation accepted mismatched epoch, missing owner, store and organization records.
  if (
    (ownership.owner === null && ownership.epoch !== 0) ||
    (ownership.owner !== null &&
      (ownership.owner.epoch !== ownership.epoch ||
        ownership.owner.storeId !== ownership.storeId ||
        ownership.owner.organizationId !== ownership.organizationId))
  )
    throw new Error('corrupt ownership metadata');
  return { ...row, ownership };
}
/** Checks physical keys against their independently versioned portable record. */
export function decodeManifestRow(input: unknown) {
  const row = parseOrThrow(ManifestRowCodec, input);
  const manifest = decodeManifest(JSON.parse(row.record));
  // Proof: omitting this comparison accepted a differently hashed valid manifest under the retained physical key.
  if (manifest.digest !== row.digest) throw new Error('corrupt manifest key');
  return manifest;
}
/** Retains immutable initial identity alongside the current run revision. */
export function decodeRunRow(input: unknown) {
  const row = parseOrThrow(RunRowCodec, input);
  const run = decodeRun(JSON.parse(row.record));
  const initial = decodeRun(JSON.parse(row.initial_record));
  // Proof: independently bypassing each comparison accepted corrupt run keys, manifest keys or immutable initial identity.
  if (
    run.runId !== row.run_id ||
    run.manifestDigest !== row.manifest_digest ||
    JSON.stringify({ ...run, revision: 0 }) !== JSON.stringify(initial)
  )
    throw new Error('corrupt run identity');
  return { run, initial };
}
/** Decodes the immutable admission identity together with its current attempt. */
export function decodeAttemptRow(input: unknown) {
  const row = parseOrThrow(AttemptRowCodec, input);
  const attempt = decodeAttempt(JSON.parse(row.record));
  const admission = decodeAdmission(JSON.parse(row.admission));
  // Proof: independently bypassing each comparison accepted the corresponding valid-shaped attempt/admission key, ordinal or operation corruption.
  if (
    attempt.attemptId !== row.attempt_id ||
    attempt.identity.runId !== row.run_id ||
    attempt.identity.occurrenceId !== row.occurrence_id ||
    attempt.ordinal !== row.ordinal ||
    admission.attemptId !== attempt.attemptId ||
    admission.ordinal !== attempt.ordinal ||
    JSON.stringify(admission.identity) !== JSON.stringify(attempt.identity)
  )
    throw new Error('corrupt admission identity');
  return { attempt, admission };
}

const CompletionRowCodec = type({ command_id: 'string', attempt_id: 'string', record: 'string' });
/** Keeps the immutable command identity independent of pending delivery state. */
export function decodeCompletionRow(input: unknown) {
  const row = parseOrThrow(CompletionRowCodec, input);
  const completion = decodeCompletion(JSON.parse(row.record));
  // Proof: bypassing completion physical command enforcement failed 'open identifies a physically relabeled completion before treating it as another pending command'.
  if (
    completion.intent.commandId !== row.command_id ||
    completion.intent.authority.attemptId !== row.attempt_id
  )
    throw new Error('corrupt completion identity');
  return { attemptId: attemptId(row.attempt_id), completion };
}

const ExecutionRowCodec = type({
  command_id: 'string',
  attempt_id: 'string',
  run_id: 'string',
  record: 'string',
  reply: 'string',
});
/** Decodes the physical identity and verifies the original reply against the actual predecessor and shared transition semantics. Historical state is never compared to current state. */
export function decodeExecutionRow(input: unknown, run: Run, predecessor: Attempt) {
  const row = parseOrThrow(ExecutionRowCodec, input);
  const command = decodeExecutionCommand(JSON.parse(row.record));
  const reply = decodeAttempt(JSON.parse(row.reply));
  // Proof: bypassing execution physical command enforcement failed 'open rejects immutable execution command key corruption'.
  // Proof: bypassing execution physical attempt enforcement failed 'open rejects immutable execution attempt key corruption'.
  // Proof: bypassing execution physical run enforcement failed 'open rejects immutable execution run key corruption'.
  if (
    command.commandId !== row.command_id ||
    reply.attemptId !== row.attempt_id ||
    reply.identity.runId !== row.run_id
  )
    throw new Error('corrupt execution command identity');
  const transition = planExecutionTransition({ run, attempt: predecessor }, command.fact);
  // Proof: removing the named rejection for an impossible historical transition failed 'open rejects execution command and reply carrying another target projectId'.
  if (transition.kind === 'refused') throw new Error('corrupt execution command transition');
  const expected = advanceAttempt(predecessor, transition.value, isExecuting(transition.value));
  // Proof: bypassing original reply/postcondition equality failed 'open rejects historical claim_acquired reply contradiction at $.state.claim.personId'.
  if (!equalRecords(reply, expected)) throw new Error('corrupt execution command reply');
  return { command, reply };
}
