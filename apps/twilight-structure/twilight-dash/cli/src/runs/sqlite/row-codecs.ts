import { parseOrThrow, type } from '@shared/validation';

import {
  assertInteger,
  decodeAdmission,
  decodeAttempt,
  decodeManifest,
  decodeRun,
  OwnershipStatusCodec,
} from '../record-codecs';

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
