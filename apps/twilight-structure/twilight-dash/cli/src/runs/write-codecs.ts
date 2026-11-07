import { isDeepStrictEqual } from 'node:util';

import { parseOrThrow, type } from '@shared/validation';

import {
  AttemptOutcomeCodec,
  QuiescenceCodec,
  ScopeContextCodec,
  TargetObservationCodec,
  TurnCheckpointCodec,
} from './execution-codecs';
import {
  acceptanceCodec,
  digestRuntimeRequest,
  intentCodec,
  readRuntimeRequest,
} from './runtime-codecs';
import {
  ActivityIdentityCodec,
  ArtifactRefCodec,
  AttemptIdCodec,
  ExecutionCommandIdCodec,
  Integer,
  Positive,
  RunIdCodec,
} from './value-codecs';
import type {
  Attempt4,
  RecordedWrite,
  WriteAcceptAck,
  WriteAcceptCommand,
  WriteCompletion,
  WriteObligation,
  WriteProjection,
  WriteReceipt,
  WriteStageAck,
  WriteStageCommand,
} from './write-records';

// Proof: T1 shape-writecompletion replaced this composition with unknown; 'historical current attempt and generic completion codecs keep their exact identities' lost rejection. Exact restoration passed.
export const WriteCompletionCodec = type({
  version: '1',
  outcome: AttemptOutcomeCodec,
  quiescence: QuiescenceCodec,
  // Proof: T1 strict-owned-1 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
}).onUndeclaredKey('reject');
// Proof: T1 shape-writestagecommand replaced this composition with unknown; 'write command canonical bytes operation and bounded local versus unbounded wire identities' lost rejection. Exact restoration passed.
export const WriteStageCommandCodec = type({
  version: '1',
  kind: "'stage_write'",
  commandId: ExecutionCommandIdCodec,
  completion: WriteCompletionCodec,
  canonicalRequest: 'string>=1',
  observation: TargetObservationCodec,
  // Proof: T1 strict-owned-2 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
}).onUndeclaredKey('reject');
// Proof: T1 shape-writeprojection replaced this composition with unknown; 'write boundaries reject owned unknown missing and version fields and detach every nested value' lost rejection. Exact restoration passed.
export const WriteProjectionCodec = type({
  version: '1',
  actorId: 'string>=1',
  basisAfter: /^rb1:[0-9a-f]{64}$/,
  applied: type({
    index: Integer,
    kind: "'setProgress' | 'setMeasure' | 'patchWorkItem' | 'releaseWorkItem'",
  })
    // Proof: T1 strict-owned-3 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
    .onUndeclaredKey('reject')
    .array()
    .atLeastLength(1),
  // Proof: T1 strict-owned-4 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
}).onUndeclaredKey('reject');
// Proof: T1 shape-writeacceptcommand replaced this composition with unknown; 'write boundaries reject owned unknown missing and version fields and detach every nested value' lost rejection. Exact restoration passed.
export const WriteAcceptCommandCodec = type({
  version: '1',
  kind: "'accept_write'",
  commandId: ExecutionCommandIdCodec,
  stageCommandId: ExecutionCommandIdCodec,
  intent: intentCodec,
  evidence: ArtifactRefCodec,
  projection: WriteProjectionCodec,
  // Proof: T1 strict-owned-5 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
}).onUndeclaredKey('reject');
// Proof: T1 shape-writereceipt replaced this composition with unknown; 'write boundaries reject owned unknown missing and version fields and detach every nested value' lost rejection. Exact restoration passed.
export const WriteReceiptCodec = type({
  version: '1',
  stageCommandId: ExecutionCommandIdCodec,
  acceptance: acceptanceCodec,
  projection: WriteProjectionCodec,
  // Proof: T1 strict-owned-6 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
}).onUndeclaredKey('reject');
// Proof: T1 shape-writeobligation replaced this composition with unknown; 'write boundaries reject owned unknown missing and version fields and detach every nested value' lost rejection. Exact restoration passed.
export const WriteObligationCodec = type({
  version: '1',
  stageCommandId: ExecutionCommandIdCodec,
  intent: intentCodec,
  completion: WriteCompletionCodec,
  disposition: type({ kind: "'pending'" })
    // Proof: T1 strict-owned-7 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
    .onUndeclaredKey('reject')
    // Proof: T1 strict-owned-8 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
    .or(type({ kind: "'fenced_nonaccepted'", recoveryId: 'string>=1' }).onUndeclaredKey('reject')),
  // Proof: T1 strict-owned-9 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
}).onUndeclaredKey('reject');
const checkpointFields = {
  checkpoint: TurnCheckpointCodec,
  outcome: AttemptOutcomeCodec,
  quiescence: QuiescenceCodec,
  stageCommandId: ExecutionCommandIdCodec,
};
// Proof: T1 shape-writestate replaced this composition with unknown; 'write attempts preserve precise pending nonaccepted terminal variants and operation binding' lost rejection. Exact restoration passed.
export const WriteStateCodec = type({
  ...checkpointFields,
  kind: "'write_pending'",
  intent: intentCodec,
})
  // Proof: T1 strict-owned-10 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
  .onUndeclaredKey('reject')
  .or(
    type({
      ...checkpointFields,
      kind: "'write_nonaccepted'",
      intent: intentCodec,
      recoveryId: 'string>=1',
      // Proof: T1 strict-owned-11 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
    }).onUndeclaredKey('reject'),
  )
  .or(
    type({
      ...checkpointFields,
      kind: "'write_terminal'",
      receipt: WriteReceiptCodec,
      // Proof: T1 strict-owned-12 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
    }).onUndeclaredKey('reject'),
  );
