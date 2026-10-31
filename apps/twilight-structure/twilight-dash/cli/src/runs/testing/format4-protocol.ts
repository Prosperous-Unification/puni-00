import { parseOrThrow, type } from '@shared/validation';

import type { ArtifactRetention } from '../artifact-store';
import {
  decodeClaimAcceptCommand,
  decodeClaimStageCommand,
  decodeScopedAttemptGuard,
  decodeTurnStageCommand,
  RecordedExecutionCodec,
} from '../execution-codecs';
import {
  assertInteger,
  decisionId,
  decodeAdmission,
  decodeArtifactRef,
  decodeAttempt,
  decodeAttemptGuard,
  decodeCompletion,
  decodeDecision,
  decodeExecutionCommand,
  decodeManifest,
  decodeOwnership,
  decodeReceipt,
  decodeRun,
  decodeRunGuard,
  ownerId,
} from '../record-codecs';
import type { RunStore, StoreReply } from '../run-store';
import {
  decodeRuntimeAcceptance,
  decodeRuntimeAcceptanceInput,
  decodeRuntimeGuard,
  decodeRuntimeIntent,
  decodeRuntimePin,
} from '../runtime-codecs';
export const format4SourceEntries = [
  'sqlite/format.ts',
  'sqlite/read-recovery.ts',
  'sqlite/recovery-store.ts',
  'recovery-codecs.ts',
  'sqlite/open-stores.ts',
  'sqlite/run-store.ts',
  'sqlite/schema.ts',
  'record-codecs.ts',
  'execution-codecs.ts',
  'runtime-codecs.ts',
  'testing/fixtures.ts',
  'testing/runtime-history-contract.ts',
] as const;
export type Format4Population =
  | 'queued'
  | 'prepared'
  | 'authority_pending'
  | 'authority_accepted'
  | 'claim_pending'
  | 'claim_accepted'
  | 'decision_consumed'
  | 'outbox_pending'
  | 'receipt_settled'
  | 'ownership_takeover';
export type Format4Mutation =
  | 'acquireOwnership'
  | 'renewOwnership'
  | 'retainManifest'
  | 'createRun'
  | 'admitAttempt'
  | 'pinRuntimeScope'
  | 'stageRuntimeRequest'
  | 'recordRuntimeAcceptance'
  | 'recordExecution'
  | 'stageClaim'
  | 'recordClaimAcceptance'
  | 'stageTurn'
  | 'receiveDecision'
  | 'consumeDecision'
  | 'commitOutcome'
  | 'reconcileReceipt';
export type Format4Invocation = {
  [M in Format4Mutation]: {
    readonly kind: 'invoke';
    readonly requestId: string;
    readonly method: M;
    readonly parameters: Parameters<RunStore[M]>;
  };
}[Format4Mutation];
export type Format4Command = {
  [M in Format4Mutation]: Omit<Extract<Format4Invocation, { method: M }>, 'requestId' | 'kind'>;
}[Format4Mutation];
export type Format4Request =
  | Format4Invocation
  | {
      readonly kind: 'retain_artifact';
      readonly requestId: string;
      readonly base64: string;
      readonly mediaType: string;
    }
  | { readonly kind: 'arm_busy'; readonly requestId: string; readonly minimumInvoked: 1 | 2 }
  | { readonly kind: 'advance_clock'; readonly requestId: string; readonly milliseconds: number }
  | {
      readonly kind: 'populate';
      readonly requestId: string;
      readonly population: Format4Population;
      readonly mutation?: Format4Mutation;
    }
  | {
      readonly kind: 'capture' | 'hold_write' | 'release_write' | 'arm_callback' | 'close';
      readonly requestId: string;
    };
export type Format4Failure =
  | {
      readonly name: string;
      readonly message: string;
      readonly code?: string | number;
      readonly cause: Format4Failure | null;
      readonly errors?: readonly Format4Failure[];
    }
  | { readonly thrown: string };
export type SqliteCaptureCell = null | string | number | bigint | Uint8Array;
export interface Format4Capture {
  readonly schema: readonly {
    readonly database: 'main' | 'temp';
    readonly type: string;
    readonly name: string;
    readonly table: string;
    readonly sql: string | null;
  }[];
  readonly tables: readonly {
    readonly name: string;
    readonly columns: readonly string[];
    readonly rows: readonly (readonly SqliteCaptureCell[])[];
  }[];
}

