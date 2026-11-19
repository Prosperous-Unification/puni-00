import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { runTwinInProcess, scratchDirectory } from './testing/run-twin';
const hashes = {
  '7': {
    'tasks.json': 'f4a347594dc6ddac5c7ddc029a7de3f307d60ae9fa5acce162bbfd87c53c425a',
    'plan-reference.json': '6635d85d5d2bffffb8521cdcf0814393cf52fc5326dc15b92b8184f5977665c6',
  },
  '8': {
    'tasks.json': '369d5d19a3164f7c97c2a23c110084b3bddb6cb8e091399cf40248fa8c57d105',
    'plan-reference.json': '6a0211cedb584451b80a7f5ef7d9d0b0789413006793ee09c31eff317b30f17c',
  },
  '9': {
    'tasks.json': '369d5d19a3164f7c97c2a23c110084b3bddb6cb8e091399cf40248fa8c57d105',
    'plan-reference.json': '32132ed34dfc5d6cf4b309db25838533cfe4dcf085fa389cc5485dbdb6b9a2ab',
  },
  '10': {
    'tasks.json': '369d5d19a3164f7c97c2a23c110084b3bddb6cb8e091399cf40248fa8c57d105',
    'plan-reference.json': '77808a42af5fca839c40580d25742f980cd1d359f77a1f1ba5458a60fad16d20',
  },
  '11': {
    'tasks.json': '369d5d19a3164f7c97c2a23c110084b3bddb6cb8e091399cf40248fa8c57d105',
    'plan-reference.json': '53f38be627ec85124701970239e5dff90bd7a638fe3545fbff8cbd72a5c39570',
  },
};
test('published7–11 outputs retain exact pre-task bytes and digests', async () => {
  const scratch = scratchDirectory();
  try {
    const requirements = join(scratch.path, 'requirements.md');
    writeFileSync(requirements, 'Requirements\n');
    for (const version of [7, 8, 9, 10, 11] as const) {
      const output = join(scratch.path, String(version));
      mkdirSync(output);
      const invocation = await runTwinInProcess([
        'plan-reference',
        '--export',
        join(import.meta.dir, 'fixtures', 'plan-export.v' + String(version) + '.json'),
        '--repository',
        'repo',
        '--change',
        'change',
        '--planning-commit',
        '1'.repeat(40),
        '--source-base',
        '2'.repeat(40),
        '--requirements',
        requirements,
        '--output',
        output,
      ]);
      expect(invocation.exitCode, invocation.stderr).toBe(0);
      for (const name of ['tasks.json', 'plan-reference.json'] as const)
        expect(
          createHash('sha256')
            .update(readFileSync(join(output, name)))
            .digest('hex'),
        ).toBe(hashes[version][name]);
    }
  } finally {
    scratch.remove();
  }
});
