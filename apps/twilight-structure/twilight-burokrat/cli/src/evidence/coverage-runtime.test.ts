import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { identifyCoverageRuntime } from './coverage-runtime';

test('runtime identity changes when an executed dependency changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-runtime-'));
  try {
    const entry = join(root, 'cli.ts');
    const dependency = join(root, 'dependency.ts');
    writeFileSync(entry, "import './dependency';\n");
    writeFileSync(dependency, 'export const value = 1;\n');
    const before = identifyCoverageRuntime(entry);
    writeFileSync(dependency, 'export const value = 2;\n');
    const after = identifyCoverageRuntime(entry);
    expect(after.digest).not.toBe(before.digest);
    expect(before.artifacts.map((artifact) => artifact.path)).toContain(dependency);
    expect(before.artifacts.map((artifact) => artifact.path)).toContain(process.execPath);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('runtime refuses absent imported dependency', () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-runtime-missing-'));
  try {
    const entry = join(root, 'cli.ts');
    writeFileSync(entry, "import './absent';\n");
    expect(() => identifyCoverageRuntime(entry)).toThrow('cannot resolve validator dependency');
  } finally {
    rmSync(root, { recursive: true });
  }
});

test('built executable registers coverage before the installed authority boundary', async () => {
  const root = mkdtempSync(join(tmpdir(), 'coverage-built-dispatch-'));
  try {
    const built = await Bun.build({
      entrypoints: [join(import.meta.dir, '../bin.ts')],
      target: 'bun',
      format: 'esm',
    });
    expect(built.success).toBe(true);
    const artifact = built.outputs[0];
    expect(built.outputs).toHaveLength(1);
    const executable = join(root, 'bin.mjs');
    writeFileSync(executable, new Uint8Array(await artifact.arrayBuffer()));
    const invocation = Bun.spawnSync(
      [process.execPath, executable, 'inspect-evaluation-coverage'],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(invocation.exitCode).toBe(1);
    expect(invocation.stdout.toString()).toBe('');
    expect(invocation.stderr.toString()).toContain('installed package manifest is unreadable');
    const help = Bun.spawnSync([process.execPath, executable, '--help'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(help.exitCode).toBe(0);
    expect(help.stdout.toString()).toContain('inspect-evaluation-coverage');
  } finally {
    rmSync(root, { recursive: true });
  }
}, 60_000);
