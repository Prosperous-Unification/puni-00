import { lstatSync } from 'node:fs';
import { isAbsolute, parse, resolve, sep } from 'node:path';

import { parseOrThrow, type } from '@shared/validation';

import { RelativePath } from '../contracts/records';
import { resolveCandidateRoot } from '../inventory/read-candidate';
import { readExternalArtifact } from '../policy/trust';
import { isAdopted } from '../rules/rule';
import { inspectBrowserT2 } from './browser-t2';
import { compareCanonicalText, hashBytes, hashCanonical } from './content-manifest';
import { readEvaluationInstant } from './manual';

type BrowserT2 = ReturnType<typeof inspectBrowserT2>;
// Proof: widening digest syntax failed BROWSER-T2-POLICY-PREVIEW-005's digest-schema negative.
const Digest = type(/^[0-9a-f]{64}$/);
// Proof: widening capability or nested keys failed BROWSER-T2-POLICY-PREVIEW-005's blank-capability and binding-key negatives.
const Binding = type({
  revision: type(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/),
  candidate: Digest,
  capability: type('string').narrow((value) => value.trim().length > 0),
  evaluatedAt: 'string',
  rulePolicyDigest: Digest,
  browserT2ObservationDigest: Digest,
}).onUndeclaredKey('reject');
// Proof: opening mode objects or replacing RelativePath failed BROWSER-T2-POLICY-PREVIEW-005's prefix/key negatives.
const Disposition = type.or(
  type({ mode: "'observe'" }).onUndeclaredKey('reject'),
  type({ mode: "'enforce'" }).onUndeclaredKey('reject'),
  type({ mode: "'ratchet'", adoptedPrefixes: RelativePath.array() }).onUndeclaredKey('reject'),
);
// Proof: widening version/kind or opening root keys failed BROWSER-T2-POLICY-PREVIEW-005's schema negatives.
const ProposedPolicy = type({
  schemaVersion: '1',
  kind: "'proposed-browser-citation-policy'",
  binding: Binding,
  disposition: Disposition,
}).onUndeclaredKey('reject');
type ProposedPolicy = typeof ProposedPolicy.infer;
interface CitationFinding {
  caseId: string;
  path: string;
  kind: 'missing' | 'malformed' | 'inactive';
  effect: 'debt' | 'refusal';
}

interface BrowserT2PolicyObservation {
  schemaVersion: 1;
  kind: 'browser-t2-policy-preview';
  revision: string;
  candidate: string;
  capability: string;
  evaluatedAt: string;
  scope: BrowserT2['scope'];
  policyId: string;
  policyDigest: string;
  proposedPolicy: ProposedPolicy;
  proposedPolicyDigest: string;
  browserT2: BrowserT2;
  browserT2ObservationDigest: string;
  findings: CitationFinding[];
  proposedDisposition: { kind: 'citation-refusals' | 'no-citation-refusals' };
  authentication: { kind: 'absent' };
  certifies: false;
  observationDigest: string;
}

function readProposal(repository: string, path: string) {
  // Proof: removing canonical-path validation failed BROWSER-T2-POLICY-PREVIEW-003's relative and noncanonical negatives.
  if (!isAbsolute(path) || path !== resolve(path))
    throw new Error('Browser T2 proposed policy path must be canonical absolute');
  const pathRoot = parse(path).root;
  let cursor = pathRoot;
  for (const segment of path.slice(pathRoot.length).split(sep)) {
    if (segment.length === 0) continue;
    cursor = resolve(cursor, segment);
    // Proof: removing this guard failed BROWSER-T2-POLICY-PREVIEW-003's final and ancestor symlink negatives.
    if (lstatSync(cursor).isSymbolicLink())
      throw new Error('Browser T2 proposed policy contains a symlink');
  }
  // Proof: removing this guard lost BROWSER-T2-POLICY-PREVIEW-003's named regular-file refusal.
  if (!lstatSync(path).isFile())
    throw new Error('Browser T2 proposed policy is not a regular file');
  const artifact = readExternalArtifact(
    resolveCandidateRoot(repository),
    path,
    'Browser T2 proposed policy',
  );
  // Proof: nonfatal decoding accepted BROWSER-T2-POLICY-PREVIEW-003's invalid byte inside a valid ratchet prefix.
  const source = new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes);
  const input: unknown = JSON.parse(source);
  const proposedPolicy = parseOrThrow(ProposedPolicy, input);
  // Proof: removing normalization equality lost BROWSER-T2-POLICY-PREVIEW-005's named canonical-UTC refusal.
  if (
    readEvaluationInstant(proposedPolicy.binding.evaluatedAt).toISOString() !==
    proposedPolicy.binding.evaluatedAt
  )
    throw new Error('Browser T2 proposed policy instant must be canonical UTC');
  const disposition = proposedPolicy.disposition;
  // Proof: removing uniqueness accepted BROWSER-T2-POLICY-PREVIEW-005's repeated adopted prefix.
  if (
    disposition.mode === 'ratchet' &&
    new Set(disposition.adoptedPrefixes).size !== disposition.adoptedPrefixes.length
  )
    throw new Error('Browser T2 proposed policy repeats an adopted prefix');
  return { proposedPolicy, proposedPolicyDigest: hashBytes(artifact.bytes) };
}

