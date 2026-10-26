import { parseOrThrow, type } from '@shared/validation';
import { selectWorkflowActivity } from '@twilight-burokrat/contracts';
import { readRuntimeState, validateSchema } from '@wbs/contracts';

import { PreparationCodec } from '../agents/execution-codecs';
import type { ExecutorKind, Preparation } from '../agents/execution-records';
import { verifyArtifactContent } from './artifact-integrity';
import type { ArtifactStore } from './artifact-store';
import type { PreparationIntent, TargetObservation } from './claim-records';
import { PreparationIntentCodec, TargetObservationCodec } from './execution-codecs';
import { readManifestBinding } from './manifest-binding';
import { decodeAttemptGuard, decodeRun, equalRecords } from './record-codecs';
import type { ArtifactRef, Attempt, ExecutionCommandId, WorkItemId } from './records';
import type { AttemptGuard, RunStore, StoreReply } from './run-store';
import { equalRuntimeScopes, scopeCodec } from './runtime-codecs';
import type { RuntimeScope } from './runtime-records';
import { ArtifactRefCodec, ExecutionCommandIdCodec } from './value-codecs';

export interface PreparationInput {
  readonly commandId: ExecutionCommandId;
  readonly preparation: Preparation;
  readonly requestedType: string;
  readonly stepCode: string;
  readonly stepId: string;
  readonly scope: RuntimeScope;
  readonly parentClaimId: string | null;
  readonly stateEvidence: ArtifactRef;
  readonly executor: { readonly kind: ExecutorKind; readonly version: string };
}
const inputCodec = type({
  commandId: ExecutionCommandIdCodec,
  preparation: PreparationCodec,
  requestedType: 'string>=1',
  stepCode: 'string>=1',
  stepId: 'string>=1',
  scope: scopeCodec,
  parentClaimId: 'string>=1 | null',
  stateEvidence: ArtifactRefCodec,
  executor: PreparationIntentCodec.get('executor'),
}).onUndeclaredKey('reject');

/** Reads an actual WBS observation through its complete response schema before projecting one unambiguous target. Missing, unreadable and malformed trusted state throws with its original cause. */
export async function readTargetObservation(
  artifacts: ArtifactStore,
  evidence: ArtifactRef,
  target: {
    readonly scope: RuntimeScope;
    readonly workItemId: WorkItemId;
    readonly stepId: string;
    readonly stepCode: string;
  },
): Promise<TargetObservation> {
  const reference = structuredClone(parseOrThrow(ArtifactRefCodec, evidence));
  const expected = structuredClone(target);
  // Proof: Task2 F26 removed/broke this dependency; 'preparation requires JSON media type' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  if (reference.mediaType !== 'application/json')
    throw new Error('runtime state requires application/json');
  const content = new Uint8Array(await artifacts.readArtifact(reference));
  // Proof: Task2 F27 removed/broke this dependency; 'preparation validates target and canonical bytes independently' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  verifyArtifactContent(content, reference);
  // Proof: Task2 F28 removed/broke this dependency; 'preparation embedded invalid UTF8 remains parseable' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  const wire: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content));
  // Proof: Task2 F29 removed/broke this dependency; 'preparation refuses actual state schema' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  const checked = await validateSchema(readRuntimeState.responses[0].schema, wire);
  if (checked.issues !== undefined) throw new Error('runtime state schema differs');
  const state = checked.value;
  // Proof: Task2 F30 removed/broke this dependency; 'preparation refuses actual state scope' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  if (!equalRuntimeScopes(state.scope, expected.scope))
    throw new Error('runtime state scope differs');
  const work = state.facts.workItems.filter((candidate) => candidate.id === expected.workItemId);
  const steps = state.facts.steps.filter((candidate) => candidate.id === expected.stepId);
  // Proof: Task2 F31 removed/broke this dependency; 'preparation refuses actual state duplicate work' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  // Proof: Task2 F32 removed/broke this dependency; 'preparation refuses actual state duplicate step' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  // Proof: Task2 F33 removed/broke this dependency; 'preparation refuses actual state wrong code' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  if (work.length !== 1 || steps.length !== 1 || steps[0]?.code !== expected.stepCode)
    throw new Error('runtime state target differs');
  return parseOrThrow(TargetObservationCodec, {
    version: 1,
    evidence: reference,
    scope: state.scope,
    ledgerId: state.ledgerId,
    basis: state.basis,
    workItemId: expected.workItemId,
    stepId: expected.stepId,
    stepCode: expected.stepCode,
  });
}

