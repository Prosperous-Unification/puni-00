import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, it } from 'bun:test';

// Proof: omitting/externalizing the bundle fails outside the checkout before the usage refusal.
it('runs the host restore artifact outside its checkout and refuses missing arguments', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-host-artifact-'));
  try {
    const artifact = join(directory, 'shared-people-host-restore.js');
    copyFileSync(resolve('dist/apps/wbs/be-01-host/shared-people-host-restore.js'), artifact);
    const child = Bun.spawn([process.execPath, artifact], {
      cwd: directory,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).not.toBe(0);
    expect(stderr).toContain('usage: shared-people-host-restore');
    expect(stderr).not.toContain('Cannot find');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
