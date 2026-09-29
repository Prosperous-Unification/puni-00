import type { DomainProofChecks } from '@wbs/core/ports/domain-challenges';
import { checkDomainProofs } from '@wbs/core/service/domain-proof.service';

/** One injected run of the dormant domain worker; `now` is checked at commit. */
export function runDomainProofWorker(checks: DomainProofChecks, at: number, now = Date.now) {
  return checkDomainProofs(checks, at, now);
}
