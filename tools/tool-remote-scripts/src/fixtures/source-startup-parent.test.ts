import { realpath } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { createSolverScratch, readSolverChild } from './solver-scratch';

test('synthetic durable source roots keep their system parent and original cleanup with a distinct inherited TMPDIR', async () => {
  await using scratch = createSolverScratch('source-parent-inherited-');
  const parent = await realpath('/var/tmp');
  const startup = join(import.meta.dir, 'source-startup.ts');
  const database = join(import.meta.dir, 'source-database-binding.ts');
  const program = `
    import { strict as assert } from 'node:assert';
    import { lstat, realpath, rm } from 'node:fs/promises';
    import { basename, dirname } from 'node:path';
    import { artifact, installArtifact, roots } from ${JSON.stringify(startup)};
    import { sourceDatabaseFixture } from ${JSON.stringify(database)};
    const parent = await realpath('/var/tmp');
    let retained = [];
    try {
      const prepared = await artifact();
      const installed = await installArtifact(prepared);
      const bound = await sourceDatabaseFixture();
      retained = [...roots];
      assert.equal(retained.length, 4);
      for (const [prefix, root] of [['source-pins-', prepared.root], ['source-installed-', installed.root], ['source-database-', bound.root]]) {
        assert.equal(dirname(root), parent, prefix + ' system parent');
        assert.equal(await realpath(root), root, prefix + ' canonical root');
        assert.equal((await lstat(root)).mode & 0o777, 0o700, prefix + ' original private mode');
        assert.equal(basename(root).startsWith(prefix), true);
        assert.equal(roots.filter((registered) => registered === root).length, 1);
      }
    } finally {
      for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
    }
    for (const root of retained) await assert.rejects(lstat(root), { code: 'ENOENT' });
    assert.equal(roots.length, 0);
    console.log(JSON.stringify({ parent, allocations: 3, registered: retained.length, removed: retained.length }));
  `;
  const { child, code, stdout, stderr } = await readSolverChild(scratch, () =>
    Bun.spawn([process.execPath, '--no-env-file', '-e', program], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, TMPDIR: scratch.root },
    }),
  );
  expect({ code, signal: child.signalCode, stdout, stderr }).toEqual({
    code: 0,
    signal: null,
    stdout: `${JSON.stringify({ parent, allocations: 3, registered: 4, removed: 4 })}\n`,
    stderr: '',
  });
});
