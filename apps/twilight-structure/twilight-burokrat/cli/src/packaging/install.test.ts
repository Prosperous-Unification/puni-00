import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';
import { goldenCheckRuns } from '../policy/check-run-fixtures';
import {
  auditReview,
  candidateIdentityAt,
  createRelocationCandidate,
  disposeRelocationFixtures,
  write,
} from '../policy/relocation-fixtures';
import { packPackage } from './pack';

const workspace = resolve(import.meta.dir, '../../../../../..');
const packageSource = join(workspace, 'apps/twilight-structure/twilight-burokrat/cli');
const packedTarball = join(workspace, 'dist/twilight-burokrat-pack/twilight-burokrat-0.1.0.tgz');
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
  const consumer = scratch('twilight-burokrat-consumer-');
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
    executable: join(consumer, 'node_modules/twilight-burokrat/dist/bin.mjs'),
  };
}

function invoke(executable: string, argv: readonly string[], cwd: string) {
  return run([process.execPath, executable, ...argv], cwd);
}

function invokeWithoutWorkspace(executable: string, argv: readonly string[], cwd: string) {
  const bubblewrap = Bun.which('bwrap');
  if (bubblewrap === null) {
    throw new Error('bwrap is required to prove package execution without the source workspace');
  }
  return run(
    [
      bubblewrap,
      '--die-with-parent',
      '--new-session',
      '--ro-bind',
      '/',
      '/',
      '--dev',
      '/dev',
      '--proc',
      '/proc',
      '--bind',
      cwd,
      cwd,
      '--tmpfs',
      workspace,
      '--chdir',
      cwd,
      process.execPath,
      executable,
      ...argv,
    ],
    cwd,
    { ...sanitizedEnvironment(cwd), TMPDIR: cwd },
  );
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
  checkRuns: string = goldenCheckRuns.passing,
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
    '--check-runs',
    checkRuns,
  ];
}

afterAll(() => {
  disposeRelocationFixtures();
  for (const root of scratchRoots.splice(0)) {
    const removal = Bun.spawnSync(['rm', '-rf', '--', root], { stderr: 'pipe', stdout: 'pipe' });
    // Proof: an rm shim exiting 73 failed this hook and left its scratch tree; without this
    // assertion the same injected failure passed. The external oracle checks leftovers too.
    expect(removal.exitCode, removal.stderr.toString()).toBe(0);
  }
  // Proof: replaying this hook with 65 s of synchronous cleanup failed at the inherited 60 s
  // budget; 180 s passed and removed both fixture roots (docs/test-budgets.md).
}, 180_000);

