import { parseOrThrow, type } from '@shared/validation';

import { RelativePath } from '../contracts/records';
import { isSelected } from '../inventory/classify-entries';
import type { CandidateEntry } from '../inventory/read-candidate';
import { resolveCandidateRoot } from '../inventory/read-candidate';
import { readExternalArtifact } from '../policy/trust';
import { digestCandidate, executeCheckCandidate } from '../rules/check';
import { registeredRules } from '../rules/registry';
import type { Finding, RuleMode } from '../rules/rule';
import { ruleMode, type RulePolicy } from '../rules/rule-policy';
import { isMeasuredSource } from '../rules/size-ratchet';
import { hashBytes, hashCanonical } from './content-manifest';
import { identifyCoverageRuntime } from './coverage-runtime';

const GitIdentity = type(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/);
const Sha256 = type(/^[0-9a-f]{64}$/);
const Tuple = type({
  path: RelativePath,
  mode: "'100644'|'100755'|'120000'|'160000'",
  blob: GitIdentity,
}).onUndeclaredKey('reject');
const Exclusion = type({
  subject: Tuple,
  ruleId: 'string>=1',
  code: 'string>=1',
  reason: 'string>=1',
  reviewer: 'string>=1',
  reference: 'string>=1',
}).onUndeclaredKey('reject');
const Review = type({
  schemaVersion: '1',
  candidate: type({ revision: GitIdentity, tree: GitIdentity, digest: Sha256 }).onUndeclaredKey(
    'reject',
  ),
  inventory: Tuple.array(),
  selectors: type({ kind: "'path'|'prefix'", value: RelativePath })
    .onUndeclaredKey('reject')
    .array(),
  subjects: Tuple.array(),
  policyDigest: Sha256,
  adoptedSetDigest: Sha256,
  registryDigest: Sha256,
  runtimeDigest: Sha256,
  exclusions: Exclusion.array(),
}).onUndeclaredKey('reject');

type CoverageReview = typeof Review.infer;
type CheckExecution = ReturnType<typeof executeCheckCandidate>;
type CoverageScope =
  | 'inventory-classification'
  | 'index-membership'
  | 'index-direct-entry-count'
  | 'typescript-line-count'
  | 'unsupported';

interface CoverageRow {
  subject: CandidateEntry;
  ruleId: string;
  ruleMode: RuleMode;
  applicability: 'applicable' | 'inapplicable' | 'unknown';
  evaluation: 'evaluated' | 'unevaluated' | 'not-run';
  scope: CoverageScope;
  reason: string;
  indexPaths: string[];
  attribution:
    { kind: 'exact-path'; findings: Finding[] } | { kind: 'unavailable'; reason: string };
  exclusion?: CoverageReview['exclusions'][number];
}

function readReview(candidateRoot: string, path: string) {
  // Proof: production missing/unreadable/internal review tests inject ENOENT, EACCES and containment faults; all refuse before stdout.
  const artifact = readExternalArtifact(candidateRoot, path, 'coverage review');
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes)) as unknown;
  } catch (cause) {
    // Proof: malformed review test injects `{` and observes this named production refusal.
    throw new Error(`malformed coverage review JSON or UTF-8: ${artifact.path}`, { cause });
  }
  // Proof: bypassing Review decoding accepted a reviewer-supplied evaluation claim; exclusion evaluation-claim failed.
  return {
    review: parseOrThrow(Review, input),
    path: artifact.path,
    digest: hashBytes(artifact.bytes),
  };
}

/** Registry contracts, modes and supported exclusions bound by each coverage review. */
function describeRules(policy: RulePolicy) {
  return registeredRules().map(
    ({ id, family, statement, source, inputs, coverageExclusionCodes }) => ({
      id,
      family,
      statement,
      source,
      inputs,
      ruleMode: ruleMode(policy, id),
      exclusionCodes: coverageExclusionCodes ?? [],
    }),
  );
}

