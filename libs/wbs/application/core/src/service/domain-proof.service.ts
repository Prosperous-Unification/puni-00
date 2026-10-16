import {
  DomainDnsUnavailableError,
  type DomainProofChecks,
  type RetainedDomainProof,
} from '../ports/domain-challenges';

// Proof: 2026-09-28, raising this to 50 seconds made mounted `shows retained
// proof check timestamps and a warning after a failed day-seven check` observe
// 50,000 instead of the required 5,000 through its injected short timer.
const LOOKUP_TIMEOUT_MS = 5_000;

/** Runs one bounded authoritative lookup against a retained, bound digest. */
async function matchesProof(
  checks: DomainProofChecks,
  proof: RetainedDomainProof,
  at: number,
  cancellation?: AbortSignal,
): Promise<'current' | 'previous' | null> {
  const deadline = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
  // Proof: removing the composed signal made `parent abort joins` observe an un-aborted lookup.
  const signal = cancellation === undefined ? deadline : AbortSignal.any([deadline, cancellation]);
  const expiration = Promise.withResolvers<never>();
  const expire = () => {
    expiration.reject(new DomainDnsUnavailableError('DNS timeout'));
  };
  // Proof: racing parent abort made `parent abort joins` settle before delayed cleanup.
  // Parent abort is passed to the resolver without racing its resource
  // cleanup. Only the outer watchdog can bound a noncompliant resolver.
  deadline.addEventListener('abort', expire, { once: true });
  let records: readonly string[];
  try {
    records = await Promise.race([
      checks.resolver.lookupTxt(`_wbs-verification.${proof.domain}`, signal),
      expiration.promise,
    ]);
    // Proof: 2026-09-28, bypassing response validation made mounted `records
    // a failed retained check for a malformed TXT response` throw a TypeError
    // on numeric TXT data instead of recording a failed check.
    if (!Array.isArray(records) || !records.every((record) => typeof record === 'string'))
      return null;
  } catch (failure) {
    // Proof: removing this guard made `propagates unexpected resolver failures`
    // record a failed proof. Checking parent abort first masked the fault in
    // `delayed unexpected cleanup failure survives parent cancellation`.
    if (!(failure instanceof DomainDnsUnavailableError)) throw failure;
    // Cancellation is rechecked by the caller before any completion write.
    return null;
  } finally {
    deadline.removeEventListener('abort', expire);
  }
  const prefix = `wbs-domain-verification=${proof.organizationId}:${proof.domain}:`;
  let foundPrevious = false;
  for (const record of records) {
    if (
      !record.startsWith(prefix) ||
      !/^wbs-domain-verification=[^:]+:[^:]+:[a-f0-9]{64}$/.test(record)
    )
      continue;
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(record))),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    // Proof: 2026-09-28, accepting any well-formed TXT digest made mounted
    // `shows retained proof check timestamps and a warning after a failed day-seven check`
    // clear its warning on a different token.
    if (digest === proof.proofDigest) return 'current';
    // Proof: 2026-09-28, disabling old-proof matching made mounted `rotates an
    // owned proof and accepts the old proof only during overlap` leave
    // lastSuccessAt unchanged before expiry. Removing the lookup deadline
    // advanced it on day eight with the commit clock held before expiry.
    // Proof: 2026-09-28, returning on the first old record made mounted
    // `ends old-proof overlap when the replacement succeeds` retain the old digest
    // when DNS also contained the new record.
    if (
      digest === proof.previousProofDigest &&
      proof.previousProofValidUntil !== null &&
      at < proof.previousProofValidUntil
    )
      foundPrevious = true;
  }
  return foundPrevious ? 'previous' : null;
}

/**
 * Checks due retained proofs once; `now` is read again inside the commit.
 * Cancellation returns partial counts without recording the cancelled lookup.
 * Unexpected DNS and repository failures reject, including cleanup failures
 * after parent abort. The five-second watchdog can outlive cancellation and
 * return before a noncompliant resolver joins; a production resolver must own
 * a shorter total work-and-cleanup deadline.
 */
export async function checkDomainProofs(
  checks: DomainProofChecks,
  at: number,
  now: () => number = Date.now,
  cancellation?: AbortSignal,
): Promise<{ checked: number; stale: number }> {
  let checked = 0;
  let stale = 0;
  // Proof: removing this check made `pre-aborted cancellation` read trusted state.
  if (cancellation?.aborted) return { checked, stale };
  for (const proof of await checks.readDueProofs(at)) {
    // Proof: removing this check made `cancellation during snapshot read` start DNS.
    if (cancellation?.aborted) return { checked, stale };
    const matched = await matchesProof(checks, proof, at, cancellation);
    // Proof: removing this check made both `cancellation before DNS reply` cases commit.
    if (cancellation?.aborted) return { checked, stale };
    const finished = await checks.finishProofCheck(proof, matched, at, now);
    if (finished === 'checked') checked += 1;
    else stale += 1;
  }
  return { checked, stale };
}
