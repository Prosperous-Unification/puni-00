import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'bun:test';

const entry = fileURLToPath(new URL('./fixtures/bundled-solver-entry.ts', import.meta.url));

test('release-style Bun artifact runs existing local and connected solver callers', () => {
  const directory = mkdtempSync(join(tmpdir(), 'wbs-solver-bundle-'));
  try {
    const fromSource = Bun.spawnSync(['bun', entry], { cwd: directory });
    expect(fromSource.exitCode).toBe(0);
    expect(fromSource.stdout.toString()).toBe('local=function connected=request\n');

    const bundle = join(directory, 'solver-entry.js');
    const build = Bun.spawnSync(['bun', 'build', entry, '--target=bun', `--outfile=${bundle}`], {
      cwd: directory,
    });
    expect(build.exitCode).toBe(0);
    const fromBundle = Bun.spawnSync(['bun', bundle], { cwd: directory });
    if (fromBundle.exitCode !== 0) process.stderr.write(fromBundle.stderr.toString());
    // Proof: replacing the normative JSON import with a runtime
    // import.meta.url filesystem read made this artifact exit 1 with ENOENT.
    expect(fromBundle.exitCode).toBe(0);
    expect(fromBundle.stdout.toString()).toBe(fromSource.stdout.toString());
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
