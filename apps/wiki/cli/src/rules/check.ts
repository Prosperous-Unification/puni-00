import { findRule, registeredIds } from './registry';
import type { Rule, RuleMode } from './rule';

function selectRule(ruleId: string): Rule {
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
export function explainRule(ruleId: string): RuleExplanation {
  const { id, family, statement, source, inputs } = selectRule(ruleId);
  return { id, family, statement, source, inputs };
}

/** `explain <rule-id>` */
export function writeExplainCommand(argv: readonly string[]): void {
  process.stdout.write(`${JSON.stringify(explainRule(argv[1]))}\n`);
}
