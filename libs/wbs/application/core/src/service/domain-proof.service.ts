import type { DomainProofChecks, RetainedDomainProof } from '../ports/domain-challenges';

// Proof: 2026-09-28, raising this to 50 seconds made mounted `shows retained
// proof check timestamps and a warning after a failed day-seven check` time out at 10 seconds.
const LOOKUP_TIMEOUT_MS = 5_000;

/** Runs one bounded authoritative lookup against a retained, bound digest. */
async function matchesProof(
  checks: DomainProofChecks,
  proof: RetainedDomainProof,
): Promise<boolean> {
  const signal = AbortSignal.timeout(LOOKUP_TIMEOUT_MS);
  let records: readonly string[];
  try {
    records = await Promise.race([
      checks.resolver.lookupTxt(`_wbs-verification.${proof.domain}`, signal),
      new Promise<never>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            reject(new Error('DNS timeout'));
          },
          { once: true },
        );
      }),
    ]);
    // Proof: 2026-09-28, treating a resolver error as success made mounted
    // `shows retained proof check timestamps and a warning after a failed day-seven check` lose its warning.
    if (!Array.isArray(records) || !records.every((record) => typeof record === 'string'))
      return false;
  } catch {
    // Proof: 2026-09-28, treating a resolver timeout as success made mounted
    // `shows retained proof check timestamps and a warning after a failed day-seven check`
    // advance lastSuccessAt and hide the warning.
    return false;
  }
  const prefix = `wbs-domain-verification=${proof.organizationId}:${proof.domain}:`;
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
    if (digest === proof.proofDigest) return true;
  }
  return false;
}

/** Checks due retained proofs once; a caller must schedule it explicitly. */
export async function checkDomainProofs(
  checks: DomainProofChecks,
  at: number,
): Promise<{ checked: number; stale: number }> {
  let checked = 0;
  let stale = 0;
  for (const proof of await checks.readDueProofs(at)) {
    const matched = await matchesProof(checks, proof);
    const finished = await checks.finishProofCheck(proof, matched, at);
    if (finished === 'checked') checked += 1;
    else stale += 1;
  }
  return { checked, stale };
}