/** Checks literal authority markers at the dependency boundary without coercion. */
function isDiagnostic(observation: {
  authentication: { kind: string };
  certifies: unknown;
}): boolean {
  // Proof: removing either predicate accepted BROWSER-T2-POLICY-PREVIEW-009's resealed authentication or true/null/zero/empty certification.
  return observation.authentication.kind === 'absent' && observation.certifies === false;
}

function assertObservation(
  browserT2: BrowserT2,
  revision: string,
  capability: string,
  evaluatedAt: string,
  binding: ProposedPolicy['binding'],
): void {
  const { observationDigest, ...payload } = browserT2;
  // Proof: bypassing full hashing lost BROWSER-T2-POLICY-PREVIEW-009's named upstream-digest refusal.
  if (observationDigest !== hashCanonical(payload))
    throw new Error('Browser T2 policy upstream digest differs from complete payload');
  if (!isDiagnostic(browserT2))
    throw new Error('Browser T2 policy upstream diagnostic markers differ');
  // Proof: independently removing each predicate lost BROWSER-T2-POLICY-PREVIEW-009's named selection/instant negatives.
  if (
    browserT2.revision !== revision ||
    browserT2.capability !== capability ||
    browserT2.evaluatedAt !== evaluatedAt
  )
    throw new Error('Browser T2 policy upstream selection or instant differs');
  const expected = {
    revision: browserT2.revision,
    candidate: browserT2.candidate,
    capability: browserT2.capability,
    evaluatedAt: browserT2.evaluatedAt,
    rulePolicyDigest: browserT2.policyDigest,
    browserT2ObservationDigest: browserT2.observationDigest,
  };
  // Proof: bypassing binding equality accepted all six BROWSER-T2-POLICY-PREVIEW-004 pin substitutions.
  if (hashCanonical(binding) !== hashCanonical(expected))
    throw new Error('Browser T2 proposed policy binding differs from actual observation');
}