describe('packed Twilight Burokrat installation', () => {
  test('installs the exact tarball with scripts disabled and runs without workspace resolution', () => {
    if (!existsSync(packedTarball)) throw new Error(`packed tarball is absent: ${packedTarball}`);
    const { consumer, executable } = installTarball(packedTarball);
    const installed = join(consumer, 'node_modules/twilight-burokrat');
    const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')) as {
      name?: string;
      bin?: Record<string, string>;
      version?: string;
    };
    expect(manifest).toMatchObject({
      name: 'twilight-burokrat',
      version: '0.1.0',
      bin: { 'twilight-burokrat': 'dist/bin.mjs', twib: 'dist/bin.mjs' },
    });
    const installedFiles = listFiles(installed);
    expect(installedFiles).toContain('dist/toolkit/prepare-relocation-activation.mjs');
    expect(installedFiles.some((path) => path.startsWith('apps/wbs/'))).toBe(false);
    expect(installedFiles.some((path) => path.includes('docs/wiki-policy'))).toBe(false);
    // Vendor packages include public secrets API documentation and key generation modules.
    // Repository-owned assets must still exclude secret-named paths outside that pinned closure.
    // Proof: repacking with dist/secrets-fixture.txt made this installed-file assertion fail.
    expect(
      installedFiles
        .filter((path) => !path.startsWith('dist/toolkit/trusted-node-modules/'))
        .some((path) => /secret/i.test(path)),
    ).toBe(false);
    const version = invoke(executable, ['--version'], consumer);
    expect(version.exitCode, version.stderr.toString()).toBe(0);
    expect(version.stdout.toString()).toBe('0.1.0\n');
    // Proof: removing the `twib` entry from the manifest and repacking failed the `toMatchObject`
    // manifest expectation; renaming node_modules/.bin/twib aside failed the existence assertion;
    // clearing its executable bit aborted the test with `EACCES: permission denied, posix_spawn`
    // thrown out of `run`, before the exit-status assertion; and replacing it with a launcher
    // printing 9.9.9 failed the output assertion (2026-09-20). Each was restored and rerun green.
    const shortCommand = join(consumer, 'node_modules/.bin/twib');
    const fullCommand = join(consumer, 'node_modules/.bin/twilight-burokrat');
    expect(existsSync(shortCommand), 'the installer did not link the short command').toBe(true);
    expect(existsSync(fullCommand), 'the installer did not link the full command').toBe(true);
    const shortRun = run([shortCommand, '--version'], consumer, sanitizedEnvironment(consumer));
    expect(shortRun.exitCode, shortRun.stderr.toString()).toBe(0);
    expect(shortRun.stdout.toString()).toBe('0.1.0\n');
    const fullRun = run([fullCommand, '--version'], consumer, sanitizedEnvironment(consumer));
    expect(fullRun.exitCode, fullRun.stderr.toString()).toBe(0);
    expect(fullRun.stdout.toString()).toBe(shortRun.stdout.toString());
    const offlineVersion = run([process.execPath, executable, '--version'], consumer, {
      ...sanitizedEnvironment(consumer),
      BUN_CONFIG_REGISTRY: 'http://127.0.0.1:1',
    });
    expect(offlineVersion.exitCode, offlineVersion.stderr.toString()).toBe(0);
    expect(offlineVersion.stdout.toString()).toBe('0.1.0\n');
    const help = invoke(executable, ['--help'], consumer);
    expect(help.exitCode, help.stderr.toString()).toBe(0);
    expect(help.stdout.toString()).toContain('twilight-burokrat validate-record');
    const fixture = join(consumer, 'benchmark-corpus.v1.json');
    cpSync(join(packageSource, 'src/contracts/fixtures/benchmark-corpus.v1.json'), fixture);
    const validation = invokeWithoutWorkspace(
      executable,
      ['validate-record', 'benchmark-corpus', fixture],
      consumer,
    );
    expect(validation.exitCode, validation.stderr.toString()).toBe(0);
    expect(validation.stdout.toString()).toBe('valid benchmark-corpus\n');
    expect(hashBytes(readFileSync(packedTarball))).toMatch(/^[0-9a-f]{64}$/);

    const missingRole = join(installed, 'dist/toolkit/validator.mjs');
    renameSync(missingRole, `${missingRole}.absent`);
    const refused = invoke(executable, ['validate-record', 'benchmark-corpus', fixture], consumer);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr.toString()).toContain('toolkit role is unreadable: validator.mjs');
  }, 120_000);

  test('extracts supported vendor relationships and public declarations outside the checkout', () => {
    const { consumer, executable } = installTarball(packedTarball);
    const repository = join(consumer, 'candidate');
    mkdirSync(repository);
    git(repository, ['init', '--initial-branch=main']);
    git(repository, ['config', 'user.email', 'declarations@example.test']);
    git(repository, ['config', 'user.name', 'Declaration Fixture']);
    write(join(repository, 'package.json'), '{"name":"declaration-consumer","private":true}\n');
    write(join(repository, 'nx.json'), '{"plugins":[],"useInferencePlugins":false}\n');
    write(
      join(repository, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          declaration: true,
          strict: true,
          skipLibCheck: true,
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ES2022',
          types: ['bun-types'],
        },
        include: ['src/**/*.ts'],
      }),
    );
    write(
      join(repository, 'src/index.ts'),
      "import { type } from 'arktype';\n" +
        "import type { Elysia } from 'elysia';\n" +
        "import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';\n" +
        "import { parseAllDocuments } from 'yaml';\n" +
        "import { decode, name, question } from 'dns-packet';\n" +
        "import type { DecodedPacket, Question } from 'dns-packet';\n" +
        "import SMTPConnection from 'nodemailer/lib/smtp-connection';\n" +
        "import type { SMTPConnectionOptions } from 'nodemailer/lib/smtp-connection';\n" +
        "import type {} from './codec';\n" +
        'export function createSmtp(options: SMTPConnectionOptions): SMTPConnection { return new SMTPConnection(options); }\n' +
        'export function decodeDns(bytes: Buffer): DecodedPacket { return decode(bytes); }\n' +
        'export function dnsNameLength(value: string): number { return name.encodingLength(value); }\n' +
        'export function dnsQuestionLength(value: Question): number { return question.encodingLength(value); }\n' +
        'export interface PublicDns { question: Question; response: DecodedPacket; decodeName: typeof name.decode; }\n' +
        'export function parseManifest(source: string): ReturnType<typeof parseAllDocuments> { return parseAllDocuments(source); }\n' +
        'export interface PublicModel { schema: ReturnType<typeof type>; app: Elysia; column: AnySQLiteColumn; file: Bun.BunFile }\n',
    );
    write(
      join(repository, 'src/codec.d.ts'),
      readFileSync(
        join(workspace, 'apps/wbs/be-01/src/runtime/authoritative-dns/codec.d.ts'),
        'utf8',
      ),
    );
    git(repository, ['add', '--all']);
    git(repository, ['commit', '--message', 'consumer declaration imports']);
    const revision = git(repository, ['rev-parse', 'HEAD']);
    const request = join(consumer, 'relationships.json');
    write(
      request,
      JSON.stringify({
        schemaVersion: 1,
        typescript: {
          configPaths: ['tsconfig.json'],
          publicEntrypoints: ['src/index.ts'],
        },
      }),
    );
    const extracted = invokeWithoutWorkspace(
      executable,
      ['extract-relationships', 'committed', repository, revision, request],
      consumer,
    );
    expect(extracted.exitCode, extracted.stderr.toString()).toBe(0);
    const report = JSON.parse(extracted.stdout.toString()) as {
      typescript: {
        imports: { specifier: string; importKind: string }[];
        publicDeclarations: {
          entrypoint: string;
          declarations: { sourcePath: string; text: string }[];
        }[];
      };
    };
    const specifiers = report.typescript.imports.map((edge) => edge.specifier);
    for (const specifier of [
      'arktype',
      'elysia',
      'drizzle-orm/sqlite-core',
      'yaml',
      'dns-packet',
      'nodemailer/lib/smtp-connection',
    ]) {
      expect(specifiers).toContain(specifier);
    }
    const dnsImportKinds = report.typescript.imports
      .filter((edge) => edge.specifier === 'dns-packet')
      .map((edge) => edge.importKind);
    expect(dnsImportKinds).toContain('type');
    expect(dnsImportKinds).toContain('value');
    const smtpImportKinds = report.typescript.imports
      .filter((edge) => edge.specifier === 'nodemailer/lib/smtp-connection')
      .map((edge) => edge.importKind);
    expect(smtpImportKinds).toContain('type');
    expect(smtpImportKinds).toContain('value');
    expect(report.typescript.publicDeclarations).toHaveLength(1);
    expect(report.typescript.publicDeclarations[0].entrypoint).toBe('src/index.ts');
    expect(
      report.typescript.publicDeclarations[0].declarations
        .map((declaration) => declaration.text)
        .join('\n'),
    ).toContain('interface PublicModel');
    expect(existsSync(join(repository, 'node_modules'))).toBe(false);
    expect(
      report.typescript.publicDeclarations[0].declarations
        .map((declaration) => declaration.text)
        .join('\n'),
    ).toContain('ReturnType<typeof parseAllDocuments>');
    const publicText = report.typescript.publicDeclarations[0].declarations
      .map((declaration) => declaration.text)
      .join('\n');
    expect(publicText).toContain('decodeDns(bytes: Buffer): DecodedPacket');
    expect(publicText).toContain('createSmtp(options: SMTPConnectionOptions): SMTPConnection');
    expect(publicText).toContain('question: Question');
    expect(publicText).toContain('response: DecodedPacket');
    expect(
      report.typescript.publicDeclarations[0].declarations.some(
        (declaration) =>
          declaration.sourcePath === 'src/codec.d.ts' &&
          declaration.text.includes('namespace question'),
      ),
    ).toBe(true);
    const closure = join(
      consumer,
      'node_modules/twilight-burokrat/dist/toolkit/trusted-node-modules',
    );
    expect(existsSync(join(closure, 'nx/package.json'))).toBe(false);
    expect(existsSync(join(closure, 'arktype/node_modules/@ark/schema/package.json'))).toBe(true);
    const yaml = join(closure, 'yaml');
    const savedYaml = join(consumer, 'yaml.saved');
    expect(existsSync(join(yaml, 'package.json'))).toBe(true);
    renameSync(yaml, savedYaml);
    try {
      const missing = invokeWithoutWorkspace(
        executable,
        ['extract-relationships', 'committed', repository, revision, request],
        consumer,
      );
      expect(missing.exitCode).toBe(1);
      expect(missing.stdout.toString()).toBe('');
      expect(missing.stderr.toString()).toContain(
        'toolkit runtime closure differs from toolkit.json',
      );
    } finally {
      renameSync(savedYaml, yaml);
    }
    const declaration = join(yaml, 'dist/index.d.ts');
    const original = readFileSync(declaration);
    try {
      writeFileSync(
        declaration,
        Buffer.concat([original, Buffer.from('\n// altered vendor declaration\n')]),
      );
      const corrupted = invokeWithoutWorkspace(
        executable,
        ['extract-relationships', 'committed', repository, revision, request],
        consumer,
      );
      expect(corrupted.exitCode).toBe(1);
      expect(corrupted.stdout.toString()).toBe('');
      expect(corrupted.stderr.toString()).toContain(
        'toolkit runtime closure differs from toolkit.json',
      );
    } finally {
      writeFileSync(declaration, original);
    }
    const restored = invokeWithoutWorkspace(
      executable,
      ['extract-relationships', 'committed', repository, revision, request],
      consumer,
    );
    expect(restored.exitCode, restored.stderr.toString()).toBe(0);
    expect(JSON.parse(restored.stdout.toString())).toEqual(report);
    expect(existsSync(join(closure, 'dns-packet/package.json'))).toBe(true);
    expect(existsSync(join(closure, '@leichtgewicht/ip-codec/package.json'))).toBe(true);
    for (const vendor of [
      {
        requiredPath: join(closure, '@types/dns-packet'),
        declarationPath: join(closure, '@types/dns-packet/index.d.ts'),
        savedPath: join(consumer, 'dns-types.saved'),
      },
      {
        requiredPath: join(closure, 'nodemailer/dist/esm/smtp-connection/index.d.ts'),
        declarationPath: join(closure, 'nodemailer/dist/esm/smtp-connection/index.d.ts'),
        savedPath: join(consumer, 'smtp-types.saved'),
      },
    ]) {
      const originalDeclaration = readFileSync(vendor.declarationPath);
      for (const fault of ['missing', 'corrupted'] as const) {
        try {
          if (fault === 'missing') renameSync(vendor.requiredPath, vendor.savedPath);
          else
            writeFileSync(
              vendor.declarationPath,
              Buffer.concat([
                originalDeclaration,
                Buffer.from('\n// altered vendor declaration\n'),
              ]),
            );
          const refused = invokeWithoutWorkspace(
            executable,
            ['extract-relationships', 'committed', repository, revision, request],
            consumer,
          );
          expect(refused.exitCode, fault).toBe(1);
          expect(refused.stdout.toString(), fault).toBe('');
          expect(refused.stderr.toString(), fault).toContain(
            'toolkit runtime closure differs from toolkit.json',
          );
        } finally {
          if (fault === 'missing') renameSync(vendor.savedPath, vendor.requiredPath);
          else writeFileSync(vendor.declarationPath, originalDeclaration);
        }
        const recovered = invokeWithoutWorkspace(
          executable,
          ['extract-relationships', 'committed', repository, revision, request],
          consumer,
        );
        expect(recovered.exitCode, recovered.stderr.toString()).toBe(0);
        expect(JSON.parse(recovered.stdout.toString())).toEqual(report);
      }
    }
  }, 120_000);

  test('prepares certified admission and the old activation refuses a newer commit', () => {
    const { consumer, executable } = installTarball(packedTarball);
    // Reproducible, so the golden ledger Dash wrote for this exact revision binds it.
    const fixture = createRelocationCandidate({ materializeModules: true, reproducible: true });
    const out = scratch('twilight-burokrat-activation-');
    const prepared = invoke(executable, preparationArguments(fixture, out), consumer);
    const output = `${prepared.stdout.toString()}${prepared.stderr.toString()}`;
    expect(prepared.exitCode, output).toBe(0);
    expect(output).toContain(`toolkit activation: ${fixture.candidateRevision}`);
    expect(output).toContain('"certified":true');

    const policyPath = join(fixture.repository, 'docs/wiki-policy/policy.json');
    const policy = JSON.parse(readFileSync(policyPath, 'utf8')) as {
      obligations: { checkIds: string[] }[];
    };
    policy.obligations[0].checkIds = [];
    write(policyPath, `${JSON.stringify(policy)}\n`);
    git(fixture.repository, ['add', '--all']);
    git(fixture.repository, ['commit', '--message', 'skip failed check after activation']);
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
    const repackedRoot = scratch('twilight-burokrat-tampered-package-');
    for (const name of ['package.json', 'README.md', 'NOTICE'] as const) {
      cpSync(join(packageSource, name), join(repackedRoot, name));
    }
    cpSync(join(packageSource, 'dist'), join(repackedRoot, 'dist'), { recursive: true });
    writeFileSync(join(repackedRoot, 'dist/toolkit/validator.mjs'), '\ncorrupted\n', { flag: 'a' });
    const destination = scratch('twilight-burokrat-tampered-pack-');
    await packPackage(repackedRoot, destination);
    const tamperedTarball = join(destination, 'twilight-burokrat-0.1.0.tgz');
    const { consumer, executable } = installTarball(tamperedTarball);
    const fixture = createRelocationCandidate();
    const out = scratch('twilight-burokrat-tampered-run-');
    const refused = invoke(executable, preparationArguments(fixture, out), consumer);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr.toString()).toContain(
      'toolkit role differs from toolkit.json: validator.mjs',
    );
  }, 300_000);

  test('installed execution refuses every invalid package-manifest state', () => {
    const { consumer, executable } = installTarball(packedTarball);
    const manifest = join(consumer, 'node_modules/twilight-burokrat/dist/package-manifest.json');
    const source = readFileSync(manifest);
    const invokeValidation = () =>
      invoke(executable, ['validate-record', 'benchmark-corpus', 'absent'], consumer);

    renameSync(manifest, `${manifest}.saved`);
    const missing = invokeValidation();
    expect(missing.exitCode).not.toBe(0);
    expect(missing.stderr.toString()).toContain('installed package manifest is unreadable');
    renameSync(`${manifest}.saved`, manifest);

    renameSync(manifest, `${manifest}.saved`);
    mkdirSync(manifest);
    const unreadable = invokeValidation();
    expect(unreadable.exitCode).not.toBe(0);
    expect(unreadable.stderr.toString()).toContain('installed package manifest is unreadable');
    rmSync(manifest, { recursive: true });
    renameSync(`${manifest}.saved`, manifest);

    writeFileSync(manifest, '{');
    const malformed = invokeValidation();
    expect(malformed.exitCode).not.toBe(0);
    expect(malformed.stderr.toString()).toContain('installed package manifest is malformed');

    writeFileSync(manifest, '{}\n');
    const invalid = invokeValidation();
    expect(invalid.exitCode).not.toBe(0);
    expect(invalid.stderr.toString()).toContain('installed package manifest is invalid');
    writeFileSync(manifest, source);
  }, 120_000);

  test('a self-consistent substituted toolkit is refused by the package identity', async () => {
    const repackedRoot = scratch('twilight-burokrat-substituted-toolkit-');
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
    const destination = scratch('twilight-burokrat-substituted-pack-');
    await packPackage(repackedRoot, destination);
    const { consumer, executable } = installTarball(
      join(destination, 'twilight-burokrat-0.1.0.tgz'),
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
    const out = scratch('twilight-burokrat-no-nx-');
    const refused = invoke(executable, preparationArguments(noNxFixture, out), consumer);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr.toString()).toContain('nx.json');
  }, 120_000);

  test('installed execution refuses runtime and compiler drift', () => {
    const bunDrift = installTarball(packedTarball);
    const bunInstalled = join(bunDrift.consumer, 'node_modules/twilight-burokrat');
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
    const compilerInstalled = join(compilerDrift.consumer, 'node_modules/twilight-burokrat');
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
      'node_modules/twilight-burokrat/dist/toolkit/trusted-node-modules/typescript',
    );
    renameSync(typescript, `${typescript}.real`);
    symlinkSync(`${typescript}.real`, typescript, 'dir');
    const refused = invoke(executable, ['validate-record', 'benchmark-corpus', 'absent'], consumer);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr.toString()).toContain('trusted node modules carry a non-regular entry');
  }, 120_000);

  test('installed preparation refuses a candidate target that reports skipped tests', () => {
    const { consumer, executable } = installTarball(packedTarball);
    const fixture = createRelocationCandidate({
      materializeModules: true,
      reproducible: true,
      skippingCheck: true,
    });
    const out = scratch('twilight-burokrat-skipping-check-');
    // The skip probe Dash ran for this revision reported `1 skip`; the installed judge refuses it.
    const refused = invoke(
      executable,
      preparationArguments(fixture, out, goldenCheckRuns.skipping),
      consumer,
    );
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr.toString()).toContain('check skipped work: check.fixture.module');
  }, 120_000);
});
