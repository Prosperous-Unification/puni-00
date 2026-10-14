import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { expect, test } from 'bun:test';

const SOURCE_ROOT = import.meta.dir;
const RUNTIME_SURFACE = [
  'CandidateReadError',
  'assertAdmissionPacket',
  'assertAuthorityClaimPath',
  'assertAuthorityConflictGroup',
  'assertAuthorityPathAccess',
  'assertAuthoritySessionId',
  'assertAuthorityWorktreePath',
  'assertCheckedIntegrationCandidate',
  'assertNarrative',
  'assertUnambiguousPath',
  'canonicalPaths',
  'canonicalRepository',
  'certifyIntegrationCandidate',
  'compareCanonicalText',
  'decodeAdmissionPacket',
  'decodeAdmissionPacketBody',
  'decodeIntegrationPolicy',
  'hashBytes',
  'hashCanonical',
  'packetAuthorityClaims',
  'packetBody',
  'packetBodyBytes',
  'readBaseEntries',
  'readCandidate',
  'resolveCandidateRoot',
  'serializeCanonical',
  'uniqueSorted',
  'validatePacketAgainstBase',
  'withPacketIdentity',
  // What Dash's activation controller and review invoker reach (WBS a81d93a0).
  'AuditFinding',
  'ClassificationPolicy',
  'ColdAcknowledgement',
  'ColdAttempt',
  'ColdHarnessOutput',
  'ContentClass',
  'EvidenceRecordKind',
  'InformedAttempt',
  'InformedHarnessOutput',
  'InvocationJournalRecord',
  'InvocationRegistration',
  'InvocationTerminal',
  'ProcessObservation',
  'RelationshipDeclaration',
  'RelationshipRequest',
  'RelativePath',
  'ReviewEvidence',
  'ReviewInvocationRequest',
  'ReviewSubject',
  'classifyEntries',
  'coldHarnessRequest',
  'decodeColdHarnessOutput',
  'decodeInformedHarnessOutput',
  'decodeInvocationRegistration',
  'decodeReviewEvidence',
  'deriveReviewEvidence',
  'extractRelationships',
  'extractDeclaredRelationships',
  'extractDeclaredRelationshipsFromSource',
  'identifyDeclarationExtractor',
  'freezeExhaustivePlan',
  'freezeExhaustivePlanFromSource',
  'informedHarnessRequest',
  'parseCommittedTreeEntries',
  'readInvocationJournal',
  'reconcileColdAcknowledgement',
  'reconcileJournalEntry',
  'reconcileReviewedInformed',
  'verifyExhaustivePlanFromSource',
  // What Dash's activation check runner writes and its tests judge (WBS ba5d3298).
  'CheckRunLedger',
  'CheckRunRefusal',
  'checkRunDigest',
  'checkRunLayout',
  'planCandidateCheckRuns',
  'readCheckRuns',
].sort();

/**
 * Judge modules that parse with an in-memory SQLite database. Each may import `bun:sqlite` only
 * while every `new Database(` it contains opens `':memory:'`; any other module may not import it.
 */
const IN_MEMORY_SQLITE = new Set(['relationships/declarations.ts']);

/** Store, runtime-half, Dash, clock and network reads the judge must never reach. */
const FORBIDDEN = [
  { pattern: /from '[^']*authority-store'/, reason: 'imports the authority store' },
  { pattern: /from '[^']*admission-runtime\//, reason: 'imports the runtime half' },
  { pattern: /twilight-dash/, reason: 'names Twilight Dash' },
  // `new Date(epochMs)` converts a supplied instant; only a zero-argument `Date` reads the clock.
  {
    pattern: /\bDate\.now\b|\bDate\(\s*\)|\bperformance\.now\b|\bprocess\.hrtime\b/,
    reason: 'reads a clock',
  },
  {
    pattern: /from 'node:(?:net|http|https|http2|dgram|tls|dns)'|\bfetch\(|\bWebSocket\b/,
    reason: 'reaches the network',
  },
];

/** Drops whole comment lines only, so a glob literal such as `'**' + '/*'` never hides code. */
function stripComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\/\*\*?|\*)/.test(line))
    .join('\n');
}

/** Every workspace-relative module the facade reaches through relative imports. */
function reachableModules(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const path = pending.pop();
    if (path === undefined || seen.has(path)) continue;
    seen.add(path);
    const source = stripComments(readFileSync(path, 'utf8'));
    for (const match of source.matchAll(/(?:from|import\()\s*'(\.{1,2}\/[^']+)'/g)) {
      const module = resolve(dirname(path), match[1]);
      pending.push(existsSync(`${module}.ts`) ? `${module}.ts` : join(module, 'index.ts'));
    }
  }
  return [...seen].sort();
}

test('exports exactly the judge surface and nothing that takes a store', async () => {
  // Proof: adding `export { openAuthorityStore } from './admission-runtime/authority-store'` to
  // judge-facade.ts failed the surface equality with `+ "openAuthorityStore"`; appending
  // `Date.now()` to packet-judgment.ts failed the scan with `packet-judgment.ts reads a clock`;
  // importing `node:https` into packet-codec.ts failed it with `packet-codec.ts reaches the
  // network` (2026-10-11). Proof (2026-10-12): exporting `ProcessReviewInvoker` from
  // `./review/invoker` failed the surface equality with `+ "ProcessReviewInvoker"`; appending
  // `Date.now()` to review/invocation-journal.ts failed the scan with
  // `review/invocation-journal.ts reads a clock`; importing `bun:sqlite` into
  // review/invocation-journal.ts failed it with `imports bun:sqlite`, and opening
  // `new Database(path)` in relationships/declarations.ts failed it with `opens a SQLite file`.
  expect(Object.keys(await import('./judge-facade')).sort()).toEqual(RUNTIME_SURFACE);
  const modules = reachableModules(join(SOURCE_ROOT, 'judge-facade.ts'));
  expect(modules.length).toBeGreaterThan(5);
  // The check-run judge reaches only the check derivation: `relocation-activation.ts` pulls
  // `trust.ts` and its mdast readers into the facade's input closure, which Dash's
  // `packaging/reproducible.test.ts` copies into two roots (tree shaking keeps them out of the
  // launcher bytes, not out of that closure). Proof (2026-10-12): importing check-runs.ts's
  // derivation from `./relocation-activation` again failed here with `Expected to not contain:
  // "policy/trust.ts"`; restoring `./check-plan` passed.
  const reached = modules.map((path) => relative(SOURCE_ROOT, path));
  expect(reached).not.toContain('policy/trust.ts');
  expect(reached).not.toContain('policy/relocation-activation.ts');
  const violations = modules.flatMap((path) => {
    const source = stripComments(readFileSync(path, 'utf8'));
    const module = relative(SOURCE_ROOT, path);
    const reasons = FORBIDDEN.filter(({ pattern }) => pattern.test(source)).map(
      ({ reason }) => reason,
    );
    if (source.includes("from 'bun:sqlite'")) {
      if (!IN_MEMORY_SQLITE.has(module)) reasons.push('imports bun:sqlite');
      else if (/\bDatabase\.open\b|new Database\((?!':memory:')/.test(source)) {
        reasons.push('opens a SQLite file');
      }
    }
    return reasons.map((reason) => `${module} ${reason}`);
  });
  expect(violations).toEqual([]);
});
