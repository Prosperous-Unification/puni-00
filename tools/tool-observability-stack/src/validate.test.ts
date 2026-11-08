import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { validateTree } from './validate';

describe('validateTree', () => {
  it('passes on the scaffolded tree', async () => {
    const root = import.meta.dir;
    const results = await validateTree(root);
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      console.log(failed);
    }
    expect(failed).toHaveLength(0);
    expect(results.some((r) => r.file.endsWith('prometheus.yml'))).toBe(true);
    expect(results.some((r) => r.file.endsWith('be-01-overview.json'))).toBe(true);
  });
});

it('rejects malformed reviewed differences through tree validation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'parity-validation-'));
  try {
    await mkdir(join(directory, 'configuration'));
    await writeFile(join(directory, 'configuration/reviewed-differences.json'), '[{"path":"/x"}]');
    const verdicts = await validateTree(directory);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].ok).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
