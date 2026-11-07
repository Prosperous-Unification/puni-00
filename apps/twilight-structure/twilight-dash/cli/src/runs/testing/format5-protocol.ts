import { parseOrThrow, type } from '@shared/validation';

import type { Attempt2 } from '../execution-records';
import { decodeCurrentAttempt } from '../record-codecs';
import * as recoveryCodecs from '../recovery-codecs';
import type { Attempt3 } from '../recovery-records';
import type {
  RecoveryBeginCall,
  RecoveryBeginCall1,
  RecoveryCall,
  RecoveryCall1,
  RecoveryClosure1,
  RecoveryFence,
  RecoveryFenceInput,
  RecoveryFenceReplyInput,
  RecoveryHistory1,
  RecoveryObservation,
  RecoveryResolveCall,
  RecoveryResolveCall1,
} from '../recovery-records';
import type { StoreReply } from '../run-store';
import { equalRuntimeScopes, readRuntimeRequest } from '../runtime-codecs';
import type { RuntimeScope } from '../runtime-records';
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
export interface Format5RecoveryStore {
  beginRecovery(call: RecoveryBeginCall1): Promise<StoreReply<RecoveryHistory1>>;
  stageRecoveryFence(call: RecoveryCall1<RecoveryFenceInput>): Promise<StoreReply<RecoveryFence>>;
  recordRecoveryFence(
    call: RecoveryCall1<RecoveryFenceReplyInput>,
  ): Promise<StoreReply<RecoveryObservation>>;
  resolveRecovery(call: RecoveryResolveCall1): Promise<StoreReply<RecoveryClosure1>>;
}
type RecoveryMethod =
  'beginRecovery' | 'stageRecoveryFence' | 'recordRecoveryFence' | 'resolveRecovery';
export type Format5Mutation = Format3Command['method'] | RecoveryMethod;
export type Format5Command =
  | Format3Command
  | {
      [Method in RecoveryMethod]: {
        readonly method: Method;
        readonly parameters: Parameters<Format5RecoveryStore[Method]>;
      };
    }[RecoveryMethod];
export type Format5Expected =
  | Exclude<Format3Expected, { kind: 'invoke' } | { kind: 'populate' }>
  | { readonly kind: 'invoke'; readonly method: Format5Mutation }
  | { readonly kind: 'populate'; readonly mutation?: Format5Mutation }
  | {
      readonly kind: 'observe_recovery';
      readonly scope: RuntimeScope;
      readonly recoveryId: string;
    };
export type Format5Correlation =
  | { readonly action: 'invoke' | 'prepare'; readonly method: Format5Mutation }
  | { readonly action: Exclude<Format5Expected['kind'], 'invoke'> };