// Proof: T1 shape-writeattempt replaced this composition with unknown; 'write attempts preserve precise pending nonaccepted terminal variants and operation binding' lost rejection. Exact restoration passed.
export const WriteAttemptCodec = type({
  version: '4',
  attemptId: AttemptIdCodec,
  identity: ActivityIdentityCodec,
  ordinal: Positive,
  revision: Integer,
  admittedEpoch: Positive,
  holdsCapacity: 'false',
  state: WriteStateCodec,
  // Proof: T1 strict-owned-13 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
}).onUndeclaredKey('reject');
// Proof: T1 shape-writestageack replaced this composition with unknown; 'write boundaries reject owned unknown missing and version fields and detach every nested value' lost rejection. Exact restoration passed.
export const WriteStageAckCodec = type({
  version: '1',
  kind: "'write_staged'",
  intent: intentCodec,
  obligation: WriteObligationCodec,
  attempt: WriteAttemptCodec,
  // Proof: T1 strict-owned-14 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
}).onUndeclaredKey('reject');
// Proof: T1 shape-writeacceptack replaced this composition with unknown; 'write boundaries reject owned unknown missing and version fields and detach every nested value' lost rejection. Exact restoration passed.
export const WriteAcceptAckCodec = type({
  version: '1',
  kind: "'write_accepted'",
  receipt: WriteReceiptCodec,
  attempt: WriteAttemptCodec,
  // Proof: T1 strict-owned-15 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
}).onUndeclaredKey('reject');
const associationFields = {
  version: '1',
  runId: RunIdCodec,
  attemptId: AttemptIdCodec,
  // Proof: T1 scope-context-consumer substituted unknown; 'write nested shapes reject unknown keys at every retained object boundary' lost context rejection. Exact restoration passed.
  context: ScopeContextCodec,
} as const;
// Proof: T1 shape-recordedwrite replaced this composition with unknown; 'write boundaries reject owned unknown missing and version fields and detach every nested value' lost rejection. Exact restoration passed.
export const RecordedWriteCodec = type({
  ...associationFields,
  kind: "'stage_write'",
  command: WriteStageCommandCodec,
  reply: WriteStageAckCodec,
})
  // Proof: T1 strict-owned-16 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
  .onUndeclaredKey('reject')
  .or(
    type({
      ...associationFields,
      kind: "'accept_write'",
      command: WriteAcceptCommandCodec,
      reply: WriteAcceptAckCodec,
      // Proof: T1 strict-owned-17 independently permitted unknown keys here; 'write nested shapes reject unknown keys at every retained object boundary' lost rejection. Exact restoration passed.
    }).onUndeclaredKey('reject'),
  );

