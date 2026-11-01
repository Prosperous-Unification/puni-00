import { parseOrThrow, type } from '@shared/validation';

import type { Attempt2 } from '../execution-records';
import { decodeCurrentAttempt, equalRecords } from '../record-codecs';
import {
  decodeRecoveryBeginCall,
  decodeRecoveryFenceCall,
  decodeRecoveryHistory,
  decodeRecoveryObservationCall,
  decodeRecoveryResolveCall,
} from '../recovery-codecs';
import type { Attempt3 } from '../recovery-records';
import type { RecoveryHistory } from '../recovery-records';
import type { RunStore, StoreReply } from '../run-store';
import {
  decodeFormat3Command,
  decodeFormat3Payload,
  type Format3Capture,
  type Format3Command,
  type Format3Expected,
  type Format3Failure,
  format3MutationCodec,
  type Format3Payload,
  type Format3Population,
  type Format3Response,
} from './format3-protocol';
export type { SqliteCaptureCell } from './format3-protocol';
export type Format5Capture = Format3Capture;
export type Format5Failure = Format3Failure;
export type Format5Population =
  | Format3Population
  | 'authority_recovery_active'
  | 'authority_recovery_closed'
  | 'claim_recovery_active'
  | 'claim_recovery_accepted'
  | 'claim_recovery_nonaccepted';
type RecoveryMethod =
  'beginRecovery' | 'stageRecoveryFence' | 'recordRecoveryFence' | 'resolveRecovery';
export type Format5Mutation = Format3Command['method'] | RecoveryMethod;
export type Format5Command =
  | Format3Command
  | {
      [Method in RecoveryMethod]: {
        readonly method: Method;
        readonly parameters: Parameters<RunStore[Method]>;
      };
    }[RecoveryMethod];
export type Format5Expected =
  | Exclude<Format3Expected, { kind: 'invoke' } | { kind: 'populate' }>
  | { readonly kind: 'invoke'; readonly method: Format5Mutation }
  | { readonly kind: 'populate'; readonly mutation?: Format5Mutation };
export type Format5Correlation =
  | { readonly action: 'invoke' | 'prepare'; readonly method: Format5Mutation }
  | { readonly action: Exclude<Format5Expected['kind'], 'invoke'> };
type RecoveryReply = {
  [Method in RecoveryMethod]: {
    readonly action: 'invoke';
    readonly method: Method;
    readonly value: Awaited<ReturnType<RunStore[Method]>>;
    readonly history?: RecoveryHistory;
  };
}[RecoveryMethod];
export type Format5Payload =
  | Exclude<Format3Payload, { action: 'prepare' } | { action: 'invoke'; method: 'admitAttempt' }>
  | ({ readonly action: 'prepare' } & Format5Command)
  | RecoveryReply
  | {
      readonly action: 'invoke';
      readonly method: 'admitAttempt';
      readonly value: StoreReply<Attempt2 | Attempt3>;
    };
export type Format5Response =
  | Extract<Format3Response, { kind: 'ready' }>
  | { readonly kind: 'reply'; readonly requestId: string; readonly payload: Format5Payload }
  | {
      readonly kind: 'error';
      readonly requestId: string;
      readonly operation: Format5Correlation;
      readonly error: Format5Failure;
    };
export const format5MutationCodec = format3MutationCodec.or(
  "'beginRecovery'|'stageRecoveryFence'|'recordRecoveryFence'|'resolveRecovery'",
);
const recoveryMethods = new Set<string>([
  'beginRecovery',
  'stageRecoveryFence',
  'recordRecoveryFence',
  'resolveRecovery',
]);
const actions =
  "'populate'|'capture'|'retain_artifact'|'advance_clock'|'hold_write'|'release_write'|'arm_busy'|'arm_callback'|'close'";
const correlationCodec = type({ action: "'invoke'|'prepare'", method: format5MutationCodec })
  .onUndeclaredKey('reject')
  .or(type({ action: actions }).onUndeclaredKey('reject'));
const envelopeCodec = type({
  kind: "'ready'",
  sourceCommit: 'string',
  sourceFiles: type({ path: 'string', sha256: 'string' }).array(),
  format: {
    version: 'number.integer',
    bundleHash: 'string',
    migrations: type({ name: 'string', forwardHash: 'string', downHash: 'string' }).array(),
  },
})
  .onUndeclaredKey('reject')
  .or(type({ kind: "'reply'", requestId: 'string', payload: 'unknown' }).onUndeclaredKey('reject'))
  .or(
    type({
      kind: "'error'",
      requestId: 'string',
      operation: correlationCodec,
      error: 'unknown',
    }).onUndeclaredKey('reject'),
  );
