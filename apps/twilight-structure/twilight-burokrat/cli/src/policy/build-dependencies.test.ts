import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { readLintRuntime } from '../lint-runtime';
import { readBuildDependencies } from './build-dependencies';
import { captureCommittedSource } from './committed-source';
import { copyTrustedModules, hashTrustedModules } from './trusted-modules';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const workspace = resolve(import.meta.dir, '../../../../../..');
function git(repository: string, args: string[]): string {
  const child = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString().trim();
}
async function createFixture(
  change?: string,
  authority?: { readonly manifest: unknown; readonly pin?: string },
) {
  const root = mkdtempSync(join(tmpdir(), 'puni build dependency authority '));
  roots.push(root);
  const repository = join(root, 'selected'),
    runtime = join(root, 'runtime');
  mkdirSync(repository);
  mkdirSync(runtime);
  for (const path of ['package.json', 'bun.lock', '.bun-version']) {
    const bytes =
      path === 'package.json' && authority !== undefined
        ? Buffer.from(JSON.stringify(authority.manifest))
        : path === '.bun-version' && authority?.pin !== undefined
          ? Buffer.from(authority.pin)
          : readFileSync(join(workspace, path));
    writeFileSync(
      join(repository, path),
      change === path ? Buffer.concat([bytes, Buffer.from('\n')]) : bytes,
    );
  }
  git(repository, ['init', '--initial-branch=main']);
  git(repository, ['config', 'user.name', 'PUNI dependency authority']);
  git(repository, ['config', 'user.email', 'dependency@example.test']);
  git(repository, ['add', '--all']);
  git(repository, ['commit', '-m', 'selected authority inputs']);
  const captured = await captureCommittedSource(git(repository, ['rev-parse', 'HEAD']), {
    repository,
    runtime: readLintRuntime('/usr/bin:/bin', runtime),
    subscribeInterrupts: () => () => undefined,
  });
  if (captured.kind !== 'captured') throw new Error('unexpected dependency capture cancellation');
  return { root, source: captured.source };
}

it('binds selected build dependencies to matching captured authority and actual copied bytes', async () => {
  const fixture = await createFixture(),
    dependencies = readBuildDependencies(fixture.source, workspace);
  expect(dependencies.bunVersion).toBe(Bun.version);
  expect(dependencies.compilerVersion).toBe('6.0.3');
  expect(dependencies.names).toContain('@optique/run');
  expect(dependencies.names).toContain('@typescript/old');
  const closure = join(fixture.root, 'copied-closure');
  copyTrustedModules(closure, dependencies.directory, dependencies.names);
  expect(hashTrustedModules(closure)).toBe(dependencies.identity);
  expect(dependencies.protectedPaths).toContain(workspace);
});

for (const path of ['package.json', 'bun.lock', '.bun-version']) {
  it('refuses a build installation whose ' + path + ' differs from the capture', async () => {
    const fixture = await createFixture(path);
    expect(() => readBuildDependencies(fixture.source, workspace)).toThrow(
      'build installation authority differs from capture: ' + path,
    );
  });
}

it('refuses absent trusted build authority instead of discovering another installation', async () => {
  const fixture = await createFixture();
  expect(() =>
    readBuildDependencies(fixture.source, join(fixture.root, 'absent-installation')),
  ).toThrow();
});

function selectInstallation(fixture: Awaited<ReturnType<typeof createFixture>>) {
  const installation = join(fixture.root, 'trusted-installation');
  mkdirSync(installation);
  for (const path of ['package.json', 'bun.lock', '.bun-version'])
    writeFileSync(join(installation, path), fixture.source.readFile(path));
  symlinkSync(join(workspace, 'node_modules'), join(installation, 'node_modules'));
  return installation;
}

