import { parseOrThrow, type } from '@shared/validation';

import { findRule } from './rules/registry';

// Proof: removing the mapping closed-key check made [TEST-AXES-085] accept fixture extra keys.
const FixturePolicy = type({
  schemaVersion: '1',
  fixtures: type({ ruleId: 'string>=1', file: 'string>=1' }).onUndeclaredKey('reject').array(),
}).onUndeclaredKey('reject');

const ARCHITECTURE_FILE = /^src\/architecture\/[a-z0-9-]+\.architecture\.test\.ts$/;

/** Decode the runner's closed version-1 policy before directory discovery. */
export function decodeArchitecturePolicy(input: unknown) {
  // Proof: replacing decoding with a trust cast made [TEST-AXES-085] lose its schema refusal.
  const policy = parseOrThrow(FixturePolicy, input);
  // Proof: removing this guard made [TEST-AXES-085] lose its no-cases refusal.
  if (policy.fixtures.length === 0) throw new Error('no-cases: Architecture has no mapped rules');
  return policy;
}

/** Validate each mapping immediately before its IO; earlier fixture failures retain precedence. */
export function validateArchitectureMapping(
  fixture: { ruleId: string; file: string },
  rules: Set<string>,
): void {
  // Proof: disabling this guard made the mixed-level production test fail at the later
  // exact rule-file check, which refused F7's src/unit.test.ts with the wrong diagnosis.
  if (!ARCHITECTURE_FILE.test(fixture.file)) {
    throw new Error(`Architecture target cannot collect Unit file ${fixture.file}`);
  }
  // Proof: disabling this check made the F7-to-MOD-INDEX production negative exit 0 with
  // MOD-INDEX's passing testcase falsely standing in for F7.
  const expectedFile = `src/architecture/${fixture.ruleId.toLowerCase()}.architecture.test.ts`;
  if (fixture.file !== expectedFile) {
    throw new Error(`Architecture rule ${fixture.ruleId} needs its own fixture: ${expectedFile}`);
  }
  // Proof: disabling this check made the unknown-rule production runner negative exit 0.
  if (findRule(fixture.ruleId) === undefined) {
    throw new Error(`Architecture mapping names unknown rule ${fixture.ruleId}`);
  }
  // Proof: disabling this check made the duplicate-rule production runner negative exit 0.
  if (rules.has(fixture.ruleId)) {
    throw new Error(`Architecture rule is mapped twice: ${fixture.ruleId}`);
  }
  rules.add(fixture.ruleId);
}

/** Refuse unmapped immediate suffix children; callers preserve their filesystem discovery boundary. */
export function validateArchitectureDiscovery(
  discovered: readonly string[],
  selected: ReadonlySet<string>,
): void {
  for (const file of discovered) {
    // Proof: architecture-level.test.ts adds extra.architecture.test.ts; without this guard the
    // target silently omits a rule negative while reporting a passing Architecture run.
    if (!selected.has(file)) throw new Error(`unmapped architecture fixture: ${file}`);
  }
}
