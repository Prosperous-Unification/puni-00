import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';
import { buildPackage } from './build';

const toolkitRoles = [
  'SHA256SUMS',
  'launcher.sh',
  'prepare-activation.mjs',
  'prepare-relocation-activation.mjs',
  'snapshotter.ts',
  'toolkit.json',
  'trusted-node-modules/typescript/package.json',
  'validator.mjs',
] as const;

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

    for (const role of toolkitRoles) {
      expect((await stat(join(packageRoot, 'dist/toolkit', role))).isFile()).toBe(true);
    }
    const packageManifest = JSON.parse(
      await readFile(join(packageRoot, 'dist/package-manifest.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(packageManifest).toMatchObject({ packageVersion: '0.1.0', schemaVersion: 1 });
    expect(packageManifest['sourceRevision']).toMatch(/^[0-9a-f]{40}$/);
    expect(packageManifest['toolkitIdentity']).toMatch(/^[0-9a-f]{64}$/);
    expect(packageManifest['toolkitIdentity']).toBe(
      hashBytes(await readFile(join(packageRoot, 'dist/toolkit/toolkit.json'))),
    );
    expect((await readdir(join(packageRoot, 'dist'))).sort()).toEqual([
      'bin.mjs',
      'package-manifest.json',
      'toolkit',
    ]);

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

    const lint = invoke(
      executable,
      ['lint', 'working', resolve(import.meta.dir, '../../../../..'), 'HEAD'],
      externalRoot,
    );
    expect(lint.exitCode, lint.stderr.toString()).toBe(0);
    expect(lint.stdout.toString()).toContain('"status":"inactive"');

    const preparer = invoke(executable, ['prepare-activation'], externalRoot);
    expect(preparer.exitCode).not.toBe(0);
    expect(preparer.stderr.toString()).toContain('missing required flag: --candidate-repository');

    const relocationPreparer = invoke(executable, ['prepare-relocation-activation'], externalRoot);
    expect(relocationPreparer.exitCode).not.toBe(0);
    expect(relocationPreparer.stderr.toString()).toContain(
      'missing required flag: --candidate-repository',
    );

    await writeFile(join(packageRoot, 'dist/toolkit/validator.mjs'), '\ncorrupted\n', {
      flag: 'a',
    });
    const corruptToolkit = invoke(
      executable,
      [
        'prepare-activation',
        '--candidate-repository',
        resolve(import.meta.dir, '../../../../..'),
        '--candidate-sha',
        '0'.repeat(40),
        '--candidate-policy',
        'policy.json',
        '--candidate-mapping',
        'mapping.json',
        '--review-record',
        join(externalRoot, 'review.json'),
        '--audit-strata',
        join(externalRoot, 'strata.json'),
        '--destination',
        join(externalRoot, 'activation'),
        '--work',
        join(externalRoot, 'work'),
        '--resource-lane',
        'package-test',
        '--cwd-identity',
        'package-test',
      ],
      externalRoot,
    );
    expect(corruptToolkit.exitCode).not.toBe(0);
    expect(corruptToolkit.stderr.toString()).toContain(
      'toolkit role differs from toolkit.json: validator.mjs',
    );
  }, 20_000);
});