function projectFindings(
  browserT2: BrowserT2,
  disposition: ProposedPolicy['disposition'],
): CitationFinding[] {
  const originals = new Map<string, BrowserT2['ledger']['browser']['report']['cases'][number]>();
  for (const browserCase of browserT2.ledger.browser.report.cases) {
    // Proof: removal accepted BROWSER-T2-POLICY-PREVIEW-009's duplicate original report case.
    if (originals.has(browserCase.caseId))
      throw new Error('Browser T2 policy duplicate original case');
    originals.set(browserCase.caseId, browserCase);
  }
  const citations = new Map<string, BrowserT2['citationFindings'][number]>();
  // Proof: removal accepted BROWSER-T2-POLICY-PREVIEW-009's substituted original findings.
  if (
    hashCanonical(browserT2.citationFindings) !==
    hashCanonical(browserT2.ledger.browser.citationFindings)
  )
    throw new Error('Browser T2 policy original citation findings differ');
  for (const finding of browserT2.citationFindings) {
    // Proof: removal accepted BROWSER-T2-POLICY-PREVIEW-009's duplicate finding.
    if (citations.has(finding.caseId))
      throw new Error('Browser T2 policy duplicate citation finding');
    citations.set(finding.caseId, finding);
  }
  const cases = new Set<string>();
  const findings: CitationFinding[] = [];
  for (const row of browserT2.cases) {
    // Proof: removal lost BROWSER-T2-POLICY-PREVIEW-009's named duplicate-case refusal.
    if (cases.has(row.case.caseId)) throw new Error('Browser T2 policy duplicate case');
    cases.add(row.case.caseId);
    const original = originals.get(row.case.caseId);
    // Proof: removal lost BROWSER-T2-POLICY-PREVIEW-009's named foreign/altered-case refusals.
    if (original === undefined || hashCanonical(original) !== hashCanonical(row.case))
      throw new Error('Browser T2 policy case differs from original report');
    const finding = citations.get(row.case.caseId);
    switch (row.citation.kind) {
      case 'cited': {
        // Proof: removal lost BROWSER-T2-POLICY-PREVIEW-009's named cited-finding conflict refusal.
        if (finding !== undefined) throw new Error('Browser T2 policy cited case has a finding');
        const scenarioId = row.citation.scenarioId;
        // Proof: without this check BROWSER-T2-POLICY-PREVIEW-009's wrong/missing/numeric cited-ID negatives each received exit zero.
        if (
          !browserT2.ledger.browser.citations.some(
            (group) =>
              group.id === scenarioId &&
              group.cases.some((browserCase) => browserCase.caseId === row.case.caseId),
          )
        )
          throw new Error('Browser T2 policy cited scenario differs from original citation group');
        break;
      }
      case 'missing':
      case 'malformed':
      case 'inactive': {
        // Proof: individual kind/title/status removals accepted BROWSER-T2-POLICY-PREVIEW-009's resealed mismatches.
        if (
          finding?.kind !== row.citation.kind ||
          finding.title !== row.case.titlePath.at(-1) ||
          finding.status !== row.case.status
        )
          throw new Error('Browser T2 policy citation finding differs from case');
        citations.delete(row.case.caseId);
        // Proof: forced debt/refusal or raw prefix matching failed BROWSER-T2-POLICY-PREVIEW-006's mode and near-prefix assertions.
        const effect =
          disposition.mode === 'observe'
            ? 'debt'
            : disposition.mode === 'enforce' || isAdopted(disposition, row.case.file)
              ? 'refusal'
              : 'debt';
        findings.push({
          caseId: row.case.caseId,
          path: row.case.file,
          kind: row.citation.kind,
          effect,
        });
        break;
      }
      // Proof: replacing this throw with break lost BROWSER-T2-POLICY-PREVIEW-009's named impossible-variant refusal.
      default:
        throw new Error('Browser T2 policy impossible citation variant');
    }
  }
  // Proof: removal accepted BROWSER-T2-POLICY-PREVIEW-009's omitted case.
  if (cases.size !== originals.size || citations.size !== 0)
    throw new Error('Browser T2 policy citation partition is incomplete or foreign');
  // Proof: reversing output failed BROWSER-T2-POLICY-PREVIEW-006's independently ordered complete findings.
  return findings.sort((left, right) => compareCanonicalText(left.caseId, right.caseId));
}

/**
 * Previews caller-proposed citation effects over the real complete Browser T2 diagnostic.
 * Captures the external proposal once; its digest and location confer no authentication.
 * Retains every outcome and ledger debt without registering T2 or granting admission.
 * @throws when proposal inputs, exact observation pins or the complete citation partition differ.
 */
export function inspectBrowserT2Policy(
  repository: string,
  revision: string,
  policyPath: string,
  capability: string,
  ledgerAuthorityPath: string,
  proposalPath: string,
  evaluatedAt: Date,
): BrowserT2PolicyObservation {
  const { proposedPolicy, proposedPolicyDigest } = readProposal(repository, proposalPath);
  const evaluatedInstant = readEvaluationInstant(evaluatedAt.toISOString()).toISOString();
  // Proof: caching this dependency accepted BROWSER-T2-POLICY-PREVIEW-001's deleted real publication after proposal creation.
  const browserT2 = inspectBrowserT2(
    repository,
    revision,
    policyPath,
    capability,
    ledgerAuthorityPath,
    evaluatedAt,
  );
  assertObservation(browserT2, revision, capability, evaluatedInstant, proposedPolicy.binding);
  const findings = projectFindings(browserT2, proposedPolicy.disposition);
  // Proof: dropping upstream debt/proposal digest or inventing authority failed BROWSER-T2-POLICY-PREVIEW-012's complete payload assertions.
  const observation = {
    schemaVersion: 1 as const,
    kind: 'browser-t2-policy-preview' as const,
    revision,
    candidate: browserT2.candidate,
    capability,
    evaluatedAt: evaluatedInstant,
    scope: browserT2.scope,
    policyId: browserT2.policyId,
    policyDigest: browserT2.policyDigest,
    proposedPolicy,
    proposedPolicyDigest,
    browserT2,
    browserT2ObservationDigest: browserT2.observationDigest,
    findings,
    proposedDisposition: {
      kind: findings.some((finding) => finding.effect === 'refusal')
        ? ('citation-refusals' as const)
        : ('no-citation-refusals' as const),
    },
    authentication: { kind: 'absent' as const },
    certifies: false as const,
  };
  // Proof: hashing only kind failed BROWSER-T2-POLICY-PREVIEW-012's independent full-payload digest assertion.
  return { ...observation, observationDigest: hashCanonical(observation) };
}