function assertIdentity(label: string, expected: string, actual: string): void {
  // Proof: bypassing comparison failed all seven mismatched candidate/policy/adopted-set/registry/runtime CLI tests.
  if (expected !== actual) throw new Error(`coverage ${label} mismatch: ${expected} != ${actual}`);
}

function sameTuple(left: CandidateEntry, right: CandidateEntry): boolean {
  return left.path === right.path && left.mode === right.mode && left.blob === right.blob;
}

function validateSubjects(review: CoverageReview, entries: readonly CandidateEntry[]): void {
  // Proof: removing this guard lost the empty-subject production refusal; empty subjects failed.
  if (review.subjects.length === 0) throw new Error('coverage subjects must not be empty');
  const paths = new Set<string>();
  for (const selected of review.subjects) {
    // Proof: removal lost the repeated-subject boundary; repeated subject failed on the later selector comparison.
    if (paths.has(selected.path)) throw new Error(`coverage subject repeated: ${selected.path}`);
    paths.add(selected.path);
    // Proof: removal lost exact membership diagnostics; both absent subject and the unique-path changed-object subject failed (refreshed 2026-10-16).
    if (!entries.some((entry) => sameTuple(entry, selected))) {
      throw new Error(`coverage subject is not an exact committed tuple: ${selected.path}`);
    }
  }
  for (const selector of review.selectors) {
    // Proof: removal accepted an unmatched prefix with a complete unchanged tuple set; unresolved scope failed.
    if (!entries.some((entry) => isSelected(entry.path, selector))) {
      throw new Error(`coverage selector resolves no committed tuple: ${selector.value}`);
    }
  }
  const selected = entries.filter((entry) =>
    review.selectors.some((selector) => isSelected(entry.path, selector)),
  );
  // Proof: removing equality emitted a report after either selected YAML or executable omission with full inventory; both CLI negatives failed.
  if (hashCanonical(review.subjects) !== hashCanonical(selected)) {
    throw new Error('coverage selected subjects differ from reviewed selector expansion');
  }
}

function measuredSubject(subject: CandidateEntry, execution: CheckExecution): boolean {
  return execution.sizeCeilings.some(
    (ceilings) =>
      (subject.mode === '100644' || subject.mode === '100755') &&
      isMeasuredSource(subject.path) &&
      ceilings.roots.some((root) => subject.path === root || subject.path.startsWith(`${root}/`)),
  );
}

function associatedIndexes(subject: CandidateEntry, execution: CheckExecution): string[] {
  return execution.indexes.ok
    ? execution.indexes.report.indexes
        // Proof: associating every index failed the nested-index matrix assertion for src/entry.ts.
        .filter((index) => index.indexPath === subject.path || index.members.includes(subject.path))
        .map((index) => index.indexPath)
    : [];
}

function isIndex(subject: CandidateEntry, execution: CheckExecution): boolean {
  return (
    execution.indexes.ok &&
    execution.indexes.report.indexes.some((index) => index.indexPath === subject.path)
  );
}

function exclusionKey(path: string, ruleId: string): string {
  return JSON.stringify([path, ruleId]);
}

