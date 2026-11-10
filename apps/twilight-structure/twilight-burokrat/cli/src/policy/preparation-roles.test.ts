import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import type { OnLoadCallback, OnResolveCallback, PluginBuilder, PluginConstraints } from 'bun';
import { afterAll, expect, it, spyOn } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';
import { readLintRuntime } from '../lint-runtime';
import { planBunToolkit } from './bun-release';
import { captureCommittedSource } from './committed-source';
import { materializeSource } from './materialized-source';
import { buildPreparationRoles } from './preparation-roles';
import { readPreparationSource } from './preparation-source';
import * as trustedModuleAuthority from './trusted-modules';
import { buildModuleNames, hashTrustedModules } from './trusted-modules';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function write(path: string, bytes: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}
function git(repository: string, ...argv: string[]) {
  const child = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...argv], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString().trim();
}
function checkout(root: string, name: string) {
  const repository = join(root, name);
  mkdirSync(repository);
  git(repository, 'init', '--initial-branch=main');
  git(repository, 'config', 'user.name', 'PUNI Source Build');
  git(repository, 'config', 'user.email', 'source-build@example.test');
  write(join(repository, '.bun-version'), Bun.version + '\n');
  write(
    join(repository, 'package.json'),
    JSON.stringify({
      name,
      type: 'module',
      devDependencies: { typescript: 'npm:@typescript/typescript6@6.0.2' },
    }),
  );
  write(
    join(repository, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@selected/value': ['./src/value.ts'] } },
    }),
  );
  write(join(repository, 'src/value.ts'), 'export const selected=' + JSON.stringify(name) + ';');
  write(
    join(repository, 'src/validator.ts'),
    'import{selected}from"@selected/value";import{dependency}from"@fixture/dependency";console.log("validator:"+selected+":"+dependency);',
  );
  write(
    join(repository, 'src/launcher.ts'),
    'import{selected}from"@selected/value";console.log("launcher:"+selected);',
  );
  write(
    join(repository, 'src/policy/snapshot-validator.ts'),
    'export const snapshotMarker=' + JSON.stringify('snapshotter:' + name) + ';',
  );
  git(repository, 'add', '--all');
  git(repository, 'commit', '-m', 'selected source');
  return { repository, revision: git(repository, 'rev-parse', 'HEAD') };
}
async function createFixture(
  options: {
    readonly macro?: boolean;
    readonly missingDependency?: boolean;
    readonly configure?: (repository: string, root: string) => void;
    readonly configureDependencies?: (closure: string) => void;
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'puni role source '));
  roots.push(root);
  const producer = checkout(root, 'producer-A'),
    candidate = checkout(root, 'selected-B'),
    toolkit = join(root, 'toolkit'),
    runtime = join(root, 'runtime');
  mkdirSync(toolkit);
  mkdirSync(runtime);
  if (options.macro === true) {
    write(
      join(candidate.repository, 'src/validator.ts'),
      'import{produce}from"./macro.ts" with {type:"macro"};console.log(produce());',
    );
    write(
      join(candidate.repository, 'src/macro.ts'),
      'import{writeFileSync}from"node:fs";export function produce(){writeFileSync(' +
        JSON.stringify(join(root, 'macro.executed')) +
        ',"executed");return "macro";}',
    );
    git(candidate.repository, 'add', '--all');
    git(candidate.repository, 'commit', '-m', 'captured macro');
    candidate.revision = git(candidate.repository, 'rev-parse', 'HEAD');
  }
  if (options.configure !== undefined) {
    options.configure(candidate.repository, root);
    git(candidate.repository, 'add', '--all');
    git(candidate.repository, 'commit', '-m', 'configured source');
    candidate.revision = git(candidate.repository, 'rev-parse', 'HEAD');
  }
  const closure = join(toolkit, 'trusted-node-modules');
  mkdirSync(closure);
  const workspace = resolve(import.meta.dir, '../../../../../..');
  cpSync(join(workspace, 'node_modules/typescript'), join(closure, 'typescript'), {
    recursive: true,
  });
  mkdirSync(join(closure, '@typescript'), { recursive: true });
  cpSync(join(workspace, 'node_modules/@typescript/old'), join(closure, '@typescript/old'), {
    recursive: true,
  });
  for (const name of ['source-map-support', 'source-map', 'buffer-from'])
    cpSync(join(workspace, 'node_modules', name), join(closure, name), { recursive: true });
  if (options.missingDependency !== true) {
    write(
      join(closure, '@fixture/dependency/package.json'),
      JSON.stringify({
        name: '@fixture/dependency',
        version: '1.0.0',
        type: 'module',
        exports: './index.js',
      }),
    );
    write(
      join(closure, '@fixture/dependency/index.js'),
      'export const dependency="authenticated";',
    );
  }
  options.configureDependencies?.(closure);
  const roleBytes = {
    'launcher.mjs': Buffer.from('export{};'),
    'snapshotter.ts': Buffer.from('export{};'),
    'validator.mjs': Buffer.from('export{};'),
    'prepare-activation.mjs': Buffer.from('export{};'),
    'prepare-relocation-activation.mjs': Buffer.from('export{};'),
  };
  for (const [name, bytes] of Object.entries(roleBytes)) writeFileSync(join(toolkit, name), bytes);
  const plan = planBunToolkit({
    tag: 'puni-v0.3.0',
    sourceRevision: 'a'.repeat(40),
    bunVersion: Bun.version,
    roleBytes,
    trustedNodeModules:
      options.missingDependency === true
        ? ['typescript', '@typescript/old', 'source-map-support', 'source-map', 'buffer-from']
        : [
            'typescript',
            '@typescript/old',
            'source-map-support',
            'source-map',
            'buffer-from',
            '@fixture/dependency',
          ],
    trustedNodeModulesIdentity: hashTrustedModules(closure),
  });
  writeFileSync(join(toolkit, 'toolkit.json'), plan.descriptor);
  const lookup = readLintRuntime('/usr/bin:/bin', runtime),
    subscribeInterrupts = () => () => undefined;
  const selection = await readPreparationSource(
    { candidateRepository: candidate.repository, candidateSha: candidate.revision },
    {
      callerDirectory: root,
      toolkitDirectory: toolkit,
      expectedToolkitIdentity: hashBytes(plan.descriptor),
      runtime: lookup,
      subscribeInterrupts,
    },
  );
  if (selection.kind !== 'ready') throw new Error('unexpected selection cancellation');
  const captured = await captureCommittedSource(candidate.revision, {
    repository: candidate.repository,
    runtime: lookup,
    subscribeInterrupts,
  });
  if (captured.kind !== 'captured') throw new Error('unexpected capture cancellation');
  const materialized = await materializeSource(captured.source, join(root, 'build-view'), {
    callerDirectory: root,
    selection,
    subscribeInterrupts,
  });
  if (materialized.kind !== 'materialized')
    throw new Error('unexpected materialization cancellation');
  return {
    root,
    producer,
    candidate,
    selection,
    source: captured.source,
    directory: materialized.directory,
    toolkit,
    context: {
      materializedDirectory: materialized.directory,
      toolkit: selection.toolkit,
      validatorEntry: 'src/validator.ts',
      launcherEntry: 'src/launcher.ts',
      subscribeInterrupts,
    },
  };
}
function runRole(root: string, role: string, bytes: Uint8Array, cwd: string) {
  const path = join(root, role + '.mjs');
  writeFileSync(path, bytes);
  const child = Bun.spawnSync([process.execPath, '--no-env-file', '--config=/dev/null', path], {
    cwd,
    env: { PATH: '/usr/bin:/bin' },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 10000,
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  return child.stdout.toString().trim();
}

it('builds selected checkout roles and aliases from captured B while live B changes', async () => {
  const fixture = await createFixture();
  writeFileSync(
    join(fixture.candidate.repository, 'src/value.ts'),
    'export const selected="LIVE-MUTATION";',
  );
  const built = await buildPreparationRoles(fixture.source, fixture.context);
  expect(built.kind).toBe('built');
  if (built.kind !== 'built') throw new Error('unexpected build cancellation');
  expect(runRole(fixture.root, 'validator', built.validator, fixture.producer.repository)).toBe(
    'validator:selected-B:authenticated',
  );
  expect(runRole(fixture.root, 'launcher', built.launcher, fixture.producer.repository)).toBe(
    'launcher:selected-B',
  );
  expect(Buffer.from(built.snapshotter).toString()).toContain('snapshotter:selected-B');
  expect(Buffer.from(built.launcher).toString()).not.toContain('producer-A');
}, 30000);

it('refuses a missing authenticated dependency instead of using ambient or candidate providers', async () => {
  const fixture = await createFixture({ missingDependency: true });
  write(
    join(fixture.candidate.repository, 'node_modules/@fixture/dependency/package.json'),
    JSON.stringify({ name: '@fixture/dependency', type: 'module', exports: './index.js' }),
  );
  write(
    join(fixture.candidate.repository, 'node_modules/@fixture/dependency/index.js'),
    'export const dependency="candidate-canary";',
  );
  write(
    join(fixture.root, 'node_modules/@fixture/dependency/package.json'),
    JSON.stringify({ name: '@fixture/dependency', type: 'module', exports: './index.js' }),
  );
  write(
    join(fixture.root, 'node_modules/@fixture/dependency/index.js'),
    'export const dependency="ambient-canary";',
  );
  const cause: unknown = await buildPreparationRoles(fixture.source, fixture.context).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(cause).toBeInstanceOf(Error);
  if (!(cause instanceof Error)) throw new Error('expected dependency refusal');
  expect(cause.message).toContain(
    'authenticated preparation dependency is absent: @fixture/dependency',
  );
}, 30000);

it('refuses a candidate macro before any bundler execution can create its sentinel', async () => {
  const fixture = await createFixture({ macro: true }),
    marker = join(fixture.root, 'macro.executed');
  const cause: unknown = await buildPreparationRoles(fixture.source, fixture.context).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(cause).toBeInstanceOf(Error);
  if (!(cause instanceof Error)) throw new Error('expected macro refusal');
  expect(cause.message).toContain('macro');
  expect(existsSync(marker)).toBe(false);
}, 30000);

it('builds B from a native caller in checkout A without adopting A aliases', async () => {
  const fixture = await createFixture(),
    snapshot = fixture.source.readSnapshot(),
    files = Object.fromEntries(
      snapshot.entries.map((entry) => [
        entry.path,
        Buffer.from(fixture.source.readFile(entry.path)).toString('base64'),
      ]),
    );
  const script = join(fixture.root, 'caller.mjs'),
    output = join(fixture.root, 'from-A-validator.mjs');
  writeFileSync(
    script,
    'import{writeFileSync}from"node:fs";import{buildPreparationRoles}from ' +
      JSON.stringify(join(import.meta.dir, 'preparation-roles.ts')) +
      ';import{readBunToolkit}from ' +
      JSON.stringify(join(import.meta.dir, 'toolkit.ts')) +
      ';const snapshot=' +
      JSON.stringify(snapshot) +
      ',files=' +
      JSON.stringify(files) +
      ';const source={readSnapshot:()=>structuredClone(snapshot),readFile:path=>Buffer.from(files[path],"base64")};const built=await buildPreparationRoles(source,{materializedDirectory:' +
      JSON.stringify(fixture.directory) +
      ',toolkit:readBunToolkit(' +
      JSON.stringify(fixture.toolkit) +
      '),validatorEntry:"src/validator.ts",launcherEntry:"src/launcher.ts",subscribeInterrupts:()=>()=>undefined});if(built.kind!=="built")throw new Error("unexpected caller cancellation");writeFileSync(' +
      JSON.stringify(output) +
      ',built.validator);console.log("built B");',
  );
  const child = Bun.spawnSync([process.execPath, '--no-env-file', '--config=/dev/null', script], {
    cwd: fixture.producer.repository,
    env: { PATH: '/usr/bin:/bin' },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 20000,
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(child.stdout.toString()).toContain('built B');
  const invocation = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', output],
    {
      cwd: fixture.producer.repository,
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  expect(invocation.exitCode, invocation.stderr.toString()).toBe(0);
  expect(invocation.stdout.toString().trim()).toBe('validator:selected-B:authenticated');
}, 30000);

it('preserves inherited source aliases through captured configuration', async () => {
  const fixture = await createFixture({
    configure: (repository) => {
      write(join(repository, 'tsconfig.json'), JSON.stringify({ extends: './config/base.json' }));
      write(
        join(repository, 'config/base.json'),
        JSON.stringify({
          compilerOptions: { baseUrl: '..', paths: { '@selected/value': ['src/value.ts'] } },
        }),
      );
    },
  });
  const built = await buildPreparationRoles(fixture.source, fixture.context);
  expect(built.kind).toBe('built');
  if (built.kind !== 'built') throw new Error('unexpected inherited alias cancellation');
  expect(runRole(fixture.root, 'inherited', built.validator, fixture.producer.repository)).toBe(
    'validator:selected-B:authenticated',
  );
}, 30000);

for (const fault of ['extends', 'alias'] as const) {
  it(
    'refuses a captured ' + fault + ' configuration escaping the selected build view',
    async () => {
      const fixture = await createFixture({
        configure: (repository, root) => {
          write(join(root, 'outside.json'), JSON.stringify({ compilerOptions: {} }));
          write(join(root, 'outside.ts'), 'export const selected="outside-canary";');
          write(
            join(repository, 'tsconfig.json'),
            JSON.stringify(
              fault === 'extends'
                ? { extends: '../outside.json' }
                : {
                    compilerOptions: {
                      baseUrl: '.',
                      paths: { '@selected/value': ['../outside.ts'] },
                    },
                  },
            ),
          );
        },
      });
      const cause: unknown = await buildPreparationRoles(fixture.source, fixture.context).then(
        () => undefined,
        (cause: unknown) => cause,
      );
      expect(cause).toBeInstanceOf(Error);
      if (!(cause instanceof Error)) throw new Error('expected escaped config refusal');
      expect(cause.message).toContain(
        fault === 'extends' ? 'configuration' : 'escapes selected view',
      );
    },
    30000,
  );
}

it('preserves import and require conditions for the same authenticated package', async () => {
  const fixture = await createFixture({
    configure: (repository) => {
      write(
        join(repository, 'src/validator.ts'),
        'import{dependency}from"@fixture/dependency";const other=require("@fixture/dependency");console.log("dual:"+dependency+":"+other.dependency);',
      );
    },
    configureDependencies: (closure) => {
      write(
        join(closure, '@fixture/dependency/package.json'),
        JSON.stringify({
          name: '@fixture/dependency',
          version: '1.0.0',
          type: 'module',
          exports: { import: './import.js', require: './require.cjs' },
        }),
      );
      write(join(closure, '@fixture/dependency/import.js'), 'export const dependency="import";');
      write(join(closure, '@fixture/dependency/require.cjs'), 'exports.dependency="require";');
    },
  });
  const built = await buildPreparationRoles(fixture.source, fixture.context);
  expect(built.kind).toBe('built');
  if (built.kind !== 'built') throw new Error('unexpected dual condition cancellation');
  expect(runRole(fixture.root, 'dual', built.validator, fixture.producer.repository)).toBe(
    'dual:import:require',
  );
}, 30000);

it('preserves captured class-field assignment semantics', async () => {
  const fixture = await createFixture({
    configure: (repository) => {
      write(
        join(repository, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: { '@selected/value': ['./src/value.ts'] },
            useDefineForClassFields: false,
            target: 'ESNext',
          },
        }),
      );
      write(
        join(repository, 'src/validator.ts'),
        'class Base{set field(value){console.log("setter:"+value)}}class Child extends Base{field=7;}new Child();',
      );
    },
  });
  const built = await buildPreparationRoles(fixture.source, fixture.context);
  expect(built.kind).toBe('built');
  if (built.kind !== 'built') throw new Error('unexpected field transform cancellation');
  expect(runRole(fixture.root, 'fields', built.validator, fixture.producer.repository)).toBe(
    'setter:7',
  );
}, 30000);

it('preserves a captured JSX factory instead of adopting producer defaults', async () => {
  const fixture = await createFixture({
    configure: (repository) => {
      write(
        join(repository, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: { '@selected/value': ['./src/value.ts'] },
            jsx: 'react',
            jsxFactory: 'render',
          },
        }),
      );
      write(
        join(repository, 'src/validator.tsx'),
        'function render(name){return "rendered:"+name;}console.log(<box/>);',
      );
    },
  });
  fixture.context.validatorEntry = 'src/validator.tsx';
  const built = await buildPreparationRoles(fixture.source, fixture.context);
  expect(built.kind).toBe('built');
  if (built.kind !== 'built') throw new Error('unexpected JSX transform cancellation');
  expect(runRole(fixture.root, 'jsx', built.validator, fixture.producer.repository)).toBe(
    'rendered:box',
  );
}, 30000);

it('refuses an opaque runtime import rather than claiming a closed build', async () => {
  const fixture = await createFixture({
    configure: (repository) => {
      write(
        join(repository, 'src/validator.ts'),
        'const selected=process.env.PUNI_SELECTED_MODULE;console.log(await import(selected));',
      );
    },
  });
  const cause: unknown = await buildPreparationRoles(fixture.source, fixture.context).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(cause).toBeInstanceOf(Error);
  if (!(cause instanceof Error)) throw new Error('expected opaque loader refusal');
  expect(cause.message).toContain('preparation refuses an opaque first-party runtime loader');
}, 30000);

it('declares Optique and the actual compiler in the authenticated current build roster', () => {
  const workspace = resolve(import.meta.dir, '../../../../../..');
  const names = buildModuleNames(join(workspace, 'node_modules'));
  expect(names).toContain('@optique/core');
  expect(names).toContain('@optique/run');
  for (const name of [
    'source-map-support',
    'parse5',
    'mdast-util-from-markdown',
    'mdast-util-to-string',
    'unist-util-visit',
  ])
    expect(names).toContain(name);
  expect(names).toContain('typescript');
  expect(names).toContain('@typescript/old');
  expect(names).toContain('source-map-support');
  for (const name of [
    'parse5',
    'mdast-util-from-markdown',
    'mdast-util-to-string',
    'unist-util-visit',
  ])
    expect(names).toContain(name);
});

it('records the pinned compiler plugin denial and delivers its notices', async () => {
  const fixture = await createFixture({
    configure: (repository) => {
      write(
        join(repository, 'src/validator.ts'),
        'import ts from"typescript";console.log("compiler:"+ts.version);',
      );
    },
  });
  const built = await buildPreparationRoles(fixture.source, fixture.context);
  expect(built.kind).toBe('built');
  if (built.kind !== 'built') throw new Error('unexpected compiler build cancellation');
  expect(built.compilerTransforms.length).toBe(1);
  expect(built.compilerTransforms[0]?.kind).toBe('language-service-plugins-disabled');
  expect(built.notices.map((notice) => notice.path)).toEqual([
    'licenses/typescript-preparation/LICENSE.txt',
    'licenses/typescript-preparation/NOTICE',
  ]);
  expect(runRole(fixture.root, 'compiler', built.validator, fixture.producer.repository)).toBe(
    'compiler:6.0.3',
  );
}, 30000);

for (const alias of [false, true]) {
  it(
    'refuses ' +
      (alias ? 'an aliased' : 'a direct') +
      ' first-party opaque loader alongside the admitted compiler',
    async () => {
      const fixture = await createFixture({
        configure: (repository) => {
          write(
            join(repository, 'src/validator.ts'),
            'import ts from"typescript";console.log(ts.version);' +
              (alias
                ? 'const load=require;load(process.env.PUNI_SELECTED_MODULE);'
                : 'const selected=process.env.PUNI_SELECTED_MODULE;await import(selected);'),
          );
        },
      });
      const cause: unknown = await buildPreparationRoles(fixture.source, fixture.context).then(
        () => undefined,
        (cause: unknown) => cause,
      );
      expect(cause).toBeInstanceOf(Error);
      if (!(cause instanceof Error)) throw new Error('expected first-party loader refusal');
      expect(cause.message).toContain('first-party');
    },
    30000,
  );
}

it('returns prior role-build cancellation before resolving absent materialization', async () => {
  const fixture = await createFixture();
  let released = false;
  expect(
    await buildPreparationRoles(fixture.source, {
      ...fixture.context,
      materializedDirectory: join(fixture.root, 'absent-materialization'),
      subscribeInterrupts: (listener) => {
        listener('SIGTERM');
        return () => {
          released = true;
        };
      },
    }),
  ).toEqual({ kind: 'cancelled', status: 143 });
  expect(released).toBe(true);
}, 30000);

it('awaits the actual in-process build after interruption and starts no later role', async () => {
  const fixture = await createFixture();
  const entered = Promise.withResolvers<undefined>(),
    finish = Promise.withResolvers<undefined>();
  const original = Bun.build.bind(Bun);
  let calls = 0,
    released = false,
    settled = false;
  let interrupt: ((signal: 'SIGINT' | 'SIGTERM') => void) | undefined;
  const build = spyOn(Bun, 'build').mockImplementation(async (options) => {
    calls++;
    const built = await original(options);
    entered.resolve(undefined);
    await finish.promise;
    return built;
  });
  const pending = buildPreparationRoles(fixture.source, {
    ...fixture.context,
    subscribeInterrupts: (listener) => {
      interrupt = listener;
      return () => {
        released = true;
      };
    },
  });
  void pending.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  try {
    await entered.promise;
    if (interrupt === undefined) throw new Error('build subscription was not installed');
    interrupt('SIGINT');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
    expect(released).toBe(false);
    expect(calls).toBe(1);
    finish.resolve(undefined);
    expect(await pending).toEqual({ kind: 'cancelled', status: 130 });
    expect(calls).toBe(1);
    expect(released).toBe(true);
  } finally {
    finish.resolve(undefined);
    await pending;
    build.mockRestore();
  }
}, 30000);

it('preserves build and subscription release failures ahead of recorded interruption', async () => {
  const fixture = await createFixture();
  const operation = new Error('injected build failure'),
    release = new Error('injected build release failure');
  let interrupt: ((signal: 'SIGINT' | 'SIGTERM') => void) | undefined;
  const build = spyOn(Bun, 'build').mockImplementation(async () => {
    if (interrupt === undefined) throw new Error('missing build subscription');
    interrupt('SIGTERM');
    await Promise.resolve();
    throw operation;
  });
  try {
    const cause: unknown = await buildPreparationRoles(fixture.source, {
      ...fixture.context,
      subscribeInterrupts: (listener) => {
        interrupt = listener;
        return () => {
          throw release;
        };
      },
    }).then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(cause).toBeInstanceOf(AggregateError);
    if (!(cause instanceof AggregateError)) throw new Error('missing aggregated build failure');
    expect(cause.errors).toEqual([operation, release]);
    expect(cause.cause).toBe(release);
  } finally {
    build.mockRestore();
  }
}, 30000);

it('honors the first interruption delivered during terminal build subscription release', async () => {
  const fixture = await createFixture();
  expect(
    await buildPreparationRoles(fixture.source, {
      ...fixture.context,
      subscribeInterrupts: (listener) => () => {
        listener('SIGTERM');
        listener('SIGINT');
      },
    }),
  ).toEqual({ kind: 'cancelled', status: 143 });
}, 30000);

it('uses captured source and dependency bytes after their materialized files change during build', async () => {
  const fixture = await createFixture();
  const original = Bun.build.bind(Bun);
  let changed = false;
  const build = spyOn(Bun, 'build').mockImplementation(async (options) => {
    if (!changed) {
      changed = true;
      writeFileSync(
        join(fixture.directory, 'src/value.ts'),
        'export const selected="changed-after-capture";',
      );
      writeFileSync(
        join(fixture.directory, 'node_modules/@fixture/dependency/index.js'),
        'export const dependency="changed-after-capture";',
      );
    }
    return original(options);
  });
  try {
    const built = await buildPreparationRoles(fixture.source, fixture.context);
    if (built.kind !== 'built') throw new Error('unexpected captured build cancellation');
    expect(changed).toBe(true);
    expect(
      runRole(fixture.root, 'captured-validator', built.validator, fixture.producer.repository),
    ).toBe('validator:selected-B:authenticated');
    expect(
      runRole(fixture.root, 'captured-launcher', built.launcher, fixture.producer.repository),
    ).toBe('launcher:selected-B');
  } finally {
    build.mockRestore();
  }
}, 30000);

for (const fault of ['import', 'load'] as const) {
  it(
    'refuses an unplanned sealed ' + fault + ' requested by the actual Bun bundler',
    async () => {
      const fixture = await createFixture();
      const original = Bun.build.bind(Bun);
      const build = spyOn(Bun, 'build').mockImplementation(async (options) => {
        const plugins = options.plugins?.map((plugin) => ({
          ...plugin,
          setup(builder: PluginBuilder) {
            const proxy = new Proxy(builder, {
              get(target, name, receiver) {
                if (fault === 'import' && name === 'onLoad')
                  return (constraints: PluginConstraints, callback: OnLoadCallback) =>
                    target.onLoad(constraints, async (args) => {
                      const loaded = await callback(args);
                      if (
                        args.path.endsWith('/src/validator.ts') &&
                        loaded !== undefined &&
                        'contents' in loaded
                      )
                        return {
                          ...loaded,
                          contents:
                            'import "./unplanned.ts";\n' +
                            (typeof loaded.contents === 'string'
                              ? loaded.contents
                              : new TextDecoder('utf-8', { fatal: true }).decode(loaded.contents)),
                        };
                      return loaded;
                    });
                if (fault === 'load' && name === 'onResolve')
                  return (constraints: PluginConstraints, callback: OnResolveCallback) =>
                    target.onResolve(constraints, async (args) => {
                      const resolved = await callback(args);
                      if (args.kind === 'entry-point-build' && resolved !== undefined)
                        return { ...resolved, path: join(fixture.directory, 'src/uncaptured.ts') };
                      return resolved;
                    });
                const member: unknown = Reflect.get(target, name, receiver);
                return member;
              },
            });
            return plugin.setup(proxy);
          },
        }));
        return original({ ...options, plugins });
      });
      try {
        const cause: unknown = await buildPreparationRoles(fixture.source, fixture.context).then(
          () => undefined,
          (failure: unknown) => failure,
        );
        expect(cause).toBeInstanceOf(Error);
        if (!(cause instanceof Error)) throw new Error('missing sealed loader refusal');
        expect(
          cause instanceof AggregateError ? cause.errors.map(String).join('\n') : String(cause),
        ).toContain(
          fault === 'import'
            ? 'preparation bundler requested unplanned import: ./unplanned.ts'
            : 'preparation bundler requested uncaptured bytes:',
        );
      } finally {
        build.mockRestore();
      }
    },
    30000,
  );
}

async function expectBuildRefusal(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  message: string,
) {
  const cause: unknown = await buildPreparationRoles(fixture.source, fixture.context).then(
    () => undefined,
    (failure: unknown) => failure,
  );
  expect(cause).toBeInstanceOf(Error);
  if (!(cause instanceof Error)) throw new Error('missing build refusal');
  expect(cause.message).toContain(message);
}

it('refuses captured node_modules before copying any preparation dependencies', async () => {
  const fixture = await createFixture({
    configure: (repository) => {
      write(join(repository, 'node_modules/poison.ts'), 'export{};');
    },
  });
  await expectBuildRefusal(
    fixture,
    'captured node_modules is not preparation dependency authority',
  );
  expect(existsSync(join(fixture.directory, 'node_modules'))).toBe(true);
}, 30000);

it('refuses authenticated compiler metadata that differs from the producer compiler', async () => {
  const fixture = await createFixture({
    configureDependencies: (closure) => {
      const path = join(closure, '@typescript/old/package.json');
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      manifest['version'] = '0.0.0';
      writeFileSync(path, JSON.stringify(manifest));
    },
  });
  await expectBuildRefusal(fixture, 'preparation compiler differs from producer TypeScript');
}, 30000);

it('refuses a changed selected toolkit identity before copying dependencies', async () => {
  const fixture = await createFixture();
  fixture.context.toolkit = { ...fixture.context.toolkit, digest: 'f'.repeat(64) };
  await expectBuildRefusal(fixture, 'preparation toolkit identity changed before build');
  expect(existsSync(join(fixture.directory, 'node_modules'))).toBe(false);
}, 30000);

it('refuses changed dependency copy bytes before building executable roles', async () => {
  const fixture = await createFixture();
  const original = trustedModuleAuthority.copyTrustedModules;
  const copy = spyOn(trustedModuleAuthority, 'copyTrustedModules').mockImplementation(
    (destination, origin, names) => {
      original(destination, origin, names);
      writeFileSync(
        join(destination, '@fixture/dependency/index.js'),
        'export const dependency="copied-drift";',
      );
    },
  );
  try {
    await expectBuildRefusal(fixture, 'preparation build dependency copy differs from toolkit');
  } finally {
    copy.mockRestore();
  }
}, 30000);

it('refuses an executable role selected from authenticated dependencies', async () => {
  const fixture = await createFixture({
    configureDependencies: (closure) => {
      write(join(closure, '@fixture/dependency/policy/snapshot-validator.ts'), 'export{};');
    },
  });
  fixture.context.validatorEntry = 'node_modules/@fixture/dependency/index.js';
  await expectBuildRefusal(
    fixture,
    'preparation executable role must be selected first-party source',
  );
}, 30000);

it('refuses an uncaptured generated source file appearing in the materialized view', async () => {
  const fixture = await createFixture({
    configure: (repository) => {
      write(
        join(repository, 'src/validator.ts'),
        'import{generated}from"./generated.ts";console.log(generated);',
      );
    },
  });
  write(join(fixture.directory, 'src/generated.ts'), 'export const generated="unreviewed";');
  await expectBuildRefusal(
    fixture,
    'preparation build requested uncaptured source: src/generated.ts',
  );
}, 30000);

it('refuses preserved JSX instead of silently changing candidate runtime semantics', async () => {
  const fixture = await createFixture({
    configure: (repository) => {
      write(
        join(repository, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            jsx: 'preserve',
            baseUrl: '.',
            paths: { '@selected/value': ['./src/value.ts'] },
          },
        }),
      );
      write(
        join(repository, 'src/validator.ts'),
        'import{view}from"./view.tsx";console.log(view);',
      );
      write(join(repository, 'src/view.tsx'), 'export const view=<section/>;');
    },
  });
  await expectBuildRefusal(fixture, 'preparation build does not support preserved JSX transforms:');
}, 30000);

