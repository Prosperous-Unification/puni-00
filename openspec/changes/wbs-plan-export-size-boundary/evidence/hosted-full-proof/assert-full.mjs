import console from 'node:console';
import process from 'node:process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const baseline = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const candidate = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const policy = JSON.parse(readFileSync(process.argv[4], 'utf8'));
const selectedPath = 'apps/wbs/fe-01/src/components/wbs/plan-export.ts';
const ruleIds = policy.ruleModes.map(({ ruleId }) => ruleId).sort();
assert.deepEqual([...baseline.ruleIds].sort(), ruleIds, 'baseline did not select every rule');
assert.deepEqual([...candidate.ruleIds].sort(), ruleIds, 'candidate did not select every rule');
assert.equal(ruleIds.length, 14);
assert.equal(baseline.policy, policy.policyId);
assert.equal(candidate.policy, policy.policyId);
assert.notEqual(baseline.candidate, candidate.candidate);
assert.deepEqual(
  baseline.findings.filter(({ ruleId, path }) => ruleId === 'F7' && path === selectedPath),
  [
    {
      ruleId: 'F7',
      path: selectedPath,
      message: '994 lines exceeds the ceiling 800',
      effect: 'debt',
    },
  ],
  'baseline selected finding differs',
);
// Proof: the hosted production baseline used as a candidate must fail this assertion.
assert(
  !candidate.findings.some(({ ruleId, path }) => ruleId === 'F7' && path === selectedPath),
  'selected plan-export finding remains',
);
// Proof: a hosted candidate receipt with one unrelated finding appended must fail here.
assert.deepEqual(
  candidate.findings,
  baseline.findings.filter(({ ruleId, path }) => ruleId !== 'F7' || path !== selectedPath),
  'unrelated findings changed',
);
// Proof: a hosted candidate receipt with an extra unevaluated rule must fail here.
assert.deepEqual(candidate.unevaluated, baseline.unevaluated, 'unevaluated entries changed');
assert.equal(candidate.allowed, baseline.allowed, 'allowed changed');
assert.equal(baseline.certifies, false);
assert.equal(candidate.certifies, false);
console.log(
  JSON.stringify(
    {
      policyId: policy.policyId,
      baselineCandidate: baseline.candidate,
      finalCandidate: candidate.candidate,
      registeredRules: ruleIds,
      baselineFindings: baseline.findings.length,
      finalFindings: candidate.findings.length,
      baselineByRule: Object.fromEntries(
        ruleIds.map((id) => [id, baseline.findings.filter(({ ruleId }) => id === ruleId).length]),
      ),
      finalByRule: Object.fromEntries(
        ruleIds.map((id) => [id, candidate.findings.filter(({ ruleId }) => id === ruleId).length]),
      ),
      unrelatedFindingsUnchanged: true,
      unevaluatedUnchanged: true,
      unevaluated: candidate.unevaluated,
      allowed: candidate.allowed,
      certifies: candidate.certifies,
    },
    null,
    2,
  ),
);