function validateExclusions(review: CoverageReview, execution: CheckExecution) {
  const exclusions = new Map<string, CoverageReview['exclusions'][number]>();
  for (const exclusion of review.exclusions) {
    const key = exclusionKey(exclusion.subject.path, exclusion.ruleId);
    // Proof: removal silently overwrote the duplicate; exclusion duplicate emitted JSON and failed.
    if (exclusions.has(key)) throw new Error(`coverage exclusion repeated: ${key}`);
    // Proof: removal accepted an exclusion with a changed executable Git mode; exclusion changed-tuple failed.
    if (!review.subjects.some((subject) => sameTuple(subject, exclusion.subject))) {
      throw new Error(`coverage exclusion subject is not selected exactly: ${key}`);
    }
    const rule = registeredRules().find((registered) => registered.id === exclusion.ruleId);
    // Proof: removal lost the registry-code boundary; unsupported-rule and unsupported-code negatives failed.
    if (!rule?.coverageExclusionCodes?.includes(exclusion.code)) {
      throw new Error(
        `coverage exclusion code is unsupported by registered rule: ${key}/${exclusion.code}`,
      );
    }
    const holds =
      (exclusion.ruleId === 'F7' &&
        exclusion.code === 'outside-size-input' &&
        !measuredSubject(exclusion.subject, execution)) ||
      (exclusion.ruleId === 'MOD-DIRECT-ENTRIES' &&
        exclusion.code === 'not-index-declaration' &&
        execution.indexes.ok &&
        !isIndex(exclusion.subject, execution));
    // Proof: removal let review exclude measured src/entry.ts from F7; exclusion false-predicate failed.
    if (!holds) throw new Error(`coverage exclusion predicate is false: ${key}`);
    exclusions.set(key, exclusion);
  }
  return exclusions;
}

function judgeSubject(
  subject: CandidateEntry,
  ruleId: string,
  execution: CheckExecution,
): CoverageRow {
  const indexPaths = associatedIndexes(subject, execution);
  let scope: CoverageScope = 'unsupported';
  if (ruleId === 'INV-CLASSIFY') scope = 'inventory-classification';
  if (ruleId === 'MOD-INDEX' && indexPaths.length > 0) scope = 'index-membership';
  if (ruleId === 'MOD-DIRECT-ENTRIES' && isIndex(subject, execution))
    scope = 'index-direct-entry-count';
  if (ruleId === 'F7' && measuredSubject(subject, execution)) scope = 'typescript-line-count';
  const unevaluated = execution.verdict.unevaluated.find((rule) => rule.ruleId === ruleId);
  const supported = scope !== 'unsupported';
  // Proof: dropping supported falsely evaluated MOD-LAYOUT; dropping the engine outcome falsely evaluated failed YAML classification. Both production tests failed.
  const evaluated = supported && unevaluated === undefined;
  return {
    subject,
    ruleId,
    ruleMode: ruleMode(execution.loadedPolicy.policy, ruleId),
    applicability: supported ? 'applicable' : 'unknown',
    evaluation: evaluated ? 'evaluated' : 'unevaluated',
    scope,
    reason: !supported
      ? 'No concrete subject evaluation footprint; no semantic coverage is claimed.'
      : unevaluated === undefined
        ? `Engine judged ${scope}; this is not infrastructure semantic evaluation.`
        : unevaluated.reason,
    // Proof: the nested declaration production test failed with an extra parent index before this split.
    indexPaths:
      scope === 'index-membership'
        ? indexPaths
        : scope === 'index-direct-entry-count'
          ? [subject.path]
          : [],
    // Only these adapters produce exact path findings. All whole-rule observations remain in verdict.
    // Proof: replacing unavailable attribution with exact-path [] failed the structural/unsupported matrix assertions.
    attribution:
      evaluated && (ruleId === 'F7' || ruleId === 'MOD-DIRECT-ENTRIES')
        ? {
            kind: 'exact-path',
            findings: execution.verdict.findings.filter(
              (finding) => finding.ruleId === ruleId && finding.path === subject.path,
            ),
          }
        : {
            kind: 'unavailable',
            reason:
              'This adapter supplies no exact subject finding attribution; inspect the complete verdict.',
          },
  };
}

/**
 * Inspects an exact committed candidate using an external attributed coverage review.
 * Structural classification and wiki judgments never imply infrastructure semantics.
 * Emits no admission, native execution or live health claim; the embedded check schema is unchanged.
 * The CLI exits 1 for unresolved cells. Ten unadapted registry members make every current valid
 * nonempty matrix unresolved. Before an all-adapted matrix can return 0, a later change must add
 * and prove an exit guard for refusal-effect findings; those remain visible in the embedded verdict.
 * @throws when authority, complete inventory, selected subjects or any joined identity is invalid.
 */