function checkCompletion(completion: WriteCompletion): void {
  // Proof: T1 codec-guard-1 bypassed this check; 'write completion rejects indeterminate effect and success without successful effect' failed its semantic assertion. Exact restoration passed.
  if (
    completion.quiescence.effect === 'unknown' ||
    (completion.outcome.kind === 'succeeded' && completion.quiescence.effect !== 'succeeded')
  )
    throw new Error('write completion effect differs');
}
function readWrite(canonicalRequest: string) {
  const request = readRuntimeRequest(canonicalRequest);
  // Proof: T1 codec-guard-2 bypassed this check; 'write command canonical bytes operation and bounded local versus unbounded wire identities' failed its semantic assertion. Exact restoration passed.
  if ('kind' in request.operation || request.operation.action.kind !== 'write')
    throw new Error('write request operation differs');
  return { ...request, operation: request.operation, action: request.operation.action };
}
function checkIntent(intent: WriteObligation['intent']): void {
  const request = readWrite(intent.canonicalRequest);
  // Proof: T1 codec-guard-3 bypassed this check; 'write command canonical bytes operation and bounded local versus unbounded wire identities' failed its semantic assertion. Exact restoration passed.
  if (
    request.operation.commandId !== intent.commandId ||
    digestRuntimeRequest(intent.canonicalRequest) !== intent.requestDigest
  )
    throw new Error('write intent identity differs');
}
function checkProjection(projection: WriteProjection): void {
  // Proof: T1 codec-guard-4 bypassed this check; 'write command canonical bytes operation and bounded local versus unbounded wire identities' failed its semantic assertion. Exact restoration passed.
  if (projection.applied.some((command, index) => command.index !== index))
    throw new Error('write projection order differs');
}
function checkAttempt(attempt: Attempt4): void {
  const state = attempt.state;
  checkCompletion({ version: 1, outcome: state.outcome, quiescence: state.quiescence });
  const checkpoint = state.checkpoint;
  const preparation = checkpoint.execution.session.locator.preparation;
  // Proof: T1 codec-guard-5 bypassed this check; 'write attempts preserve precise pending nonaccepted terminal variants and operation binding' failed its semantic assertion. Exact restoration passed.
  if (
    state.quiescence.operationKey !== attempt.identity.operationKey ||
    !isDeepStrictEqual(attempt.identity, preparation.identity) ||
    attempt.attemptId !== preparation.attemptId
  )
    throw new Error('write attempt operation differs');
  if (state.kind === 'write_terminal') {
    checkProjection(state.receipt.projection);
    // Proof: T1 codec-guard-7 bypassed this check; 'write attempts preserve precise pending nonaccepted terminal variants and operation binding' failed its semantic assertion. Exact restoration passed.
    if (state.stageCommandId !== state.receipt.stageCommandId)
      throw new Error('write receipt stage differs');
  } else {
    checkIntent(state.intent);
    const request = readWrite(state.intent.canonicalRequest);
    // Proof: T1 codec-guard-8-supplement bypassed this check; 'standalone write attempt rejects independently rekeyed run attempt and session targets' failed its semantic assertion. Exact restoration passed.
    if (
      request.action.claim.execution.runId !== attempt.identity.runId ||
      request.action.claim.execution.attemptId !== attempt.attemptId ||
      request.action.claim.execution.sessionId !==
        checkpoint.execution.session.locator.session.sessionId
    )
      throw new Error('write attempt target differs');
  }
}
/** Strict detached portable boundary; determinate completion never establishes remote acceptance. */
export function decodeWriteCompletion(input: unknown): WriteCompletion {
  const completion = parseOrThrow(WriteCompletionCodec, input);
  checkCompletion(completion);
  // Proof: T1 snapshot-6312 substituted a shallow copy; 'write boundaries reject owned unknown missing and version fields and detach every nested value' failed nested ownership. Exact restoration passed.
  return structuredClone(completion);
}
export function decodeWriteStageCommand(input: unknown): WriteStageCommand {
  const command = parseOrThrow(WriteStageCommandCodec, input);
  checkCompletion(command.completion);
  readWrite(command.canonicalRequest);
  // Proof: T1 snapshot-6570 substituted a shallow copy; 'write boundaries reject owned unknown missing and version fields and detach every nested value' failed nested ownership. Exact restoration passed.
  return structuredClone(command);
}
/** Selects the declared local fields of a previously verified write receipt without changing its retained raw evidence. Public additions stay in the artifact; local projection validation remains strict. This neither authenticates the response nor grants execution permission. */
export function projectWriteReceipt(receipt: {
  readonly actorId: WriteProjection['actorId'];
  readonly acceptance: Pick<WriteProjection, 'basisAfter' | 'applied'>;
}): WriteProjection {
  // Proof: P01 retaining additive applied metadata rejected valid public receipts; P06/P07 substituting valid actor/basis values broke known-field correspondence. Strict local decoding and raw artifacts stay unchanged. Exact restorations passed.
  return decodeWriteProjection({
    version: 1,
    actorId: receipt.actorId,
    basisAfter: receipt.acceptance.basisAfter,
    applied: receipt.acceptance.applied.map(({ index, kind }) => ({ index, kind })),
  });
}
export function decodeWriteProjection(input: unknown): WriteProjection {
  const projection = parseOrThrow(WriteProjectionCodec, input);
  checkProjection(projection);
  // Proof: T1 snapshot-6775 substituted a shallow copy; 'write boundaries reject owned unknown missing and version fields and detach every nested value' failed nested ownership. Exact restoration passed.
  return structuredClone(projection);
}
export function decodeWriteAcceptCommand(input: unknown): WriteAcceptCommand {
  const command = parseOrThrow(WriteAcceptCommandCodec, input);
  checkIntent(command.intent);
  checkProjection(command.projection);
  const request = readWrite(command.intent.canonicalRequest);
  // Proof: T1 codec-guard-9 bypassed this check; 'write command canonical bytes operation and bounded local versus unbounded wire identities' failed its semantic assertion. Exact restoration passed.
  if (
    command.commandId === command.stageCommandId ||
    !isDeepStrictEqual(
      command.projection.applied,
      request.action.commands.map((entry, index) => ({ index, kind: entry.kind })),
    )
  )
    throw new Error('write acceptance command differs');
  // Proof: T1 snapshot-7323 substituted a shallow copy; 'write boundaries reject owned unknown missing and version fields and detach every nested value' failed nested ownership. Exact restoration passed.
  return structuredClone(command);
}
export function decodeWriteReceipt(input: unknown): WriteReceipt {
  const receipt = parseOrThrow(WriteReceiptCodec, input);
  checkProjection(receipt.projection);
  // Proof: T1 snapshot-7524 substituted a shallow copy; 'write boundaries reject owned unknown missing and version fields and detach every nested value' failed nested ownership. Exact restoration passed.
  return structuredClone(receipt);
}
export function decodeWriteObligation(input: unknown): WriteObligation {
  const obligation = parseOrThrow(WriteObligationCodec, input);
  checkIntent(obligation.intent);
  checkCompletion(obligation.completion);
  // Proof: T1 snapshot-7774 substituted a shallow copy; 'write boundaries reject owned unknown missing and version fields and detach every nested value' failed nested ownership. Exact restoration passed.
  return structuredClone(obligation);
}
export function decodeWriteAttempt(input: unknown): Attempt4 {
  const attempt = parseOrThrow(WriteAttemptCodec, input);
  checkAttempt(attempt);
  // Proof: T1 snapshot-7960 substituted a shallow copy; 'write boundaries reject owned unknown missing and version fields and detach every nested value' failed nested ownership. Exact restoration passed.
  return structuredClone(attempt);
}
export function decodeWriteStageAck(input: unknown): WriteStageAck {
  const ack = parseOrThrow(WriteStageAckCodec, input);
  checkAttempt(ack.attempt);
  const state = ack.attempt.state;
  // Proof: T1 codec-guard-10 bypassed this check; 'write acknowledgements and journal independently bind target scope cut and original consequences' failed its semantic assertion. Exact restoration passed.
  if (
    state.kind !== 'write_pending' ||
    ack.obligation.disposition.kind !== 'pending' ||
    state.stageCommandId !== ack.obligation.stageCommandId ||
    !isDeepStrictEqual(ack.intent, state.intent) ||
    !isDeepStrictEqual(ack.intent, ack.obligation.intent) ||
    !isDeepStrictEqual(ack.obligation.completion, {
      version: 1,
      outcome: state.outcome,
      quiescence: state.quiescence,
    })
  )
    throw new Error('write stage acknowledgement differs');
  // Proof: T1 snapshot-8610 substituted a shallow copy; 'write boundaries reject owned unknown missing and version fields and detach every nested value' failed nested ownership. Exact restoration passed.
  return structuredClone(ack);
}
export function decodeWriteAcceptAck(input: unknown): WriteAcceptAck {
  const ack = parseOrThrow(WriteAcceptAckCodec, input);
  checkAttempt(ack.attempt);
  // Proof: T1 codec-guard-11 bypassed this check; 'write acknowledgements and journal independently bind target scope cut and original consequences' failed its semantic assertion. Exact restoration passed.
  if (
    ack.attempt.state.kind !== 'write_terminal' ||
    !isDeepStrictEqual(ack.receipt, ack.attempt.state.receipt)
  )
    throw new Error('write acceptance acknowledgement differs');
  // Proof: T1 snapshot-8973 substituted a shallow copy; 'write boundaries reject owned unknown missing and version fields and detach every nested value' failed nested ownership. Exact restoration passed.
  return structuredClone(ack);
}
export function decodeRecordedWrite(input: unknown): RecordedWrite {
  const record = parseOrThrow(RecordedWriteCodec, input);
  const attempt = record.reply.attempt;
  // Proof: T1 codec-guard-12 bypassed this check; 'write acknowledgements and journal independently bind target scope cut and original consequences' failed its semantic assertion. Exact restoration passed.
  if (record.runId !== attempt.identity.runId || record.attemptId !== attempt.attemptId)
    throw new Error('write journal target differs');
  if (record.kind === 'stage_write') {
    const command = decodeWriteStageCommand(record.command);
    const ack = decodeWriteStageAck(record.reply);
    // Proof: T1 codec-guard-14 bypassed this check; 'write acknowledgements and journal independently bind target scope cut and original consequences' failed its semantic assertion. Exact restoration passed.
    if (
      ack.intent.stagedRevision !== record.context.scopeRevision + 1 ||
      command.commandId !== ack.obligation.stageCommandId ||
      command.canonicalRequest !== ack.intent.canonicalRequest ||
      !isDeepStrictEqual(command.completion, ack.obligation.completion)
    )
      throw new Error('write journal stage differs');
  } else {
    const command = decodeWriteAcceptCommand(record.command);
    const ack = decodeWriteAcceptAck(record.reply);
    // Proof: T1 codec-guard-15 bypassed this check; 'write acknowledgements and journal independently bind target scope cut and original consequences' failed its semantic assertion. Exact restoration passed.
    if (
      ack.receipt.acceptance.acceptedRevision !== record.context.scopeRevision + 1 ||
      command.stageCommandId !== ack.receipt.stageCommandId ||
      command.intent.commandId !== ack.receipt.acceptance.commandId ||
      command.intent.requestDigest !== ack.receipt.acceptance.requestDigest ||
      !isDeepStrictEqual(command.evidence, ack.receipt.acceptance.evidence) ||
      !isDeepStrictEqual(command.projection, ack.receipt.projection)
    )
      throw new Error('write journal acceptance differs');
  }
  // Proof: T1 snapshot-10368 substituted a shallow copy; 'write boundaries reject owned unknown missing and version fields and detach every nested value' failed nested ownership. Exact restoration passed.
  return structuredClone(record);
}