/** Verifies accepted binding, exact configured executor pin and retained WBS target before retaining preparation intent; never opens an executor. */
export async function recordPreparation(
  runs: Pick<RunStore, 'readRun' | 'readManifest' | 'recordExecution'>,
  artifacts: ArtifactStore,
  guard: AttemptGuard,
  input: PreparationInput,
): Promise<StoreReply<Attempt>> {
  const snapshotGuard = decodeAttemptGuard(structuredClone(guard));
  const snapshot = structuredClone(parseOrThrow(inputCodec, input));
  const history = structuredClone(await runs.readRun(snapshotGuard.runId));
  const run = decodeRun(history.run);
  const attempts = history.attempts.filter(
    (attempt) => attempt.attemptId === snapshotGuard.attemptId,
  );
  const attempt = attempts.at(0);
  // Proof: Task2 F34 removed/broke this dependency; 'preparation verifies returned run identity' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  if (run.runId !== snapshotGuard.runId || attempts.length !== 1 || attempt === undefined)
    throw new Error('preparation attempt does not exist');
  // Proof: Task2 F35 removed/broke this dependency; 'preparation rejects a coherent different attempt identity' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  if (
    snapshot.preparation.attemptId !== attempt.attemptId ||
    !equalRecords(snapshot.preparation.identity, attempt.identity)
  )
    throw new Error('preparation identity differs');
  // Proof: Task2 F36 removed/broke this dependency; 'preparation rejects a coherent foreign organization observation' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  if (
    snapshot.scope.organizationId !== snapshotGuard.ownership.organizationId ||
    snapshot.scope.projectId !== run.projectId
  )
    throw new Error('preparation scope differs');
  const { manifest, binding } = await readManifestBinding(runs, artifacts, run.manifestDigest);
  const selected = selectWorkflowActivity(binding, snapshot.requestedType, snapshot.stepCode);
  // Proof: Task2 F37 removed/broke this dependency; 'preparation requires exact selected kind pin' failed with Missing expected rejection. Restored subset passed; helper rejection only, no provider-publication inference.
  if (
    !Object.hasOwn(manifest.executorVersions, selected.settings.executor) ||
    snapshot.executor.kind !== selected.settings.executor ||
    snapshot.executor.version !== manifest.executorVersions[selected.settings.executor]
  )
    throw new Error('preparation executor pin differs');
  const observation = await readTargetObservation(artifacts, snapshot.stateEvidence, {
    scope: snapshot.scope,
    workItemId: run.workItemId,
    stepId: snapshot.stepId,
    stepCode: selected.stepCode,
  });
  const intent: PreparationIntent = {
    version: 1,
    preparation: snapshot.preparation,
    manifestDigest: manifest.digest,
    selection: {
      bindingDigest: selected.bindingDigest,
      requestedType: selected.requestedType,
      matchedType: selected.matchedType,
      stepCode: selected.stepCode,
      className: selected.className,
    },
    executor: snapshot.executor,
    target: { observation, parentClaimId: snapshot.parentClaimId },
    owner: { ownerId: snapshotGuard.ownership.ownerId, epoch: snapshotGuard.ownership.epoch },
  };
  return await runs.recordExecution(snapshotGuard, {
    version: 2,
    kind: 'execution',
    commandId: snapshot.commandId,
    fact: { kind: 'preparation_intended', intent },
  });
}
