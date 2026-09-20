import type { ClassificationPolicy, RelationshipRequest } from '../contracts/records';
import type { checkIndexes } from '../indexes/check-indexes';
import type { CandidateSnapshot } from '../inventory/read-candidate';

/**
 * Policy disposition for one rule. `observe` reports every finding as debt, `enforce` refuses every
 * finding, and `ratchet` refuses a finding inside the consumer's adopted set and reports the rest as
 * debt. `ratchet` needs an adopted set; a policy that ratchets without one is refused.
 */
export type RuleMode = 'observe' | 'ratchet' | 'enforce';

/** The record `explain` prints. It carries no behaviour, so any caller can serialize it. */
export interface Rule {
  /** Stable, short and quoted in messages: `MOD-INDEX`, `INV-CLASSIFY`. */
  readonly id: string;
  readonly family: string;
  /** One sentence, the same one its delta requirement states. */
  readonly statement: string;
  /** Where the rule is specified. */
  readonly source: string;
  /**
   * Selectors the rule reads. A name beginning `policy.` is a rule policy field the rule cannot run
   * without; {@link requiredPolicyInputs} selects exactly those.
   */
  readonly inputs: readonly string[];
}

/** What a rule saw, before policy decides whether it refuses the candidate. */
export interface RuleObservation {
  /** A candidate-relative path, or `.` when the observation is about the candidate as a whole. */
  readonly path: string;
  readonly subject?: string;
  readonly message: string;
}

export interface Finding {
  readonly ruleId: string;
  readonly path: string;
  readonly subject?: string;
  readonly message: string;
  /** `debt` in observe mode, and in ratchet mode outside the adopted set; `refusal` otherwise. */
  readonly effect: 'debt' | 'refusal';
}

/** A rule that could not judge. No mode downgrades it; see {@link Verdict.allowed}. */
export interface UnevaluatedRule {
  readonly ruleId: string;
  readonly reason: string;
}

export interface Verdict {
  readonly schemaVersion: 1;
  /** `hashCanonical` over the candidate snapshot; the identity the lint engine records. */
  readonly candidate: string;
  readonly policy: string;
  /** False when any finding refuses, and false whenever `unevaluated` is non-empty. */
  readonly allowed: boolean;
  readonly ruleIds: readonly string[];
  readonly findings: readonly Finding[];
  readonly unevaluated: readonly UnevaluatedRule[];
  /**
   * Always false in slice B0: a verdict binds no evidence, no authority and no validator identity,
   * so it cannot certify. Only `lint-ci` certifies.
   */
  readonly certifies: false;
}

export type RuleEvaluation =
  | { readonly kind: 'observed'; readonly observations: readonly RuleObservation[] }
  | { readonly kind: 'not-evaluated'; readonly reason: string };

export type IndexReport = ReturnType<typeof checkIndexes>;

export type RuleOutcome<Report> =
  { readonly ok: true; readonly report: Report } | { readonly ok: false; readonly reason: string };

export interface RuleContext {
  /** The resolved Git worktree root, never a caller's interior directory. */
  readonly repository: string;
  readonly candidate: CandidateSnapshot;
  readonly classificationPolicy?: ClassificationPolicy;
  readonly relationshipRequest?: RelationshipRequest;
  /** The index report, computed once per check and shared by the two module rules. */
  readonly indexes: RuleOutcome<IndexReport>;
}

/**
 * The modules and paths a consumer has adopted. Ratchet mode refuses a finding inside this set and
 * reports one outside it as debt, so a repository can adopt the taxonomy module by module without
 * the untouched remainder failing every candidate.
 *
 * Prefixes are candidate-relative and carry no trailing slash, because `RelativePath` forbids one.
 * An empty list adopts nothing, which makes every ratcheted finding debt; that is a legitimate
 * starting policy and is not defaulted anywhere. An observation whose path is `.` — the candidate as
 * a whole, which `REL-EXTRACT` produces — is never adopted, because it names no module to adopt.
 */
export interface AdoptedSet {
  readonly adoptedPrefixes: readonly string[];
}

/** True when a candidate-relative path is at or under one adopted prefix. */
export function isAdopted(adoptedSet: AdoptedSet | undefined, path: string): boolean {
  if (adoptedSet === undefined) return false;
  return adoptedSet.adoptedPrefixes.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export interface RegisteredRule extends Rule {
  /** Evaluates the rule over one candidate. A rule that cannot judge says so; it does not throw. */
  evaluate(context: RuleContext): RuleEvaluation;
}

/** The policy fields a rule cannot run without. */
export function requiredPolicyInputs(rule: Rule): string[] {
  return rule.inputs.filter((input) => input.startsWith('policy.'));
}

/** The message of whatever a wrapped check threw. */
export function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Turns one wrapped check into an evaluation. A thrown value is always a failure to evaluate, never
 * debt: these checks report a candidate violation and an unusable input with the same plain
 * `Error`, so nothing here can tell them apart. Findings come only from structured output.
 */
export function evaluateWrapped(run: () => readonly RuleObservation[]): RuleEvaluation {
  try {
    return { kind: 'observed', observations: run() };
  } catch (cause) {
    // Proof: on 2026-09-20, turning caught failures into an empty observed list made an
    // unclassifiable candidate exit 0; the adapter test expected exit 1 and received 0.
    return { kind: 'not-evaluated', reason: reasonOf(cause) };
  }
}

function effectOf(
  mode: RuleMode,
  observation: RuleObservation,
  adoptedSet: AdoptedSet | undefined,
): 'debt' | 'refusal' {
  // Proof: on 2026-09-20, always returning debt made an enforced direct-entry finding exit 0;
  // the adapter test expected exit 1 and received 0.
  if (mode === 'observe') return 'debt';
  if (mode === 'enforce') return 'refusal';
  // Proof: on 2026-09-20, forcing refusal made the outside-adopted-set test expect exit 0 and
  // receive 1; forcing debt made the inside-adopted-set test expect exit 1 and receive 0.
  return isAdopted(adoptedSet, observation.path) ? 'refusal' : 'debt';
}

/** Policy, not code, decides whether an observation refuses the candidate. */
export function toFinding(
  ruleId: string,
  mode: RuleMode,
  observation: RuleObservation,
  adoptedSet: AdoptedSet | undefined,
): Finding {
  return {
    ruleId,
    path: observation.path,
    ...(observation.subject === undefined ? {} : { subject: observation.subject }),
    message: observation.message,
    effect: effectOf(mode, observation, adoptedSet),
  };
}
