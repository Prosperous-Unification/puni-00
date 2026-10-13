import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { buildPackage } from './build';

test('installed executable dispatches Performance, specification and Manual diagnostics', async () => {
  const packageRoot = mkdtempSync(join(tmpdir(), 'burokrat-installed-dispatch-'));
  try {
    await buildPackage(packageRoot);
    const executable = join(packageRoot, 'dist/bin.mjs');
    const help = Bun.spawnSync([process.execPath, executable, '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(help.exitCode).toBe(0);
    expect(help.stdout.toString()).toContain('inspect-performance-sources');
    expect(help.stdout.toString()).toContain('inspect-spec-sources');
    expect(help.stdout.toString()).toContain('inspect-manual-observation');
    for (const [command, usage] of [
      ['inspect-performance-sources', 'usage: twilight-burokrat inspect-performance-sources'],
      ['inspect-spec-sources', 'usage: twilight-burokrat inspect-spec-sources'],
      ['inspect-manual-observation', 'usage: twilight-burokrat inspect-manual-observation'],
    ] as const) {
      const invocation = Bun.spawnSync([process.execPath, executable, command], {
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(invocation.exitCode).toBe(1);
      expect(invocation.stderr.toString()).toContain(usage);
      expect(invocation.stderr.toString()).not.toContain(`unknown command: ${command}`);
    }
  } finally {
    rmSync(packageRoot, { recursive: true, force: true });
  }
}, 120_000);
