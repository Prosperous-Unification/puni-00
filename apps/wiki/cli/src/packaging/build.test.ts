import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { buildPackage } from './build';

const scratchRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    scratchRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

function invoke(executable: string, argv: readonly string[], cwd: string) {
  return Bun.spawnSync([process.execPath, executable, ...argv], {
    cwd,
    stderr: 'pipe',
    stdout: 'pipe',
  });
}

async function refusalMessage(action: Promise<void>): Promise<string> {
  try {
    await action;
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
  throw new Error('expected package build refusal');
}

describe('buildPackage', () => {
  test('refuses a build that does not produce exactly one executable', async () => {
    const externalRoot = await mkdtemp(join(tmpdir(), 'twilight-bureaucrat-empty-build-'));
    scratchRoots.push(externalRoot);

    expect(
      await refusalMessage(
        buildPackage(externalRoot, () => Promise.resolve({ logs: [], outputs: [], success: true })),
      ),
    ).toContain('Cannot build Twilight Bureaucrat');
  });

  test('builds the canonical executable for use outside the repository', async () => {
    const externalRoot = await mkdtemp(join(tmpdir(), 'twilight-bureaucrat-bin-'));
    scratchRoots.push(externalRoot);
    const packageRoot = join(externalRoot, 'package');
    await buildPackage(packageRoot);
    const executable = join(packageRoot, 'dist/bin.mjs');

    const version = invoke(executable, ['--version'], externalRoot);
    expect(version.exitCode, version.stderr.toString()).toBe(0);
    expect(version.stdout.toString()).toBe('0.1.0\n');

    const unknown = invoke(executable, ['not-a-command'], externalRoot);
    expect(unknown.exitCode).not.toBe(0);
    expect(unknown.stderr.toString()).toContain('unknown command');

    const fixtureDirectory = join(externalRoot, 'fixture');
    await mkdir(fixtureDirectory);
    const fixture = join(fixtureDirectory, 'benchmark-corpus.v1.json');
    await copyFile(
      join(import.meta.dir, '../contracts/fixtures/benchmark-corpus.v1.json'),
      fixture,
    );
    const validation = invoke(
      executable,
      ['validate-record', 'benchmark-corpus', fixture],
      externalRoot,
    );
    expect(validation.exitCode, validation.stderr.toString()).toBe(0);
    expect(validation.stdout.toString()).toBe('valid benchmark-corpus\n');
  });
});