const cellCodec = type('null | string | number | bigint').or(type.instanceOf(Uint8Array));
const captureCodec = type({
  schema: type({
    database: "'main' | 'temp'",
    type: 'string',
    name: 'string',
    table: 'string',
    sql: 'string | null',
  }).array(),
  tables: type({ name: 'string', columns: 'string[]', rows: cellCodec.array().array() }).array(),
});

export const format4MutationCodec = type(
  "'acquireOwnership' | 'renewOwnership' | 'retainManifest' | 'createRun' | 'admitAttempt' | 'pinRuntimeScope' | 'stageRuntimeRequest' | 'recordRuntimeAcceptance' | 'recordExecution' | 'stageClaim' | 'recordClaimAcceptance' | 'stageTurn' | 'receiveDecision' | 'consumeDecision' | 'commitOutcome' | 'reconcileReceipt'",
);
const stageAck = RecordedExecutionCodec.extract({ command: { kind: "'stage_claim'" } }).get(
  'reply',
);
const acceptAck = RecordedExecutionCodec.extract({ command: { kind: "'accept_claim'" } }).get(
  'reply',
);
const turnAck = RecordedExecutionCodec.extract({ command: { kind: "'stage_turn'" } }).get('reply');
const decodeClaimStageAck = (input: unknown) => parseOrThrow(stageAck, input);
const decodeClaimAcceptAck = (input: unknown) => parseOrThrow(acceptAck, input);
const decodeTurnStageAck = (input: unknown) => parseOrThrow(turnAck, input);
interface ValueDecoders {
  acquireOwnership: typeof decodeOwnership;
  renewOwnership: typeof decodeOwnership;
  retainManifest: typeof decodeManifest;
  createRun: typeof decodeRun;
  admitAttempt: typeof decodeAttempt;
  pinRuntimeScope: typeof decodeRuntimePin;
  stageRuntimeRequest: typeof decodeRuntimeIntent;
  recordRuntimeAcceptance: typeof decodeRuntimeAcceptance;
  recordExecution: typeof decodeAttempt;
  stageClaim: typeof decodeClaimStageAck;
  recordClaimAcceptance: typeof decodeClaimAcceptAck;
  stageTurn: typeof decodeTurnStageAck;
  receiveDecision: typeof decodeDecision;
  consumeDecision: typeof decodeAttempt;
  commitOutcome: typeof decodeAttempt;
  reconcileReceipt: typeof decodeAttempt;
}
export type Format4InvokeReply = {
  [M in Format4Mutation]: {
    readonly action: 'invoke';
    readonly method: M;
    readonly value: StoreReply<ReturnType<ValueDecoders[M]>>;
  };
}[Format4Mutation];
export type Format4Payload =
  | Format4InvokeReply
  | { readonly action: 'populate'; readonly value: ReturnType<typeof decodeOwnership> }
  | ({ readonly action: 'prepare' } & Format4Command)
  | { readonly action: 'capture'; readonly value: Format4Capture }
  | { readonly action: 'retain_artifact'; readonly value: ArtifactRetention }
  | { readonly action: 'advance_clock'; readonly value: number }
  | { readonly action: 'hold_write'; readonly value: 'locked' }
  | { readonly action: 'release_write'; readonly value: 'released' }
  | { readonly action: 'arm_busy' | 'arm_callback'; readonly value: 'armed' }
  | { readonly action: 'close'; readonly value: null };
export type Format4Correlation =
  | { readonly action: 'invoke' | 'prepare'; readonly method: Format4Mutation }
  | {
      readonly action:
        | 'populate'
        | 'capture'
        | 'retain_artifact'
        | 'advance_clock'
        | 'hold_write'
        | 'release_write'
        | 'arm_busy'
        | 'arm_callback'
        | 'close';
    };
export type Format4Expected =
  | { readonly kind: 'invoke'; readonly method: Format4Mutation }
  | { readonly kind: 'populate'; readonly mutation?: Format4Mutation }
  | {
      readonly kind:
        | 'capture'
        | 'retain_artifact'
        | 'advance_clock'
        | 'hold_write'
        | 'release_write'
        | 'arm_busy'
        | 'arm_callback'
        | 'close';
    };
export type Format4Response =
  | {
      readonly kind: 'ready';
      readonly sourceCommit: string;
      readonly sourceFiles: readonly { readonly path: string; readonly sha256: string }[];
      readonly format: {
        readonly version: number;
        readonly bundleHash: string;
        readonly migrations: readonly {
          readonly name: string;
          readonly forwardHash: string;
          readonly downHash: string;
        }[];
      };
    }
  | { readonly kind: 'reply'; readonly requestId: string; readonly payload: Format4Payload }
  | {
      readonly kind: 'error';
      readonly requestId: string;
      readonly operation: Format4Correlation;
      readonly error: Format4Failure;
    };
