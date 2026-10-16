import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const base = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const candidate = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const path = 'apps/wbs/fe-01/src/components/wbs/use-plan-layout.tsx';
assert.deepEqual(base.ruleIds, ['F7']);
assert.deepEqual(candidate.ruleIds, ['F7']);
assert(base.findings.some((finding) => finding.ruleId === 'F7' && finding.path === path));
assert(
  !candidate.findings.some((finding) => finding.ruleId === 'F7' && finding.path === path),
  'selected oversized hook finding remains',
);
assert.deepEqual(
  candidate.findings,
  base.findings.filter((finding) => finding.ruleId !== 'F7' || finding.path !== path),
);
assert.deepEqual(base.unevaluated, []);
assert.deepEqual(candidate.unevaluated, []);
assert.equal(base.certifies, false);
assert.equal(candidate.certifies, false);
console.log(
  'Selected F7 finding removed; unrelated findings unchanged; neither verdict certifies.',
);