for (const fault of ['unsuccessful', 'empty', 'multiple', 'disappeared'] as const) {
  it(
    'refuses ' + fault + ' role build output after actual Bun build settlement',
    async () => {
      const fixture = await createFixture();
      const original = Bun.build.bind(Bun);
      const build = spyOn(Bun, 'build').mockImplementation(async (options) => {
        const built = await original(options);
        if (fault === 'unsuccessful') return { ...built, success: false };
        if (fault === 'empty') return { ...built, outputs: [] };
        if (fault === 'multiple')
          return { ...built, outputs: [...built.outputs, ...built.outputs] };
        return {
          ...built,
          outputs: new Proxy(built.outputs, {
            get(target, name, receiver) {
              if (name === 'at') return () => undefined;
              const member: unknown = Reflect.get(target, name, receiver);
              return member;
            },
          }),
        };
      });
      try {
        await expectBuildRefusal(
          fixture,
          fault === 'disappeared'
            ? 'preparation role build output disappeared'
            : 'preparation role build failed:',
        );
      } finally {
        build.mockRestore();
      }
    },
    30000,
  );
}

it('refuses an authenticated vendor importing captured first-party source inside the view', async () => {
  const fixture = await createFixture({
    configureDependencies: (closure) => {
      write(
        join(closure, '@fixture/dependency/index.js'),
        'import{selected}from"../../../src/value.ts";export const dependency=selected;',
      );
    },
  });
  await expectBuildRefusal(
    fixture,
    'preparation dependency imports first-party source: ../../../src/value.ts',
  );
}, 30000);

