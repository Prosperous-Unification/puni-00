import type { ArtifactStore } from './artifact-store';
import { equalRecords } from './record-codecs';
import { decodeRecoveryHistory } from './recovery-codecs';
import {
  deriveRecoveryClaimCommand,
  readRecoveryExchange,
  type RecoveryEvidenceSubject,
} from './recovery-evidence';
import type { RecoveryExchangeValue, RecoveryFence, RecoveryHistory } from './recovery-records';
import { decodeRuntimeIntent, readRuntimeRequest } from './runtime-codecs';

/** Rederives every complete retained value from independent bytes; typed pairs alone establish no integrity. */
export async function verifyRecoveryHistory(
  artifacts: ArtifactStore,
  candidate: RecoveryHistory,
): Promise<void> {
  const history = decodeRecoveryHistory(candidate);
  const verify = async (pair: RecoveryExchangeValue<unknown>, subject: RecoveryEvidenceSubject) => {
    const verified = await readRecoveryExchange(artifacts, pair.envelope.artifact, subject);
    if (!equalRecords(verified.exchange, pair))
      // Proof: R2F05 removed only this check; 'verified recovery rereads complete values and rejects a coherent same-reference rewrite' lost its required rejection. Exact restoration passed.
      throw new Error('recovery value differs from actual artifact');
    return verified;
  };
  const intent = (fence: RecoveryFence) =>
    decodeRuntimeIntent({
      version: 1,
      commandId: readRuntimeRequest(fence.canonicalRequest).operation.commandId,
      canonicalRequest: fence.canonicalRequest,
      requestDigest: fence.requestDigest,
      localOwner: fence.owner,
      stagedRevision: fence.stagedRevision,
    });
  for (const fence of history.fences) {
    await verify(fence.basis.state, { kind: 'state' });
    if (fence.basis.kind === 'superseding') await verify(fence.basis.lookup, { kind: 'absent' });
  }
  for (const observation of history.observations)
    await verify(
      observation.reply,
      observation.kind === 'accepted'
        ? { kind: 'authority', intent: intent(observation.fence) }
        : { kind: 'generation_conflict' },
    );
  const closure = history.closure;
  if (closure === null) return;
  const target = history.intent.target;
  const verified = await verify(
    closure.decision.lookup,
    closure.decision.kind === 'accepted'
      ? { kind: target.kind, intent: target.original }
      : { kind: 'absent' },
  );
  if (target.kind === 'claim' && closure.decision.kind === 'accepted') {
    if (
      verified.kind !== 'claim' ||
      !('command' in closure.decision) ||
      !equalRecords(
        deriveRecoveryClaimCommand({ ...history.intent, target }, verified.exchange),
        closure.decision.command,
      )
    )
      // Proof: R2F48 removed only this check; 'complete claim recovery verifies actual exchanges accepted=true' lost its required rejection. Exact restoration passed.
      throw new Error('recovery claim command differs from actual receipt');
  }
}
