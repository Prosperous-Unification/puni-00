import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { basename, dirname } from 'node:path';

import { expect, test } from 'bun:test';

import { allocateFactoryRoot } from '../fixtures/edge-init-factory-root';
import { FixtureOwnership } from '../fixtures/edge-init-owner';

function validateRoot(root: string): void {
  const ownership = new FixtureOwnership(root);
  assert.equal(dirname(root), '/tmp');
  assert.match(basename(root), /^edge-init-factory-.+/);
  assert.equal(ownership.owner(root + '/home/puni1'), 1000);
  assert.equal(ownership.owner('/var/tmp/unrelated-factory-path'), undefined);
}

test('allocated factory root satisfies unchanged synthetic ownership', async () => {
  const root = await allocateFactoryRoot();
  try {
    validateRoot(root);
  } finally {
    await rm(root, { recursive: true });
  }
});

test('factory root remains owned when the child TMPDIR is /var/tmp', async () => {
  const allocator = new URL('../fixtures/edge-init-factory-root.ts', import.meta.url).href;
  const owner = new URL('../fixtures/edge-init-owner.ts', import.meta.url).href;
  const program = `
    import assert from 'node:assert/strict';
    import { rm } from 'node:fs/promises';
    import { basename, dirname } from 'node:path';
    import { allocateFactoryRoot } from ${JSON.stringify(allocator)};
    import { FixtureOwnership } from ${JSON.stringify(owner)};
    const root = await allocateFactoryRoot();
    try {
      const ownership = new FixtureOwnership(root);
      assert.equal(dirname(root), '/tmp');
      assert.match(basename(root), /^edge-init-factory-.+/);
      assert.equal(ownership.owner(root + '/home/puni1'), 1000);
      assert.equal(ownership.owner('/var/tmp/unrelated-factory-path'), undefined);
      console.log('factory-root-owned');
    } finally {
      await rm(root, { recursive: true });
    }
  `;
  const child = Bun.spawn([process.execPath, '-e', program], {
    env: { ...process.env, TMPDIR: '/var/tmp' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const deadline = setTimeout(() => {
    child.kill('SIGKILL');
  }, 3000);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(stdout).toBe('factory-root-owned\n');
  } finally {
    clearTimeout(deadline);
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
  }
});