for (const field of ['baseUrl', 'rootDirs', 'typeRoots'] as const) {
  it(
    'refuses an unused external captured configuration ' + field + ' root',
    async () => {
      const fixture = await createFixture({
        configure: (repository, root) => {
          const compilerOptions = {
            baseUrl: '.',
            paths: { '@selected/value': ['./src/value.ts'] },
            [field]: field === 'baseUrl' ? root : [root],
          };
          write(join(repository, 'tsconfig.json'), JSON.stringify({ compilerOptions }));
        },
      });
      await expectBuildRefusal(fixture, 'preparation build path escapes selected view:');
    },
    30000,
  );
}

it('refuses captured TypeScript transform diagnostics before invoking Bun build', async () => {
  const fixture = await createFixture({
    configure: (repository) => {
      write(join(repository, 'src/validator.ts'), 'export const broken = ;');
    },
  });
  const original = Bun.build.bind(Bun);
  const build = spyOn(Bun, 'build').mockImplementation(original);
  try {
    await expectBuildRefusal(fixture, 'preparation source transform failed:');
    expect(build).not.toHaveBeenCalled();
  } finally {
    build.mockRestore();
  }
}, 30000);

it('delivers the producer Bun pin and one protected launcher hashbang in selected roles', async () => {
  const fixture = await createFixture({
    configure: (repository) => {
      write(
        join(repository, 'src/validator.ts'),
        'declare const __PUNI_LINT_BUN_VERSION__:string;console.log(__PUNI_LINT_BUN_VERSION__);',
      );
      write(
        join(repository, 'src/launcher.ts'),
        '#!/usr/bin/env bun\nconsole.log("source launcher");',
      );
    },
  });
  const built = await buildPreparationRoles(fixture.source, fixture.context);
  if (built.kind !== 'built') throw new Error('unexpected pinned build cancellation');
  expect(
    runRole(fixture.root, 'pinned-validator', built.validator, fixture.producer.repository),
  ).toBe(Bun.version);
  expect(
    runRole(fixture.root, 'pinned-launcher', built.launcher, fixture.producer.repository),
  ).toBe('source launcher');
  const launcher = Buffer.from(built.launcher).toString();
  expect(launcher.startsWith('#!/usr/bin/env -S -u BUN_OPTIONS')).toBe(true);
  expect(launcher.match(/^#!/gmu)?.length).toBe(1);
}, 30000);