export function inspectEvaluationCoverage(
  repository: string,
  revision: string,
  policyPath: string,
  reviewPath: string,
  runtimeEntryPath: string,
) {
  // Proof: removal accepted an abbreviated SHA; operand and selector drift failed on unexpected JSON.
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(revision)) {
    throw new Error(
      'usage: twilight-burokrat inspect-evaluation-coverage requires a full committed SHA',
    );
  }
  const root = resolveCandidateRoot(repository);
  const authority = readReview(root, reviewPath);
  const execution = executeCheckCandidate({
    repository: root,
    candidate: { kind: 'committed', revision },
    rulePolicyPath: policyPath,
  });
  const { candidate, loadedPolicy, verdict } = execution;
  // Boundary: the engine request above is fixed to committed selection; no staged/working request enters this command.
  const selection = candidate.selection as Extract<
    typeof candidate.selection,
    { kind: 'committed' }
  >;
  // Proof: removing this comparison accepted a real annotated-tag object SHA with the correct reviewed target; its production CLI negative failed.
  assertIdentity('input revision', revision, selection.revision);
  const adoptedSet = loadedPolicy.policy.adoptedSet;
  // Proof: removal lost the explicit-adopted-set refusal; its production negative failed.
  if (adoptedSet === undefined) throw new Error('coverage requires an explicit adopted set');
  const rules = describeRules(loadedPolicy.policy);
  const runtime = identifyCoverageRuntime(runtimeEntryPath);
  const review = authority.review;
  assertIdentity('candidate revision', review.candidate.revision, selection.revision);
  assertIdentity('candidate tree', review.candidate.tree, selection.tree);
  assertIdentity('candidate digest', review.candidate.digest, digestCandidate(candidate));
  assertIdentity('policyDigest', review.policyDigest, loadedPolicy.digest);
  assertIdentity('adoptedSetDigest', review.adoptedSetDigest, hashCanonical(adoptedSet));
  assertIdentity('registryDigest', review.registryDigest, hashCanonical(rules));
  assertIdentity('runtimeDigest', review.runtimeDigest, runtime.digest);
  // Proof: removal accepted omitted YAML/executable and changed mode/blob tuples; all four production negatives failed.
  if (hashCanonical(review.inventory) !== hashCanonical(candidate.entries)) {
    throw new Error('coverage inventory differs from complete committed path/mode/object tuples');
  }
  validateSubjects(review, candidate.entries);
  const exclusions = validateExclusions(review, execution);
  const rows = review.subjects.flatMap((subject) =>
    rules.map((rule) => {
      const row = judgeSubject(subject, rule.id, execution);
      const exclusion = exclusions.get(exclusionKey(subject.path, rule.id));
      return exclusion === undefined
        ? row
        : {
            ...row,
            applicability: 'inapplicable' as const,
            evaluation: 'not-run' as const,
            reason: exclusion.reason,
            exclusion,
          };
    }),
  );
  return {
    schemaVersion: 1 as const,
    kind: 'evaluation-coverage' as const,
    selection,
    candidate: verdict.candidate,
    policy: {
      id: loadedPolicy.policy.policyId,
      digest: loadedPolicy.digest,
      adoptedSetDigest: hashCanonical(adoptedSet),
    },
    registry: { digest: hashCanonical(rules), rules },
    runtime,
    review: { path: authority.path, digest: authority.digest },
    inventory: candidate.entries,
    selectors: review.selectors,
    subjects: review.subjects,
    rows,
    verdict,
    // Proof: setting allowed true failed the complete inventory/matrix production assertion.
    allowed: false as const,
    // Proof: setting certifies true failed the complete inventory/matrix production assertion.
    certifies: false as const,
  };
}
