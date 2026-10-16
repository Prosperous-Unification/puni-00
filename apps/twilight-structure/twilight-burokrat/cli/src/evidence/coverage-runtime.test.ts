import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, expect, test } from 'bun:test';

import { hashTrustedModules } from '../policy/trusted-modules';
import { identifyCoverageRuntime } from './coverage-runtime';

let modules: string;
let previousModules: string | undefined;
beforeEach(() => {
  previousModules = process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'];
  modules = mkdtempSync(join(tmpdir(), 'coverage-installed-modules-'));
  process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'] = modules;
});
afterEach(() => {
  if (previousModules === undefined) delete process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'];
  else process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'] = previousModules;
  rmSync(modules, { recursive: true });
});

function installedFixture() {
  const entry = join(modules, 'cli.ts');
  const dependency = join(modules, 'arbitrary-package');
  mkdirSync(dependency);
  const target = join(dependency, 'compiler.js');
  writeFileSync(entry, 'export const entry = 1;\n');
  writeFileSync(target, 'export const value = 1;\n');
  mkdirSync(join(modules, '.bin'));
  const launcher = join(modules, '.bin/acorn');
  symlinkSync('../arbitrary-package/compiler.js', launcher);
  return { entry, dependency, target, launcher };
}

test('configured runtime binds arbitrary installed packages, metadata and launcher topology', () => {
  const fixture = installedFixture();
  const unlinked = join(fixture.dependency, 'unlinked.js');
  writeFileSync(unlinked, 'export const value = 1;\n');
  const initial = identifyCoverageRuntime(fixture.entry);
  writeFileSync(unlinked, 'export const value = 2;\n');
  const before = identifyCoverageRuntime(fixture.entry);
  expect(before.digest).not.toBe(initial.digest);
  writeFileSync(fixture.target, 'export const value = 2;\n');
  const changed = identifyCoverageRuntime(fixture.entry);
  expect(changed.digest).not.toBe(before.digest);
  writeFileSync(join(fixture.dependency, 'bunfig.toml'), '[run]\n');
  const metadata = identifyCoverageRuntime(fixture.entry);
  expect(metadata.digest).not.toBe(changed.digest);
  rmSync(fixture.launcher);
  symlinkSync(fixture.target, fixture.launcher);
  expect(identifyCoverageRuntime(fixture.entry).digest).not.toBe(metadata.digest);
  expect(() => hashTrustedModules(modules)).toThrow('non-regular entry');
});

test('configured runtime binds nested dependency launchers', () => {
  const fixture = installedFixture();
  const nested = join(fixture.dependency, 'node_modules');
  mkdirSync(join(nested, '.bin'), { recursive: true });
  const target = join(nested, 'peer.js');
  writeFileSync(target, 'export const value = 1;\n');
  symlinkSync('../peer.js', join(nested, '.bin/peer'));
  const before = identifyCoverageRuntime(fixture.entry);
  writeFileSync(target, 'export const value = 2;\n');
  expect(identifyCoverageRuntime(fixture.entry).digest).not.toBe(before.digest);
});

for (const fault of [
  'escape',
  'absent',
  'cycle',
  'directory',
  'special',
  'file-link',
  'package-link',
  'unmanaged-bin',
] as const) {
  test(`configured runtime refuses ${fault}`, () => {
    const fixture = installedFixture();
    if (fault === 'file-link') {
      rmSync(fixture.target);
      symlinkSync(fixture.entry, fixture.target);
    } else if (fault === 'package-link') {
      rmSync(fixture.launcher);
      rmSync(fixture.dependency, { recursive: true });
      symlinkSync(join(modules, '.bin'), fixture.dependency);
    } else if (fault === 'unmanaged-bin') {
      mkdirSync(join(fixture.dependency, '.bin'));
      symlinkSync(fixture.target, join(fixture.dependency, '.bin/peer'));
    } else {
      rmSync(fixture.launcher);
      const target =
        fault === 'escape'
          ? process.execPath
          : fault === 'absent'
            ? join(modules, 'absent')
            : fault === 'cycle'
              ? fixture.launcher
              : fixture.dependency;
      if (fault === 'special') {
        const special = join(modules, 'pipe');
        expect(Bun.spawnSync(['mkfifo', special]).exitCode).toBe(0);
        symlinkSync(special, fixture.launcher);
      } else symlinkSync(target, fixture.launcher);
    }
    expect(() => identifyCoverageRuntime(fixture.entry)).toThrow(
      fault === 'directory'
        ? 'target is not a regular file'
        : fault === 'special'
          ? 'non-regular entry'
          : undefined,
    );
  });
}

for (const fault of ['absent-root', 'unreadable-root', 'unreadable-file'] as const) {
  test(`configured runtime refuses ${fault}`, () => {
    const fixture = installedFixture();
    try {
      if (fault === 'absent-root') {
        process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'] = join(modules, 'absent');
      } else chmodSync(fault === 'unreadable-root' ? modules : fixture.target, 0o000);
      expect(() => identifyCoverageRuntime(fixture.entry)).toThrow(
        fault === 'absent-root' ? 'ENOENT' : 'EACCES',
      );
    } finally {
      chmodSync(modules, 0o700);
      chmodSync(fixture.target, 0o600);
    }
  });
}

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
    expect(help.stdout.toString()).toContain('inspect-browser-t2');
  } finally {
    rmSync(root, { recursive: true });
  }
}, 60_000);