type RecoveryReply = {
  [Method in RecoveryMethod]: {
    readonly action: 'invoke';
    readonly method: Method;
    readonly value: Awaited<ReturnType<Format5RecoveryStore[Method]>>;
  };
}[RecoveryMethod];
export type Format5Payload =
  | Exclude<Format3Payload, { action: 'prepare' } | { action: 'invoke'; method: 'admitAttempt' }>
  | ({ readonly action: 'prepare' } & Format5Command)
  | RecoveryReply
  | {
      readonly action: 'observe_recovery';
      readonly version: 2;
      readonly value: RecoveryHistory1 | null;
    }
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
  "'populate'|'capture'|'retain_artifact'|'advance_clock'|'hold_write'|'release_write'|'arm_busy'|'arm_callback'|'observe_recovery'|'close'";
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
/** Historical capability narrowing uses c12-existing decoder entrypoints on both worker and controller. */
// Proof: L01 removing this narrowing admitted an actual current write2 begin call at the genuine5 controller boundary. Exact restoration passed.
function requireLegacyBegin(call: RecoveryBeginCall): RecoveryBeginCall1 {
  if (call.kind === 'write') throw Error('unsupported historical format5 recovery');
  return call;
}
// Proof: L02 removing this narrowing admitted an actual current write fence call at the genuine5 controller boundary. Exact restoration passed.
function requireLegacyCall<P>(call: RecoveryCall<P>): RecoveryCall1<P> {
  if (call.kind === 'write') throw Error('unsupported historical format5 recovery');
  return call;
}
// Proof: L03 removing this narrowing admitted an actual current write2 resolve call at the genuine5 controller boundary. Exact restoration passed.
function requireLegacyResolve(call: RecoveryResolveCall): RecoveryResolveCall1 {
  if (call.kind === 'write') throw Error('unsupported historical format5 recovery');
  return call;
}
function decodeLegacyHistory(candidate: unknown): RecoveryHistory1 {
  const history = recoveryCodecs.decodeRecoveryHistory(candidate);
  // Proof: L04 removing only this version narrowing admitted an actual current write2 begin history. Exact restoration passed.
  if (history.version !== 1) throw Error('unsupported historical format5 recovery history');
  return history;
}
function decodeLegacyClosure(candidate: unknown): RecoveryClosure1 {
  const closure = recoveryCodecs.decodeRecoveryClosure(candidate);
  // Proof: L05 removing only this version narrowing admitted an actual current write2 closure. Exact restoration passed.
  if (closure.version !== 1) throw Error('unsupported historical format5 recovery closure');
  return closure;
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
      return {
        method: command.method,
        parameters: [requireLegacyBegin(recoveryCodecs.decodeRecoveryBeginCall(first))],
      };
    case 'stageRecoveryFence':
      return {
        method: command.method,
        parameters: [requireLegacyCall(recoveryCodecs.decodeRecoveryFenceCall(first))],
      };
    case 'recordRecoveryFence':
      return {
        method: command.method,
        parameters: [requireLegacyCall(recoveryCodecs.decodeRecoveryObservationCall(first))],
      };
    case 'resolveRecovery':
      return {
        method: command.method,
        parameters: [requireLegacyResolve(recoveryCodecs.decodeRecoveryResolveCall(first))],
      };
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
/** Controller-only native value decoding is detached and structural. The archived worker transports its native invocation independently and never calls these new value wrappers: its namespace contains the immutable c12 exports. Complete journal correspondence belongs to an explicit later observation, whose failure cannot replace this reply. */
export function decodeFormat5Payload(input: unknown): Format5Payload {
  const header = parseOrThrow(type({ action: 'string', 'method?': 'string' }), input);
  // Proof: the genuine5 native-COMMIT/separate-observation test lost rejection of unsupported version or malformed history when each boundary was independently bypassed; exact source hashes restored.
  if (header.action === 'observe_recovery') {
    const payload = parseOrThrow(
      type({ action: "'observe_recovery'", version: '2', value: 'unknown' }).onUndeclaredKey(
        'reject',
      ),
      input,
    );
    return {
      action: 'observe_recovery',
      version: payload.version,
      value: payload.value === null ? null : decodeLegacyHistory(payload.value),
    };
  }
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
    }).onUndeclaredKey('reject'),
    input,
  );
  switch (payload.method) {
    case 'beginRecovery':
      return {
        action: 'invoke',
        method: payload.method,
        value: decodeReply(payload.value, decodeLegacyHistory),
      };
    case 'stageRecoveryFence':
      return {
        action: 'invoke',
        method: payload.method,
        value: decodeReply(payload.value, recoveryCodecs.decodeRecoveryFence),
      };
    case 'recordRecoveryFence':
      return {
        action: 'invoke',
        method: payload.method,
        value: decodeReply(payload.value, recoveryCodecs.decodeRecoveryObservation),
      };
    case 'resolveRecovery':
      return {
        action: 'invoke',
        method: payload.method,
        value: decodeReply(payload.value, decodeLegacyClosure),
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
  // Proof: independent recovery-ID and scope guard faults made the genuine5 native-COMMIT/separate-observation test accept each wrong target; exact source hashes restored.
  if (
    request.kind === 'observe_recovery' &&
    decoded.kind === 'reply' &&
    decoded.payload.action === 'observe_recovery' &&
    decoded.payload.value !== null
  ) {
    const history = decoded.payload.value;
    if (
      history.intent.recoveryId !== request.recoveryId ||
      !equalRuntimeScopes(
        readRuntimeRequest(history.intent.target.original.canonicalRequest).scope,
        request.scope,
      )
    )
      throw new Error('format5 observation target differs');
  }
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