export function correlateFormat4Request(request: Format4Expected): Format4Correlation {
  if (request.kind === 'invoke') return { action: 'invoke', method: request.method };
  if (request.kind === 'populate' && request.mutation !== undefined)
    return { action: 'prepare', method: request.mutation };
  return { action: request.kind };
}
const correlationCodec = type({ action: "'invoke' | 'prepare'", method: format4MutationCodec })
  .onUndeclaredKey('reject')
  .or(
    type({
      action:
        "'populate'|'capture'|'retain_artifact'|'advance_clock'|'hold_write'|'release_write'|'arm_busy'|'arm_callback'|'close'",
    }).onUndeclaredKey('reject'),
  );
const wireCodec = type({
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
/** Parses the JSON envelope; payload remains unknown only inside this wire boundary until correlation and legacy codecs succeed. */
export function decodeFormat4Envelope(input: unknown) {
  return parseOrThrow(wireCodec, input);
}
function decodeFailure(input: unknown): Format4Failure {
  const failure = parseOrThrow(
    type({
      name: 'string',
      message: 'string',
      'code?': 'string | number',
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
function integer(input: unknown) {
  const value = parseOrThrow(type('number'), input);
  assertInteger(value);
  return value;
}
/** Validates selected legacy command tuples without widening any old command or guard codec. */
export function decodeFormat4Command(input: unknown): Format4Command {
  const command = parseOrThrow(
    type({ method: format4MutationCodec, parameters: 'unknown[]' }).onUndeclaredKey('reject'),
    input,
  );
  if (command.parameters.length !== (command.method === 'renewOwnership' ? 1 : 2))
    throw new Error('format4 command arity differs');
  const [first, second] = command.parameters;
  switch (command.method) {
    case 'acquireOwnership':
      return { method: command.method, parameters: [ownerId(first), integer(second)] };
    case 'renewOwnership':
      return { method: command.method, parameters: [decodeOwnership(first)] };
    case 'retainManifest':
      return {
        method: command.method,
        parameters: [decodeOwnership(first), decodeManifest(second)],
      };
    case 'createRun':
      return { method: command.method, parameters: [decodeOwnership(first), decodeRun(second)] };
    case 'admitAttempt':
      return {
        method: command.method,
        parameters: [decodeRunGuard(first), decodeAdmission(second)],
      };
    case 'pinRuntimeScope':
      return {
        method: command.method,
        parameters: [decodeOwnership(first), decodeRuntimePin(second)],
      };
    case 'stageRuntimeRequest':
      return {
        method: command.method,
        parameters: [decodeRuntimeGuard(first), parseOrThrow(type('string'), second)],
      };
    case 'recordRuntimeAcceptance':
      return {
        method: command.method,
        parameters: [decodeRuntimeGuard(first), decodeRuntimeAcceptanceInput(second)],
      };
    case 'recordExecution':
      return {
        method: command.method,
        parameters: [decodeAttemptGuard(first), decodeExecutionCommand(second)],
      };
    case 'stageClaim':
      return {
        method: command.method,
        parameters: [decodeScopedAttemptGuard(first), decodeClaimStageCommand(second)],
      };
    case 'recordClaimAcceptance':
      return {
        method: command.method,
        parameters: [decodeScopedAttemptGuard(first), decodeClaimAcceptCommand(second)],
      };
    case 'stageTurn':
      return {
        method: command.method,
        parameters: [decodeScopedAttemptGuard(first), decodeTurnStageCommand(second)],
      };
    case 'receiveDecision':
      return {
        method: command.method,
        parameters: [decodeOwnership(first), decodeDecision(second)],
      };
    case 'consumeDecision':
      return {
        method: command.method,
        parameters: [decodeAttemptGuard(first), decisionId(second)],
      };
    case 'commitOutcome':
      return {
        method: command.method,
        parameters: [decodeAttemptGuard(first), decodeCompletion(second)],
      };
    case 'reconcileReceipt':
      return {
        method: command.method,
        parameters: [decodeAttemptGuard(first), decodeReceipt(second)],
      };
  }
}
function decodeStoreReply<T>(input: unknown, decode: (candidate: unknown) => T): StoreReply<T> {
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
/** Decodes actual legacy method results with strict Attempt2 and original acknowledgement compositions. */
export function decodeFormat4Payload(input: unknown): Format4Payload {
  const payload = parseOrThrow(
    type({ action: "'invoke'", method: format4MutationCodec, value: 'unknown' })
      .onUndeclaredKey('reject')
      .or(
        type({
          action: "'prepare'",
          method: format4MutationCodec,
          parameters: 'unknown[]',
        }).onUndeclaredKey('reject'),
      )
      .or(
        type({
          action:
            "'populate'|'capture'|'retain_artifact'|'advance_clock'|'hold_write'|'release_write'|'arm_busy'|'arm_callback'|'close'",
          value: 'unknown',
        }).onUndeclaredKey('reject'),
      ),
    input,
  );
  switch (payload.action) {
    case 'invoke':
      switch (payload.method) {
        case 'acquireOwnership':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeOwnership),
          };
        case 'renewOwnership':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeOwnership),
          };
        case 'retainManifest':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeManifest),
          };
        case 'createRun':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeRun),
          };
        case 'admitAttempt':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeAttempt),
          };
        case 'pinRuntimeScope':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeRuntimePin),
          };
        case 'stageRuntimeRequest':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeRuntimeIntent),
          };
        case 'recordRuntimeAcceptance':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeRuntimeAcceptance),
          };
        case 'recordExecution':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeAttempt),
          };
        case 'stageClaim':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeClaimStageAck),
          };
        case 'recordClaimAcceptance':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeClaimAcceptAck),
          };
        case 'stageTurn':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeTurnStageAck),
          };
        case 'receiveDecision':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeDecision),
          };
        case 'consumeDecision':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeAttempt),
          };
        case 'commitOutcome':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeAttempt),
          };
        case 'reconcileReceipt':
          return {
            action: payload.action,
            method: payload.method,
            value: decodeStoreReply(payload.value, decodeAttempt),
          };
      }
      break;
    case 'prepare':
      return {
        action: 'prepare',
        ...decodeFormat4Command({ method: payload.method, parameters: payload.parameters }),
      };
    case 'populate':
      return { action: payload.action, value: decodeOwnership(payload.value) };
    // Proof: Task3 092 bypassed this format4 decoder; malformed physical cells reached its actual reply boundary and the format4 rejection test failed. Restored decoding rejects them.
    case 'capture':
      return { action: payload.action, value: parseOrThrow(captureCodec, payload.value) };
    case 'retain_artifact': {
      const retained = parseOrThrow(
        type({ kind: "'retained'", reference: 'unknown' })
          .onUndeclaredKey('reject')
          .or(type({ kind: "'refused'", reason: "'metadata_conflict'" }).onUndeclaredKey('reject')),
        payload.value,
      );
      return {
        action: payload.action,
        value:
          retained.kind === 'retained'
            ? { kind: 'retained', reference: decodeArtifactRef(retained.reference) }
            : retained,
      };
    }
    case 'advance_clock':
      return { action: payload.action, value: integer(payload.value) };
    case 'hold_write':
      return { action: payload.action, value: parseOrThrow(type("'locked'"), payload.value) };
    case 'release_write':
      return { action: payload.action, value: parseOrThrow(type("'released'"), payload.value) };
    case 'arm_busy':
    case 'arm_callback':
      return { action: payload.action, value: parseOrThrow(type("'armed'"), payload.value) };
    case 'close':
      return { action: payload.action, value: parseOrThrow(type('null'), payload.value) };
  }
}
/** Correlates the parsed wire envelope before any typed waiting caller receives its legacy payload or diagnostic. */
export function decodeFormat4Response(
  envelope: Exclude<ReturnType<typeof decodeFormat4Envelope>, { kind: 'ready' }>,
  request: Format4Expected,
): Exclude<Format4Response, { kind: 'ready' }> {
  const expected = correlateFormat4Request(request);
  const decoded =
    envelope.kind === 'reply'
      ? { ...envelope, payload: decodeFormat4Payload(envelope.payload) }
      : { ...envelope, error: decodeFailure(envelope.error) };
  const actual = decoded.kind === 'reply' ? decoded.payload : decoded.operation;
  // Proof: Task3 093/094 independently removed these format4 correlations; valid wrong-action/wrong-method replies reached the typed caller and each named format4 rejection test failed.
  if (actual.action !== expected.action) throw new Error('format4 response action differs');
  if ('method' in expected && (!('method' in actual) || actual.method !== expected.method))
    throw new Error('format4 response method differs');
  return decoded;
}
