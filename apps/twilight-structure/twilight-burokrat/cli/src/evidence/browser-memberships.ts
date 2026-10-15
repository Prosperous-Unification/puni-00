import { parseOrThrow, type } from '@shared/validation';

import { resolveCandidateRoot } from '../inventory/read-candidate';
import { readExternalArtifact } from '../policy/trust';
import { compareCanonicalText, hashBytes, hashCanonical } from './content-manifest';
import { inspectTestReports } from './test-reports';

const Authority = type({
  schemaVersion: '1',
  revision: /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/,
  candidate: /^[0-9a-f]{64}$/,
  mode: "'ordinary'|'packaged'|'portable'",
  reportObservationDigest: /^[0-9a-f]{64}$/,
  memberships: type({
    level: "'manual'|'conformance'|'architecture'|'performance'",
    kind: "'unknown'|'reviewed-empty'",
  })
    .onUndeclaredKey('reject')
    .array(),
}).onUndeclaredKey('reject');

function decodeAuthority(bytes: Uint8Array) {
  let text: string;
  try {
    // Proof: disabling fatal decoding failed TEST-AXES-094's invalid-UTF-8 production refusal.
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new Error('Browser membership authority is not UTF-8', { cause });
  }
  let input: unknown;
  try {
    // Proof: substituting an empty record failed TEST-AXES-094's malformed-JSON refusal.
    input = JSON.parse(text) as unknown;
  } catch (cause) {
    throw new Error('Browser membership authority JSON is malformed', { cause });
  }
  try {
    // Proof: bypassing this schema made TEST-AXES-094 accept unsupported versions, keys and states.
    return parseOrThrow(Authority, input);
  } catch (cause) {
    throw new Error('Browser membership authority schema is invalid', { cause });
  }
}

/**
 * Binds explicit external earlier-row review assertions to a real complete Browser report.
 * Unknown and reviewed-empty are distinct facts; neither is discovered or authenticated membership.
 * This observation classifies no test and grants no isolation, coverage or admission authority.
 * @throws when authority is malformed, incomplete or differs from the inspected report.
 */
export function inspectBrowserMemberships(
  repository: string,
  revision: string,
  policyPath: string,
  mode: 'ordinary' | 'packaged' | 'portable',
  authorityPath: string,
) {
  const root = resolveCandidateRoot(repository);
  const report = inspectTestReports(root, revision, policyPath, mode);
  const artifact = readExternalArtifact(root, authorityPath, 'Browser membership authority');
  const authority = decodeAuthority(artifact.bytes);
  // Proof: removing this comparison made TEST-AXES-094 accept a changed revision pin.
  if (authority.revision !== report.revision)
    throw new Error('Browser membership authority revision differs from report');
  // Proof: removing this comparison made TEST-AXES-094 accept a changed candidate pin.
  if (authority.candidate !== report.candidate)
    throw new Error('Browser membership authority candidate differs from report');
  // Proof: removing this comparison made TEST-AXES-094 accept a changed mode pin.
  if (authority.mode !== report.mode)
    throw new Error('Browser membership authority mode differs from report');
  // Proof: removing this comparison made TEST-AXES-094 accept a different report digest.
  if (authority.reportObservationDigest !== report.observationDigest)
    throw new Error('Browser membership authority report digest differs from report');
  // Proof: removing row sorting failed TEST-AXES-093's canonical review-row assertion.
  const memberships = [...authority.memberships].sort((left, right) =>
    compareCanonicalText(left.level, right.level),
  );
  // Proof: bypassing completeness made TEST-AXES-094 accept omitted and duplicated rows.
  if (
    memberships.map((membership) => membership.level).join(',') !==
    'architecture,conformance,manual,performance'
  )
    throw new Error('Browser membership authority requires every earlier row exactly once');
  const observation = {
    schemaVersion: 1 as const,
    kind: 'browser-memberships' as const,
    // Proof: zeroing this digest failed TEST-AXES-093's exact external-byte identity assertion.
    authorityDigest: hashBytes(artifact.bytes),
    // Proof: replacing the nested report failed TEST-AXES-093's real source/outcome bindings.
    report,
    // Proof: removing deduplication failed TEST-AXES-093's two cases sharing one source.
    collection: [...new Set(report.cases.map((browserCase) => browserCase.file))].sort(
      compareCanonicalText,
    ),
    // Proof: converting unknown to reviewed-empty failed TEST-AXES-093's exact state assertion.
    memberships,
    // Proof: promoting authentication or certification independently failed TEST-AXES-093.
    authentication: { kind: 'absent' as const },
    certifies: false as const,
  };
  // Proof: hashing an empty payload failed TEST-AXES-093's independently recomputed full digest.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
