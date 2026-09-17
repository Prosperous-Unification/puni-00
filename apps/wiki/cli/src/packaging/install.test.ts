import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';
import {
  auditReview,
  candidateIdentityAt,
  createRelocationCandidate,
  disposeRelocationFixtures,
  write,
} from '../policy/relocation-fixtures';
import { packPackage } from './pack';

const workspace = resolve(import.meta.dir, '../../../../..');
const packageSource = join(workspace, 'apps/wiki/cli');
const packedTarball = join(
  workspace,
  'dist/twilight-bureaucrat-pack/twilight-bureaucrat-0.1.0.tgz',
);
const scratchRoots: string[] = [];

function scratch(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  scratchRoots.push(root);
  return root;
}

function sanitizedEnvironment(home: string): Record<string, string> {
  return {
    HOME: process.env['HOME'] ?? home,
    PATH: process.env['PATH'] ?? '',
  };
}

function run(command: string[], cwd: string, env = sanitizedEnvironment(cwd)) {
  return Bun.spawnSync(command, { cwd, env, stderr: 'pipe', stdout: 'pipe' });
}

function installTarball(tarball: string): { consumer: string; executable: string } {
  const consumer = scratch('twilight-bureaucrat-consumer-');
  cpSync(join(packageSource, 'fixtures/consumer'), consumer, { recursive: true });
  const sentinel = join(consumer, 'lifecycle-ran');
  const manifest = JSON.parse(readFileSync(join(consumer, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  manifest['scripts'] = {
    preinstall: `bun -e 'await Bun.write(${JSON.stringify(sentinel)}, "ran")'`,
  };
  writeFileSync(join(consumer, 'package.json'), `${JSON.stringify(manifest)}\n`);
  const installEnvironment = { HOME: consumer, PATH: process.env['PATH'] ?? '' };
  const added = run(
    ['bun', 'add', '--exact', '--ignore-scripts', tarball],
    consumer,
    installEnvironment,
  );
  expect(added.exitCode, added.stderr.toString()).toBe(0);
  const frozen = run(
    ['bun', 'install', '--frozen-lockfile', '--ignore-scripts'],
    consumer,
    installEnvironment,
  );
  expect(frozen.exitCode, frozen.stderr.toString()).toBe(0);
  expect(existsSync(sentinel)).toBe(false);
  return {
    consumer,
    executable: join(consumer, 'node_modules/twilight-bureaucrat/dist/bin.mjs'),
  };
}

function invoke(executable: string, argv: readonly string[], cwd: string) {
  return run([process.execPath, executable, ...argv], cwd);
}

function listFiles(root: string, prefix = ''): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...listFiles(root, relative));
    else files.push(relative);
  }
  return files.sort();
}

function git(repository: string, argv: string[]): string {
  const invocation = run(['git', '-C', repository, ...argv], repository);
  if (invocation.exitCode !== 0) throw new Error(invocation.stderr.toString());
  return invocation.stdout.toString().trim();
}

function preparationArguments(
  fixture: ReturnType<typeof createRelocationCandidate>,
  out: string,
): string[] {
  const strata = join(out, 'audit-strata.json');
  write(
    strata,
    `${JSON.stringify({
      strata: [
        {
          stratumId: 'risk.public-admission',
          sampleRateBps: 10000,
          disagreementTriggerBps: 10000,
        },
      ],
      obligations: { 'review.fixture.module': 'risk.public-admission' },
    })}\n`,
  );
  const review = join(out, 'review.json');
  write(
    review,
    `${JSON.stringify(
      auditReview(
        'review.fixture.module',
        fixture.candidateRevision,
        candidateIdentityAt(fixture.repository, fixture.candidateRevision),
      ),
    )}\n`,
  );
  return [
    'prepare-activation',
    '--candidate-repository',
    fixture.repository,
    '--candidate-sha',
    fixture.candidateRevision,
    '--candidate-policy',
    'docs/wiki-policy/policy.json',
    '--candidate-mapping',
    'docs/wiki-policy/modules.json',
    '--review-record',
    review,
    '--audit-strata',
    strata,
    '--destination',
    join(out, 'activation'),
    '--work',
    join(out, 'work'),
    '--resource-lane',
    'lane.package-install',
    '--cwd-identity',
    'cwd.package-install',
  ];
}

afterAll(() => {
  disposeRelocationFixtures();
  for (const root of scratchRoots.splice(0)) {
    Bun.spawnSync(['rm', '-rf', '--', root], { stderr: 'pipe', stdout: 'pipe' });
  }
});