for (const manifest of [
  null,
  [],
  { devDependencies: null },
  { devDependencies: [] },
  { devDependencies: 'invalid' },
  { devDependencies: { typescript: 17 } },
]) {
  it(
    'refuses matching but malformed trusted compiler authority ' + JSON.stringify(manifest),
    async () => {
      const fixture = await createFixture(undefined, { manifest }),
        installation = selectInstallation(fixture);
      expect(() => readBuildDependencies(fixture.source, installation)).toThrow(
        manifest === null || Array.isArray(manifest)
          ? 'build installation manifest is malformed'
          : typeof manifest.devDependencies === 'object' &&
              manifest.devDependencies !== null &&
              !Array.isArray(manifest.devDependencies)
            ? 'build installation TypeScript pin is malformed'
            : 'build installation dependency map is malformed',
      );
    },
  );
}
it('retains the fixed compiler pin refusal for matching authority with no TypeScript pin', async () => {
  const fixture = await createFixture(undefined, { manifest: {} }),
    installation = selectInstallation(fixture);
  expect(() => readBuildDependencies(fixture.source, installation)).toThrow(
    'checkout pins no typescript dependency',
  );
});
it('retains the runtime pin refusal for matching authority built for another Bun', async () => {
  const fixture = await createFixture(undefined, {
      manifest: { devDependencies: { typescript: '6.0.2' } },
      pin: '0.0.0\n',
    }),
    installation = selectInstallation(fixture);
  expect(() => readBuildDependencies(fixture.source, installation)).toThrow(
    'operator Bun differs from .bun-version',
  );
});
it('admits the dependencies compiler pin when devDependencies does not claim TypeScript', async () => {
  const fixture = await createFixture(undefined, {
      manifest: { devDependencies: {}, dependencies: { typescript: '6.0.2' } },
    }),
    installation = selectInstallation(fixture);
  expect(readBuildDependencies(fixture.source, installation).compilerVersion).toBe('6.0.3');
});
for (const manifest of [null, 17, {}, { version: 17 }]) {
  it(
    'refuses malformed installed TypeScript proxy version ' + JSON.stringify(manifest),
    async () => {
      const fixture = await createFixture(),
        installation = selectInstallation(fixture),
        modules = join(installation, 'node_modules');
      rmSync(modules);
      mkdirSync(join(modules, 'typescript'), { recursive: true });
      writeFileSync(join(modules, 'typescript/package.json'), JSON.stringify(manifest));
      expect(() => readBuildDependencies(fixture.source, installation)).toThrow(
        'build dependency version is malformed',
      );
    },
  );
}
it('refuses an installed compiler version different from the producer before roster expansion', async () => {
  const fixture = await createFixture(),
    installation = selectInstallation(fixture),
    modules = join(installation, 'node_modules');
  rmSync(modules);
  mkdirSync(join(modules, 'typescript'), { recursive: true });
  mkdirSync(join(modules, '@typescript/old'), { recursive: true });
  writeFileSync(join(modules, 'typescript/package.json'), JSON.stringify({ version: '6.0.2' }));
  writeFileSync(
    join(modules, '@typescript/old/package.json'),
    JSON.stringify({ version: '0.0.0' }),
  );
  expect(() => readBuildDependencies(fixture.source, installation)).toThrow(
    'build compiler differs from producer TypeScript',
  );
});
it('refuses a regular file selected as the trusted installation with its named boundary', async () => {
  const fixture = await createFixture(),
    installation = join(fixture.root, 'not-a-directory');
  writeFileSync(installation, 'installed-file');
  expect(() => readBuildDependencies(fixture.source, installation)).toThrow(
    'build installation must be a directory',
  );
});
it('refuses a regular file selected as the trusted node_modules with its named boundary', async () => {
  const fixture = await createFixture(),
    installation = selectInstallation(fixture),
    modules = join(installation, 'node_modules');
  rmSync(modules);
  writeFileSync(modules, 'installed-file');
  expect(() => readBuildDependencies(fixture.source, installation)).toThrow(
    'build dependencies must be a directory',
  );
});
