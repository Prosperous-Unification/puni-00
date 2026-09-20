import { parseOrThrow, type } from '@shared/validation';

import {
  ClassificationPolicy,
  OpaqueId,
  RelationshipRequest,
  RelativePath,
  SchemaVersion,
} from '../contracts/records';
import { readExternalArtifact } from '../policy/trust';
import { findRule, registeredIds, registeredRules } from './registry';
import { requiredPolicyInputs, type RuleMode } from './rule';

const RuleModeRecord = type({
  ruleId: 'string>=1',
  mode: "'observe'|'ratchet'|'enforce'",
}).onUndeclaredKey('reject');

const AdoptedSetRecord = type({
  adoptedPrefixes: RelativePath.array(),
})
  .onUndeclaredKey('reject')
  // Proof: on 2026-09-20, removing this narrow made the repeated-prefix test receive empty stderr
  // instead of `unique adopted prefixes`.
  .narrow((adopted, context) =>
    new Set(adopted.adoptedPrefixes).size === adopted.adoptedPrefixes.length
      ? true
      : context.mustBe('unique adopted prefixes'),
  );

const SizeCeilingsRecord = type({
  ceiling: type('number.integer>=1'),
  roots: RelativePath.array(),
  pinned: type({ path: RelativePath, maximum: type('number.integer>=1') })
    .onUndeclaredKey('reject')
    .array(),
})
  .onUndeclaredKey('reject')
  .narrow((ceilings, context) => {
    // Proof: on 2026-09-20, deleting this branch removed `at least one measured root` from stderr.
    if (ceilings.roots.length === 0) return context.mustBe('at least one measured root');
    // Proof: on 2026-09-20, deleting this branch removed `unique measured roots` from stderr.
    if (new Set(ceilings.roots).size !== ceilings.roots.length) {
      return context.mustBe('unique measured roots');
    }
    const pinnedPaths = ceilings.pinned.map((pin) => pin.path);
    // Proof: on 2026-09-20, returning true removed `unique pinned paths` from stderr.
    return new Set(pinnedPaths).size === pinnedPaths.length
      ? true
      : context.mustBe('unique pinned paths');
  });

// Proof: on 2026-09-20, accepting undeclared policy keys made the schema test receive empty stderr
// instead of `unexpected must be removed`.
const RulePolicyRecord = type({
  schemaVersion: SchemaVersion,
  policyId: OpaqueId,
  ruleModes: RuleModeRecord.array(),
  'adoptedSet?': AdoptedSetRecord,
  'classificationPolicy?': ClassificationPolicy,
  'relationshipRequest?': RelationshipRequest,
  'sizeCeilings?': SizeCeilingsRecord,
}).onUndeclaredKey('reject');

export type RulePolicy = typeof RulePolicyRecord.infer;

function decodeRulePolicy(bytes: Uint8Array, path: string): RulePolicy {
  let source: string;
  try {
    // Proof: on 2026-09-20, making this decoder non-fatal mislabeled invalid bytes as malformed
    // JSON instead of refusing the policy as non-UTF-8.
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`rule policy ${path} is not UTF-8: ${detail}`, { cause });
  }
  let input: unknown;
  // Proof: on 2026-09-20, removing this JSON error boundary produced only `JSON Parse error:
  // Expected '}'`, losing the malformed-policy path and classification.
  try {
    input = JSON.parse(source) as unknown;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`malformed rule policy JSON ${path}: ${detail}`, { cause });
  }
  return parseOrThrow(RulePolicyRecord, input);
}

/**
 * Loads the consumer's rule policy from outside the candidate and checks it against the registry.
 *
 * Every registered rule needs a mode and every named rule must exist: an absent entry is unknown
 * state, and AGENTS.md R5 forbids defaulting it. `ratchet` needs an adopted set; a policy that
 * ratchets a rule without one is refused.
 * @throws Error naming the offending rule identifier.
 */
export function loadRulePolicy(candidateRoot: string, path: string): RulePolicy {
  // Proof: on 2026-09-20, falling back after this read made an unreadable policy report a missing
  // mode instead of `cannot open rule policy ...: EACCES`; the containment test failed too.
  const artifact = readExternalArtifact(candidateRoot, path, 'rule policy');
  const policy = decodeRulePolicy(artifact.bytes, artifact.path);
  const stated = new Set<string>();
  for (const { ruleId, mode } of policy.ruleModes) {
    // Proof: on 2026-09-20, deleting this branch made the duplicate-mode test receive empty stderr
    // instead of `rule policy states a mode for MOD-INDEX twice`.
    if (stated.has(ruleId)) throw new Error(`rule policy states a mode for ${ruleId} twice`);
    stated.add(ruleId);
    // Proof: on 2026-09-20, disabling this branch made the unknown-rule test receive empty stderr
    // instead of naming `NO-SUCH-RULE`.
    if (findRule(ruleId) === undefined) {
      throw new Error(
        `rule policy names an unregistered rule: ${ruleId} (registered: ${registeredIds()})`,
      );
    }
    // The adopted set is what gives ratchet its meaning; R5 forbids defaulting it.
    // Proof: on 2026-09-20, deleting this branch made the no-adopted-set test receive empty stderr
    // instead of naming INV-CLASSIFY.
    if (mode === 'ratchet' && policy.adoptedSet === undefined) {
      throw new Error(`rule policy sets ${ruleId} to ratchet but states no adopted set`);
    }
  }
  // Proof: on 2026-09-20, deleting this coverage loop made the missing-mode test receive empty
  // stderr instead of `rule policy states no mode for INV-CLASSIFY`.
  for (const rule of registeredRules()) {
    if (!stated.has(rule.id)) throw new Error(`rule policy states no mode for ${rule.id}`);
  }
  return policy;
}

/** The mode the policy states for one rule. @throws Error when the policy states none. */
export function ruleMode(policy: RulePolicy, ruleId: string): RuleMode {
  const stated = policy.ruleModes.find((entry) => entry.ruleId === ruleId);
  if (stated === undefined) throw new Error(`rule policy states no mode for ${ruleId}`);
  return stated.mode;
}

/** @throws Error naming the rule and the policy field it needs. */
export function assertPolicyInputs(policy: RulePolicy, ruleId: string): void {
  // Proof: on 2026-09-20, returning here made the missing-input test receive empty stderr while
  // the registry fallback still produced a disallowed, unevaluated verdict.
  const rule = findRule(ruleId);
  if (rule === undefined) {
    throw new Error(`unknown rule: ${ruleId} (registered: ${registeredIds()})`);
  }
  for (const input of requiredPolicyInputs(rule)) {
    // Proof: on 2026-09-20, omitting the size-ceilings disjunct removed the required-input sentence
    // from stderr while the F7 registry fallback still exited 1.
    const absent =
      (input === 'policy.classificationPolicy' && policy.classificationPolicy === undefined) ||
      (input === 'policy.relationshipRequest' && policy.relationshipRequest === undefined) ||
      (input === 'policy.sizeCeilings' && policy.sizeCeilings === undefined);
    if (absent) {
      throw new Error(`rule ${ruleId} needs ${input}, which the rule policy omits`);
    }
  }
}
