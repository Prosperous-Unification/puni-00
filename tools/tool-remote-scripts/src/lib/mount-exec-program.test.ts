import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { CENSUS_PROGRAM } from './mount-exec-program';

test('immutable census receipts include dotfiles and propagate each stat failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'exec-census-'));
  try {
    await mkdir(join(directory, '.hidden'));
    await Bun.write(join(directory, 'file space'), 'fixture');
    const run = async (program: string) => {
      const child = Bun.spawn(
        ['/usr/bin/busybox', 'sh', '-c', program, '--', 'proof', '', directory],
        { stdout: 'pipe', stderr: 'pipe' },
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { stdout, stderr, code };
    };
    const receipt = await run(CENSUS_PROGRAM);
    expect(receipt.code).toBe(0);
    expect(receipt.stderr).toBe('');
    expect(receipt.stdout).toContain(`ENTRY\0${directory}/.hidden\0`);
    expect(receipt.stdout).toContain(`ENTRY\0${directory}/file space\0`);
    expect(receipt.stdout).toContain(['DONE', 'proof', '3', ''].join('\0'));
    const refused = await run(
      CENSUS_PROGRAM.replace('"$path") || return 73', '"$path/absent-proof") || return 73'),
    );
    expect(refused.code).toBe(73);
    expect(refused.stderr).toContain('absent-proof');
    expect(refused.stdout).not.toContain('DONE\0');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
