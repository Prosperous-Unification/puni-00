import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
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
    HOME: home,
    PATH: process.env['PATH'] ?? '',
    ...(process.env['VOLTA_HOME'] === undefined ? {} : { VOLTA_HOME: process.env['VOLTA_HOME'] }),
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

function bindInstalledToolkit(installed: string): void {
  const descriptorBytes = readFileSync(join(installed, 'dist/toolkit/toolkit.json'));
  const manifestPath = join(installed, 'dist/package-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  manifest['toolkitIdentity'] = hashBytes(descriptorBytes);
  writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
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
    const help = invoke(executable, ['--help'], consumer);
    expect(help.exitCode, help.stderr.toString()).toBe(0);
    expect(help.stdout.toString()).toContain('twilight-bureaucrat validate-record');
    const fixture = join(consumer, 'benchmark-corpus.v1.json');
    cpSync(join(packageSource, 'src/contracts/fixtures/benchmark-corpus.v1.json'), fixture);
    const unavailableSource = `${packageSource}.unavailable-${String(process.pid)}`;
    renameSync(packageSource, unavailableSource);
    let validation: ReturnType<typeof invoke>;
    try {
      validation = invoke(executable, ['validate-record', 'benchmark-corpus', fixture], consumer);
    } finally {
      renameSync(unavailableSource, packageSource);
    }
    expect(validation.exitCode, validation.stderr.toString()).toBe(0);
    expect(validation.stdout.toString()).toBe('valid benchmark-corpus\n');
    expect(hashBytes(readFileSync(packedTarball))).toMatch(/^[0-9a-f]{64}$/);

    const missingRole = join(installed, 'dist/toolkit/validator.mjs');
    renameSync(missingRole, `${missingRole}.absent`);
    const refused = invoke(executable, ['validate-record', 'benchmark-corpus', fixture], consumer);
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

  test('a self-consistent substituted toolkit is refused by the package identity', async () => {
    const repackedRoot = scratch('twilight-bureaucrat-substituted-toolkit-');
    for (const name of ['package.json', 'README.md', 'NOTICE'] as const) {
      cpSync(join(packageSource, name), join(repackedRoot, name));
    }
    cpSync(join(packageSource, 'dist'), join(repackedRoot, 'dist'), { recursive: true });
    const validatorPath = join(repackedRoot, 'dist/toolkit/validator.mjs');
    writeFileSync(validatorPath, '\nsubstituted\n', { flag: 'a' });
    const descriptorPath = join(repackedRoot, 'dist/toolkit/toolkit.json');
    const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8')) as {
      roles: Record<string, string>;
    };
    descriptor.roles['validator.mjs'] = hashBytes(readFileSync(validatorPath));
    writeFileSync(descriptorPath, `${JSON.stringify(descriptor)}\n`);
    const destination = scratch('twilight-bureaucrat-substituted-pack-');
    await packPackage(repackedRoot, destination);
    const { consumer, executable } = installTarball(
      join(destination, 'twilight-bureaucrat-0.1.0.tgz'),
    );
    const fixture = join(consumer, 'benchmark-corpus.v1.json');
    cpSync(join(packageSource, 'src/contracts/fixtures/benchmark-corpus.v1.json'), fixture);
    const refused = invoke(executable, ['validate-record', 'benchmark-corpus', fixture], consumer);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr.toString()).toContain('installed toolkit differs from package manifest');
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

  test('installed execution refuses runtime and compiler drift', () => {
    const bunDrift = installTarball(packedTarball);
    const bunInstalled = join(bunDrift.consumer, 'node_modules/twilight-bureaucrat');
    const descriptorPath = join(bunInstalled, 'dist/toolkit/toolkit.json');
    const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8')) as Record<string, unknown>;
    descriptor['bunVersion'] = '1.3.9';
    writeFileSync(descriptorPath, `${JSON.stringify(descriptor)}\n`);
    bindInstalledToolkit(bunInstalled);
    const wrongBun = invoke(
      bunDrift.executable,
      ['validate-record', 'benchmark-corpus', 'absent'],
      bunDrift.consumer,
    );
    expect(wrongBun.exitCode).not.toBe(0);
    expect(wrongBun.stderr.toString()).toContain('toolkit was built with another Bun: 1.3.9');

    const compilerDrift = installTarball(packedTarball);
    const compilerInstalled = join(compilerDrift.consumer, 'node_modules/twilight-bureaucrat');
    writeFileSync(
      join(compilerInstalled, 'dist/toolkit/trusted-node-modules/typescript/package.json'),
      '\n',
      { flag: 'a' },
    );
    const wrongCompiler = invoke(
      compilerDrift.executable,
      ['validate-record', 'benchmark-corpus', 'absent'],
      compilerDrift.consumer,
    );
    expect(wrongCompiler.exitCode).not.toBe(0);
    expect(wrongCompiler.stderr.toString()).toContain(
      'toolkit runtime closure differs from toolkit.json',
    );
  }, 120_000);

  test('installed execution refuses a symlinked runtime package', () => {
    const { consumer, executable } = installTarball(packedTarball);
    const typescript = join(
      consumer,
      'node_modules/twilight-bureaucrat/dist/toolkit/trusted-node-modules/typescript',
    );
    renameSync(typescript, `${typescript}.real`);
    symlinkSync(`${typescript}.real`, typescript, 'dir');
    const refused = invoke(executable, ['validate-record', 'benchmark-corpus', 'absent'], consumer);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr.toString()).toContain('trusted node modules carry a non-regular entry');
  }, 120_000);

  test('installed preparation refuses a candidate target that reports skipped tests', () => {
    const { consumer, executable } = installTarball(packedTarball);
    const fixture = createRelocationCandidate({ skippingCheck: true });
    const out = scratch('twilight-bureaucrat-skipping-check-');
    const refused = invoke(executable, preparationArguments(fixture, out), consumer);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr.toString()).toContain('check skipped work: check.fixture.module');
  }, 120_000);
});
