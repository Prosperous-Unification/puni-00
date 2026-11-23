import { resolveReadyFile } from './hold-paths';
import {
  type Decision,
  formatIdentity,
  type Hold,
  readDecision,
  readHold,
  verifyHold,
} from './hold-token';
import type { Identity } from './process-identity';

export type Readiness =
  | { readonly kind: 'pending'; readonly reason: 'hold-absent' | 'decision-absent' }
  | { readonly kind: 'ready'; readonly hold: Hold; readonly decision: Decision };

/**
 * Read current immutable hold/Ready evidence against a separately qualified complete live birth.
 * This filesystem observation certifies neither process liveness nor kernel ownership. A recorded
 * admitted guard cannot legitimately have a foreign decision; absent legacy evidence is pending,
 * while malformed, unreadable or mismatched evidence throws without authorizing any release.
 */
export function readReadiness(holdFile: string, identity: Identity): Readiness {
  const expected = formatIdentity(identity),
    hold = readHold(holdFile);
  if (hold === undefined) return { kind: 'pending', reason: 'hold-absent' };
  // Proof: readiness-expected-hold-birth admitted a foreign Hold despite a matching expected Ready.
  if (hold.bytes !== expected) throw new Error('guard hold does not match its recorded birth');
  const decision = readDecision(resolveReadyFile(holdFile));
  if (decision === undefined) return { kind: 'pending', reason: 'decision-absent' };
  // Proof: removing the discriminator made both never-admits tests accept Cancelled and Retired as Ready.
  // Proof: readiness-expected-ready-birth admitted an independently foreign Ready without birth equality.
  // Proof: readiness-ready-kind replay returned Ready for a Cancelled marker with matching bytes.
  if (decision.kind !== 'ready' || formatIdentity(decision.identity) !== expected)
    throw new Error('guard readiness does not match its recorded birth');
  // Proof: readiness-snapshot-* returned Ready after actual Hold or Ready unlink without this recheck.
  if (verifyHold(hold) !== 'present' || verifyHold(decision) !== 'present')
    throw new Error('guard readiness changed during observation');
  return { kind: 'ready', hold, decision };
}
