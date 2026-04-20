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
