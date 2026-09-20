import { hashCanonical } from '../evidence/content-manifest';
import { checkIndexes } from '../indexes/check-indexes';
import {
  type CandidateRequest,
  type CandidateSnapshot,
  readCandidate,
  resolveCandidateRoot,
} from '../inventory/read-candidate';
import { findRule, registeredIds, registeredRules } from './registry';
import {
  type Finding,
  type IndexReport,
  reasonOf,
  type RegisteredRule,
  type Rule,
  type RuleMode,
  type RuleOutcome,
  toFinding,
  type UnevaluatedRule,
  type Verdict,
} from './rule';
import { assertPolicyInputs, loadRulePolicy, ruleMode } from './rule-policy';

function selectRule(ruleId: string): RegisteredRule {
  const rule = findRule(ruleId);
  // Proof: on 2026-09-20, returning the first registered rule here made the production CLI test
  // observe exit 0 instead of the required exit 1 for `NO-SUCH-RULE`.
  if (rule === undefined) {
    throw new Error(`unknown rule: ${ruleId} (registered: ${registeredIds()})`);
  }
  return rule;
}

/** The rule record `explain` prints. Part 2 adds the stated mode. */
export interface RuleExplanation extends Rule {
  readonly policyId?: string;
  readonly mode?: RuleMode;
}

/**
 * The registry record for one rule. The design's "last negative proof" field waits for the proof
 * register of slice B4; this record carries no placeholder for it.
 * @throws Error when the rule is not registered.
 */
export function explainRule(
  ruleId: string,
  policySelection?: { candidateRepository: string; rulePolicyPath: string },
): RuleExplanation {
  const { id, family, statement, source, inputs } = selectRule(ruleId);
  const rule: Rule = { id, family, statement, source, inputs };
  if (policySelection === undefined) return rule;
  const policy = loadRulePolicy(
    resolveCandidateRoot(policySelection.candidateRepository),
    policySelection.rulePolicyPath,
  );
  // Proof: on 2026-09-20, dropping `mode` made policy-aware explain omit `mode: "enforce"`.
  return { ...rule, policyId: policy.policyId, mode: ruleMode(policy, id) };
}

/** `explain <rule-id>` or `explain <rule-id> <repository> <rule-policy-json>` */
export function writeExplainCommand(argv: readonly string[]): void {
  const [, ruleId, repository, rulePolicyPath] = argv;
  process.stdout.write(
    `${JSON.stringify(
      argv.length === 4
        ? explainRule(ruleId, { candidateRepository: repository, rulePolicyPath })
        : explainRule(ruleId),
    )}\n`,
  );
}

export interface CheckRequest {
  repository: string;
  candidate: CandidateRequest;
  rulePolicyPath: string;
  /** When present, only this rule runs. The verdict still says which rules ran. */
  ruleId?: string;
}

function readIndexOutcome(
  repository: string,
  candidate: CandidateSnapshot,
): RuleOutcome<IndexReport> {
  try {
    return { ok: true, report: checkIndexes(repository, candidate) };
  } catch (cause) {
    // Modeled recovery: `checkIndexes` refuses by throwing, and a throw is a failure to evaluate.
    return { ok: false, reason: reasonOf(cause) };
  }
}

/** Runs every selected rule over one candidate and returns one verdict. Never certifies. */
export function checkCandidate(request: CheckRequest): Verdict {
  const candidateRoot = resolveCandidateRoot(request.repository);
  // Proof: on 2026-09-20, passing the caller's interior directory here made the containment test
  // receive empty stderr instead of the required inside-candidate refusal.
  const policy = loadRulePolicy(candidateRoot, request.rulePolicyPath);
  // Proof: on 2026-09-20, selecting no rules by default made the all-rules adapter test receive
  // `ruleIds: []` while the verdict still said `allowed: true`.
  const selected: readonly RegisteredRule[] =
    request.ruleId === undefined ? registeredRules() : [selectRule(request.ruleId)];
  for (const rule of selected) assertPolicyInputs(policy, rule.id);
  const candidate = readCandidate(candidateRoot, request.candidate);
  const context = {
    repository: candidateRoot,
    candidate,
    ...(policy.classificationPolicy === undefined
      ? {}
      : { classificationPolicy: policy.classificationPolicy }),
    ...(policy.relationshipRequest === undefined
      ? {}
      : { relationshipRequest: policy.relationshipRequest }),
    indexes: readIndexOutcome(candidateRoot, candidate),
  };
  const findings: Finding[] = [];
  const unevaluated: UnevaluatedRule[] = [];
  for (const rule of selected) {
    const mode = ruleMode(policy, rule.id);
    const evaluation = rule.evaluate(context);
    if (evaluation.kind === 'not-evaluated') {
      unevaluated.push({ ruleId: rule.id, reason: evaluation.reason });
      continue;
    }
    for (const observation of evaluation.observations) {
      findings.push(toFinding(rule.id, mode, observation));
    }
  }
  return {
    schemaVersion: 1,
    // The identity `lintTrustedCandidate` records (apps/wiki/cli/src/policy/trust.ts:1480).
    candidate: hashCanonical({
      selection: candidate.selection,
      entries: candidate.entries,
      untracked: candidate.untracked,
    }),
    policy: policy.policyId,
    // A rule that could not be evaluated is not an allowed candidate, in any mode.
    // Proof: on 2026-09-20, dropping the unevaluated guard made a failed prerequisite exit 0;
    // the adapter test expected exit 1 and received 0.
    allowed: unevaluated.length === 0 && !findings.some((finding) => finding.effect === 'refusal'),
    ruleIds: selected.map((rule) => rule.id),
    findings,
    unevaluated,
    certifies: false,
  };
}

function candidateRequest(kind: string, revision: string): CandidateRequest {
  // Proof: on 2026-09-20, treating `bogus` as committed replaced this usage refusal with the
  // unrelated missing-classification-policy diagnostic.
  if (kind !== 'committed' && kind !== 'staged' && kind !== 'working') {
    throw new Error(
      'usage: twilight-bureaucrat check <committed|staged|working> <repository> <revision-or-base> <rule-policy-json> [--rule <rule-id>]',
    );
  }
  return kind === 'committed' ? { kind, revision } : { kind, base: revision };
}

/** `check <committed|staged|working> <repository> <revision-or-base> <policy> [--rule <id>]` */
export function writeCheckCommand(argv: readonly string[]): void {
  const [, kind, repository, revision, rulePolicyPath, flag, ruleId] = argv;
  // Proof: on 2026-09-20, deleting this guard made `--only MOD-INDEX` exit 0 with empty stderr.
  if (argv.length === 7 && flag !== '--rule') {
    throw new Error(`the only check flag is --rule <rule-id>: received ${flag}`);
  }
  const verdict = checkCandidate({
    repository,
    candidate: candidateRequest(kind, revision),
    rulePolicyPath,
    ...(argv.length === 7 ? { ruleId } : {}),
  });
  process.stdout.write(`${JSON.stringify(verdict)}\n`);
  // A refused or unevaluated verdict must fail the caller's shell while the record still reaches
  // stdout, so this route sets the exit code instead of throwing.
  // Proof: on 2026-09-20, deleting this assignment made an unindexed candidate return exit 0
  // while its verdict still said `allowed: false`.
  if (!verdict.allowed) process.exitCode = 1;
}