export function decodeFormat5Envelope(input: unknown) {
  return parseOrThrow(envelopeCodec, input);
}
export function correlateFormat5Request(request: Format5Expected): Format5Correlation {
  if (request.kind === 'invoke') return { action: 'invoke', method: request.method };
  if (request.kind === 'populate' && request.mutation !== undefined)
    return { action: 'prepare', method: request.mutation };
  return { action: request.kind };
}
/** Decodes the genuine predecessor's four recovery calls without widening its unchanged legacy tuple decoders. */
export function decodeFormat5Command(input: unknown): Format5Command {
  const command = parseOrThrow(
    type({ method: format5MutationCodec, parameters: 'unknown[]' }).onUndeclaredKey('reject'),
    input,
  );
  if (!recoveryMethods.has(command.method)) return decodeFormat3Command(command);
  if (command.parameters.length !== 1) throw new Error('format5 command arity differs');
  const first = command.parameters[0];
  switch (command.method) {
    case 'beginRecovery':
      return { method: command.method, parameters: [decodeRecoveryBeginCall(first)] };
    case 'stageRecoveryFence':
      return { method: command.method, parameters: [decodeRecoveryFenceCall(first)] };
    case 'recordRecoveryFence':
      return { method: command.method, parameters: [decodeRecoveryObservationCall(first)] };
    case 'resolveRecovery':
      return { method: command.method, parameters: [decodeRecoveryResolveCall(first)] };
    default:
      throw new Error('unsupported format5 recovery method');
  }
}
function decodeFailure(input: unknown): Format5Failure {
  const failure = parseOrThrow(
    type({
      name: 'string',
      message: 'string',
      'code?': 'string|number',
      cause: 'unknown',
      'errors?': 'unknown[]',
    })
      .onUndeclaredKey('reject')
      .or(type({ thrown: 'string' }).onUndeclaredKey('reject')),
    input,
  );
  if ('thrown' in failure) return failure;
  return {
    name: failure.name,
    message: failure.message,
    ...(failure.code === undefined ? {} : { code: failure.code }),
    cause: failure.cause === null ? null : decodeFailure(failure.cause),
    ...(failure.errors === undefined ? {} : { errors: failure.errors.map(decodeFailure) }),
  };
}
function decodeReply<Value>(
  input: unknown,
  decode: (candidate: unknown) => Value,
): StoreReply<Value> {
  const reply = parseOrThrow(
    type({ kind: "'applied'|'duplicate'", value: 'unknown' })
      .onUndeclaredKey('reject')
      .or(
        type({
          kind: "'refused'",
          reason:
            "'owner_busy'|'owner_stale'|'revision_conflict'|'identity_conflict'|'capacity_full'|'retry_exhausted'|'attempt_active'|'state_conflict'|'authority_conflict'|'decision_conflict'",
        }).onUndeclaredKey('reject'),
      ),
    input,
  );
  return reply.kind === 'refused' ? reply : { kind: reply.kind, value: decode(reply.value) };
}
/** Recovery replies carry a complete independently decoded journal, allowing precise fence/observation/closure values without importing unavailable private historical codecs. */
export function decodeFormat5Payload(input: unknown): Format5Payload {
  const header = parseOrThrow(type({ action: 'string', 'method?': 'string' }), input);
  if (header.action === 'prepare') {
    const prepared = parseOrThrow(
      type({
        action: "'prepare'",
        method: format5MutationCodec,
        parameters: 'unknown[]',
      }).onUndeclaredKey('reject'),
      input,
    );
    return {
      action: 'prepare',
      ...decodeFormat5Command({ method: prepared.method, parameters: prepared.parameters }),
    };
  }
  if (header.action === 'invoke' && header.method === 'admitAttempt') {
    const payload = parseOrThrow(
      type({ action: "'invoke'", method: "'admitAttempt'", value: 'unknown' }).onUndeclaredKey(
        'reject',
      ),
      input,
    );
    return {
      action: payload.action,
      method: payload.method,
      value: decodeReply(payload.value, (candidate) => {
        const attempt = decodeCurrentAttempt(candidate);
        // Proof: genuine5-attempt-version broke “format5 historical admission rejects a valid current Attempt4 at the version boundary”; exact source hash restored.
        if (attempt.version === 4) throw new Error('unsupported historical format5 attempt');
        return attempt;
      }),
    };
  }
  if (
    header.action !== 'invoke' ||
    header.method === undefined ||
    !recoveryMethods.has(header.method)
  )
    return decodeFormat3Payload(input);
  const payload = parseOrThrow(
    type({
      action: "'invoke'",
      method: format5MutationCodec,
      value: 'unknown',
      'history?': 'unknown',
    }).onUndeclaredKey('reject'),
    input,
  );
  const history =
    payload.history === undefined ? undefined : decodeRecoveryHistory(payload.history);
  function requireValue<Value>(candidate: unknown, value: Value | undefined | null): Value {
    if (
      history === undefined ||
      value === undefined ||
      value === null ||
      !equalRecords(candidate, value)
    )
      throw new Error('format5 recovery reply differs from complete journal');
    return structuredClone(value);
  }
  switch (payload.method) {
    case 'beginRecovery':
      return {
        action: 'invoke',
        method: payload.method,
        value: decodeReply(payload.value, (candidate) => requireValue(candidate, history)),
        ...(history === undefined ? {} : { history }),
      };
    case 'stageRecoveryFence':
      return {
        action: 'invoke',
        method: payload.method,
        value: decodeReply(payload.value, (candidate) => {
          const identity = parseOrThrow(type({ ordinal: 'number' }), candidate);
          return requireValue(
            candidate,
            history?.fences.find((fence) => fence.ordinal === identity.ordinal),
          );
        }),
        ...(history === undefined ? {} : { history }),
      };
    case 'recordRecoveryFence':
      return {
        action: 'invoke',
        method: payload.method,
        value: decodeReply(payload.value, (candidate) => {
          const identity = parseOrThrow(type({ observedRevision: 'number' }), candidate);
          return requireValue(
            candidate,
            history?.observations.find(
              (observation) => observation.observedRevision === identity.observedRevision,
            ),
          );
        }),
        ...(history === undefined ? {} : { history }),
      };
    case 'resolveRecovery':
      return {
        action: 'invoke',
        method: payload.method,
        value: decodeReply(payload.value, (candidate) => requireValue(candidate, history?.closure)),
        ...(history === undefined ? {} : { history }),
      };
    default:
      throw new Error('unsupported format5 reply method');
  }
}
export function decodeFormat5Response(
  envelope: Exclude<ReturnType<typeof decodeFormat5Envelope>, { kind: 'ready' }>,
  request: Format5Expected,
): Exclude<Format5Response, { kind: 'ready' }> {
  const expected = correlateFormat5Request(request);
  const decoded =
    envelope.kind === 'reply'
      ? { ...envelope, payload: decodeFormat5Payload(envelope.payload) }
      : { ...envelope, error: decodeFailure(envelope.error) };
  const actual = decoded.kind === 'reply' ? decoded.payload : decoded.operation;
  // Proof: genuine5-response-action broke “format5 response rejects an independently valid wrong action and preserves nested original errors”; exact source hash restored.
  if (actual.action !== expected.action) throw new Error('format5 response action differs');
  if ('method' in expected && (!('method' in actual) || actual.method !== expected.method))
    throw new Error('format5 response method differs');
  return decoded;
}
export const format5SourceEntries = [
  'sqlite/format.ts',
  'sqlite/open-stores.ts',
  'sqlite/run-store.ts',
  'sqlite/schema.ts',
  'sqlite/read-history.ts',
  'sqlite/read-executions.ts',
  'sqlite/read-outcomes.ts',
  'sqlite/read-signals.ts',
  'sqlite/read-runtime.ts',
  'sqlite/read-recovery.ts',
  'sqlite/recovery-store.ts',
  'sqlite/runtime-store.ts',
  'sqlite/row-codecs.ts',
  'sqlite/artifact-store.ts',
  'sqlite/identity-key.ts',
  'sqlite/identity-usage.ts',
  'records.ts',
  'record-codecs.ts',
  'value-codecs.ts',
  'execution-codecs.ts',
  'execution-records.ts',
  'claim-records.ts',
  'claim-history.ts',
  'runtime-codecs.ts',
  'runtime-records.ts',
  'runtime-history.ts',
  'runtime-receipt.ts',
  'runtime-state.ts',
  'record-preparation.ts',
  'plan-admission.ts',
  'plan-ownership.ts',
  'plan-execution.ts',
  'plan-outcome.ts',
  'plan-receipt.ts',
  'plan-signals.ts',
  'plan-runtime.ts',
  'plan-claims.ts',
  'plan-recovery.ts',
  'plan-recovery-history.ts',
  'validate-history.ts',
  'recovery-codecs.ts',
  'recovery-records.ts',
  'recovery-history.ts',
  'recovery-evidence.ts',
  'artifact-integrity.ts',
  'verify-artifacts.ts',
  'manifest-binding.ts',
  'testing/fixtures.ts',
  'testing/format3-protocol.ts',
  'testing/runtime-history-contract.ts',
  'testing/recovery-contract.ts',
  'testing/construct-fixture.ts',
  'testing/close-fixtures.ts',
  ...[
    '0001-run-store',
    '0002-runtime-authority',
    '0003-execution-history',
    '0004-runtime-recovery',
    '0005-identity-keys',
  ].flatMap((name) =>
    ['migration.sql', 'down.sql'].map((file) => 'sqlite/migrations/' + name + '/' + file),
  ),
] as const;
