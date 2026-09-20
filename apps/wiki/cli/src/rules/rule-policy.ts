import { parseOrThrow, type } from '@shared/validation';

import {
  ClassificationPolicy,
  OpaqueId,
  RelationshipRequest,
  SchemaVersion,
} from '../contracts/records';
import { readExternalArtifact } from '../policy/trust';
import { findRule, registeredIds, registeredRules } from './registry';
import { requiredPolicyInputs, type RuleMode } from './rule';

const RuleModeRecord = type({
  ruleId: 'string>=1',
  mode: "'observe'|'ratchet'|'enforce'",
}).onUndeclaredKey('reject');

// Proof: on 2026-09-20, accepting undeclared policy keys made the schema test receive empty stderr
// instead of `unexpected must be removed`.
const RulePolicyRecord = type({
  schemaVersion: SchemaVersion,
  policyId: OpaqueId,
  ruleModes: RuleModeRecord.array(),
  'classificationPolicy?': ClassificationPolicy,
  'relationshipRequest?': RelationshipRequest,
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
 * state, and AGENTS.md R5 forbids defaulting it. `ratchet` is refused until the adopted set that
 * gives it meaning arrives with slice B2.
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
    // Proof: on 2026-09-20, deleting this branch made the ratchet test receive empty stderr
    // instead of the refusal that names slice B2's missing adopted set.
    if (mode === 'ratchet') {
      throw new Error(
        `rule policy sets ${ruleId} to ratchet, which has no adopted set until slice B2`,
      );
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
    const absent =
      (input === 'policy.classificationPolicy' && policy.classificationPolicy === undefined) ||
      (input === 'policy.relationshipRequest' && policy.relationshipRequest === undefined);
    if (absent) {
      throw new Error(`rule ${ruleId} needs ${input}, which the rule policy omits`);
    }
  }
}
