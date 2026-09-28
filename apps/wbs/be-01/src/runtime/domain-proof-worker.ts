import type { DomainProofChecks } from '@wbs/core/ports/domain-challenges';
import { checkDomainProofs } from '@wbs/core/service/domain-proof.service';

/** One injected run of the dormant domain worker; boot never schedules it. */
export function runDomainProofWorker(checks: DomainProofChecks, at: number) {
  return checkDomainProofs(checks, at);
}