describe('packed Twilight Bureaucrat installation', () => {
  test('installs the exact tarball with scripts disabled and runs without workspace resolution', () => {
    if (!existsSync(packedTarball)) throw new Error(`packed tarball is absent: ${packedTarball}`);
    const { consumer, executable } = installTarball(packedTarball);
    const installed = join(consumer, 'node_modules/twilight-bureaucrat');
    const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')) as {
      name?: string;
      bin?: Record<string, string>;
      version?: string;
    };
    expect(manifest).toMatchObject({
      name: 'twilight-bureaucrat',
      version: '0.1.0',
      bin: { 'twilight-bureaucrat': 'dist/bin.mjs' },
    });
    const installedFiles = listFiles(installed);
    expect(installedFiles).toContain('dist/toolkit/prepare-relocation-activation.mjs');
    expect(installedFiles.some((path) => path.startsWith('apps/wbs/'))).toBe(false);
    expect(installedFiles.some((path) => path.includes('docs/wiki-policy'))).toBe(false);
    expect(installedFiles.some((path) => /secret/i.test(path))).toBe(false);
    const version = invoke(executable, ['--version'], consumer);
    expect(version.exitCode, version.stderr.toString()).toBe(0);
    expect(version.stdout.toString()).toBe('0.1.0\n');
    const offlineVersion = run([process.execPath, executable, '--version'], consumer, {
      ...sanitizedEnvironment(consumer),
      BUN_CONFIG_REGISTRY: 'http://127.0.0.1:1',
    });
    expect(offlineVersion.exitCode, offlineVersion.stderr.toString()).toBe(0);
    expect(offlineVersion.stdout.toString()).toBe('0.1.0\n');
    const fixture = join(consumer, 'benchmark-corpus.v1.json');
    cpSync(join(packageSource, 'src/contracts/fixtures/benchmark-corpus.v1.json'), fixture);
    const validation = invoke(
      executable,
      ['validate-record', 'benchmark-corpus', fixture],
      consumer,
    );
    expect(validation.exitCode, validation.stderr.toString()).toBe(0);
    expect(validation.stdout.toString()).toBe('valid benchmark-corpus\n');
    expect(hashBytes(readFileSync(packedTarball))).toMatch(/^[0-9a-f]{64}$/);

    const missingRole = join(installed, 'dist/toolkit/validator.mjs');
    renameSync(missingRole, `${missingRole}.absent`);
    const missingFixture = createRelocationCandidate();
    const missingOut = scratch('twilight-bureaucrat-missing-role-');
    const refused = invoke(executable, preparationArguments(missingFixture, missingOut), consumer);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr.toString()).toContain('toolkit role is unreadable: validator.mjs');
  }, 120_000);

  test('prepares certified admission and the old activation refuses a newer commit', () => {
    const { consumer, executable } = installTarball(packedTarball);
    const fixture = createRelocationCandidate();
    const out = scratch('twilight-bureaucrat-activation-');
    const prepared = invoke(executable, preparationArguments(fixture, out), consumer);
    const output = `${prepared.stdout.toString()}${prepared.stderr.toString()}`;
    expect(prepared.exitCode, output).toBe(0);
    expect(output).toContain(`toolkit activation: ${fixture.candidateRevision}`);
    expect(output).toContain('"certified":true');

    const validator = join(fixture.repository, 'src/new/cli.ts');
    write(validator, `${readFileSync(validator, 'utf8')}\nexport const changed = true;\n`);
    git(fixture.repository, ['add', '--all']);
    git(fixture.repository, ['commit', '--message', 'change candidate after activation']);
    const changedRevision = git(fixture.repository, ['rev-parse', 'HEAD']);
    const stale = run(
      [process.execPath, executable, 'lint', 'committed', fixture.repository, changedRevision],
      consumer,
      {
        ...sanitizedEnvironment(consumer),
        TOOL_WIKI_ACTIVATION_ROOT: join(out, 'activation'),
        TOOL_WIKI_REQUIRE_CERTIFIED: '1',
      },
    );
    expect(stale.exitCode).not.toBe(0);
    expect(`${stale.stdout.toString()}${stale.stderr.toString()}`).toContain('accepted');
  }, 300_000);

  test('a same-version tarball with a modified validator is refused before execution', async () => {
    const repackedRoot = scratch('twilight-bureaucrat-tampered-package-');
    for (const name of ['package.json', 'README.md', 'NOTICE'] as const) {
      cpSync(join(packageSource, name), join(repackedRoot, name));
    }
    cpSync(join(packageSource, 'dist'), join(repackedRoot, 'dist'), { recursive: true });
    writeFileSync(join(repackedRoot, 'dist/toolkit/validator.mjs'), '\ncorrupted\n', { flag: 'a' });
    const destination = scratch('twilight-bureaucrat-tampered-pack-');
    await packPackage(repackedRoot, destination);
    const tamperedTarball = join(destination, 'twilight-bureaucrat-0.1.0.tgz');
    const { consumer, executable } = installTarball(tamperedTarball);
    const fixture = createRelocationCandidate();
    const out = scratch('twilight-bureaucrat-tampered-run-');
    const refused = invoke(executable, preparationArguments(fixture, out), consumer);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr.toString()).toContain(
      'toolkit role differs from toolkit.json: validator.mjs',
    );
  }, 300_000);

  test('repositories without Nx refuse extraction explicitly', () => {
    const { consumer, executable } = installTarball(packedTarball);
    const fixture = createRelocationCandidate();
    renameSync(join(fixture.repository, 'nx.json'), join(fixture.repository, 'nx.absent'));
    git(fixture.repository, ['add', '--all']);
    git(fixture.repository, ['commit', '--message', 'remove Nx workspace metadata']);
    const noNxFixture = {
      ...fixture,
      candidateRevision: git(fixture.repository, ['rev-parse', 'HEAD']),
    };
    const out = scratch('twilight-bureaucrat-no-nx-');
    const refused = invoke(executable, preparationArguments(noNxFixture, out), consumer);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr.toString()).toContain('nx.json');
  }, 120_000);
});
