import console from 'node:console';
import process from 'node:process';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const [proofRoot, receipts] = process.argv.slice(2);
const baselinePath = join(receipts, 'full-base.json');
const finalPath = join(receipts, 'full-final.json');
const policyPath = join(receipts, 'recovery-full-policy.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const final = JSON.parse(readFileSync(finalPath, 'utf8'));
const faults = [
  [
    'selected-finding',
    { ...baseline, candidate: final.candidate },
    'selected plan-export finding remains',
  ],
  [
    'unrelated-finding',
    {
      ...final,
      findings: [
        ...final.findings,
        { ruleId: 'F7', path: 'injected-unrelated.ts', message: 'injected fault', effect: 'debt' },
      ],
    },
    'unrelated findings changed',
  ],
  [
    'unevaluated',
    {
      ...final,
      unevaluated: [
        ...final.unevaluated,
        { ruleId: 'F7', reason: 'injected prerequisite refusal' },
      ],
    },
    'unevaluated entries changed',
  ],
];
for (const [label, verdict, expected] of faults) {
  const path = join(receipts, `fault-${label}.json`);
  writeFileSync(path, JSON.stringify(verdict, null, 2) + '\n');
  const invocation = spawnSync(
    process.execPath,
    [join(proofRoot, 'assert-full.mjs'), baselinePath, path, policyPath],
    { encoding: 'utf8' },
  );
  writeFileSync(join(receipts, `fault-${label}.log`), invocation.stdout + invocation.stderr);
  assert.equal(invocation.signal, null);
  assert.equal(invocation.status, 1, `${label} fault unexpectedly passed`);
  assert(invocation.stderr.includes(expected), `${label} failed for the wrong reason`);
}
console.log('All three comparator faults failed their named production-receipt assertions.');
