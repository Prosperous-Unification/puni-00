import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { discoverConsumers } from './consumers';
import { checkInventory } from './inventory';
import { readWorkspace } from './workspace';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni script consumer fields '));
  roots.push(root);
  const initialized = Bun.spawnSync(['/usr/bin/git', 'init', '--quiet', root], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(initialized.exitCode).toBe(0);
  function write(path: string, contents: string) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return { root, write, discover: () => discoverConsumers(readWorkspace(root)) };
}
function findSite(
  sites: ReturnType<typeof discoverConsumers>,
  source: string,
  property: readonly (string | number)[],
) {
  const site = sites.find(
    (candidate) =>
      candidate.source === source &&
      candidate.location.kind === 'property' &&
      JSON.stringify(candidate.location.path) === JSON.stringify(property),
  );
  if (site === undefined)
    throw new Error('site missing ' + source + ' ' + JSON.stringify(property));
  return site;
}

it('discovers package scripts and bin without using a declaration list or filename extension filter', () => {
  const f = createFixture();
  f.write(
    'nested/package.json',
    JSON.stringify({
      scripts: { start: 'bun ./program.unknown', legacy: 'node ./program.unknown' },
      bin: { operator: './program.unknown' },
    }),
  );
  f.write('nested/program.unknown', 'console.log("program");');
  const sites = f.discover(),
    start = findSite(sites, 'nested/package.json', ['scripts', 'start']);
  expect(start.body).toEqual({ kind: 'command', text: 'bun ./program.unknown' });
  expect(start.observedRuntime).toBe('bun');
  expect(start.invocation).toEqual({ kind: 'argv', argv: ['bun', './program.unknown'] });
  expectContains(start.targets, {
    usage: 'program',
    kind: 'file',
    path: 'nested/program.unknown',
    sha256: matchString(),
  });
  expect(findSite(sites, 'nested/package.json', ['scripts', 'legacy']).observedRuntime).toBe(
    'node',
  );
  expectContains(findSite(sites, 'nested/package.json', ['bin', 'operator']).targets, {
    usage: 'program',
    kind: 'file',
    path: 'nested/program.unknown',
    sha256: matchString(),
  });
});
it('surfaces executable unknown files and shebang programs independently of consumer declarations', () => {
  const f = createFixture();
  f.write('new/unknown.extension', '#!/usr/bin/env bun\nconsole.log("hello");');
  const sites = f.discover();
  expectContains(
    sites,
    matchSubset({
      source: 'new/unknown.extension',
      location: { kind: 'file' },
      kind: 'entrypoint',
      observedRuntime: 'bun',
    }),
  );
});
it('keeps quoted compound dynamic and interpreter inline invocations explicit unresolved boundaries', () => {
  const f = createFixture();
  f.write(
    'package.json',
    JSON.stringify({
      scripts: {
        quoted: 'bun "path with spaces.ts"',
        compound: 'bun first.ts && bun second.ts',
        dynamic: 'bun $SELECTED',
        inline: 'node -e console.log(1)',
        wrapped: 'env bun ./program.ts',
        indirect: 'bun run missing-script',
      },
    }),
  );
  f.write('program.ts', 'program');
  const sites = f.discover();
  for (const key of ['quoted', 'compound', 'dynamic', 'inline', 'wrapped', 'indirect'])
    expect(findSite(sites, 'package.json', ['scripts', key]).resolution.kind).toBe('unresolved');
});
it('retains ignored missing outside and symlink targets as boundaries instead of silently dropping their consumer', () => {
  const f = createFixture();
  f.write('.gitignore', 'ignored/\n');
  f.write('ignored/program.ts', 'hidden');
  f.write(
    'package.json',
    JSON.stringify({
      scripts: {
        ignored: 'bun ./ignored/program.ts',
        missing: 'bun ./missing.ts',
        outside: 'bun ../outside.ts',
      },
    }),
  );
  const sites = f.discover();
  expectContains(findSite(sites, 'package.json', ['scripts', 'ignored']).targets, {
    usage: 'program',
    kind: 'unavailable',
    path: 'ignored/program.ts',
    reason: 'missing-or-ignored',
  });
  expect(findSite(sites, 'package.json', ['scripts', 'missing']).resolution.kind).toBe(
    'unresolved',
  );
  expectContains(
    findSite(sites, 'package.json', ['scripts', 'outside']).targets,
    matchSubset({ kind: 'outside' }),
  );
});
it('collects project commands object forms and configuration overrides with explicit inherited context layers', () => {
  const f = createFixture();
  f.write(
    'tools/example/project.json',
    JSON.stringify({
      targets: {
        verify: {
          executor: 'nx:run-commands',
          options: {
            cwd: 'tools/example',
            env: { MODE: 'base' },
            commands: [{ command: 'bun ./base.xyz', forwardAllArgs: false }],
          },
          configurations: { strict: { cwd: 'tools/strict', command: 'bun ./strict.xyz' } },
        },
      },
    }),
  );
  f.write('tools/example/base.xyz', 'base');
  f.write('tools/strict/strict.xyz', 'strict');
  const sites = f.discover(),
    base = findSite(sites, 'tools/example/project.json', [
      'targets',
      'verify',
      'options',
      'commands',
      0,
      'command',
    ]),
    strict = findSite(sites, 'tools/example/project.json', [
      'targets',
      'verify',
      'configurations',
      'strict',
      'command',
    ]);
  expectContains(base.targets, matchSubset({ kind: 'file', path: 'tools/example/base.xyz' }));
  expectContains(strict.targets, matchSubset({ kind: 'file', path: 'tools/strict/strict.xyz' }));
  expect(strict.context.length).toBeGreaterThan(1);
  expectContains(strict.context, matchSubset({ settings: matchSubset({ env: { MODE: 'base' } }) }));
});
it('discovers embedded package Nx targets and root targetDefaults instead of assuming only project.json', () => {
  const f = createFixture();
  f.write(
    'package.json',
    JSON.stringify({
      nx: {
        targets: {
          check: { executor: 'nx:run-commands', options: { command: 'bun ./check.xyz' } },
        },
      },
    }),
  );
  f.write(
    'nx.json',
    JSON.stringify({
      targetDefaults: { build: { options: { command: 'bun {projectRoot}/build.xyz' } } },
    }),
  );
  f.write('check.xyz', 'check');
  const sites = f.discover();
  expect(
    findSite(sites, 'package.json', ['nx', 'targets', 'check', 'options', 'command'])
      .observedRuntime,
  ).toBe('bun');
  expect(
    findSite(sites, 'nx.json', ['targetDefaults', 'build', 'options', 'command']).resolution.kind,
  ).toBe('unresolved');
});
it('discovers workflow run uses and referenced local composite run bodies in dot directories', () => {
  const f = createFixture();
  f.write(
    '.github/workflows/nested/ci.yml',
    'name: CI\non: push\ndefaults:\n  run:\n    working-directory: tools\njobs:\n  build:\n    runs-on: ubuntu-latest\n    env:\n      MODE: safe\n    steps:\n      - run: bun ./first.xyz\n      - uses: ./.github/actions/local\n',
  );
  f.write(
    '.github/actions/local/action.yml',
    'name: Local\ndescription: fixture\nruns:\n  using: composite\n  steps:\n    - shell: bash\n      run: bun ./second.xyz\n      working-directory: tools\n',
  );
  f.write('tools/first.xyz', 'first');
  f.write('tools/second.xyz', 'second');
  const sites = f.discover(),
    run = findSite(sites, '.github/workflows/nested/ci.yml', ['jobs', 'build', 'steps', 0, 'run']),
    local = findSite(sites, '.github/actions/local/action.yml', ['runs', 'steps', 0, 'run']);
  expectContains(run.targets, matchSubset({ path: 'tools/first.xyz', kind: 'file' }));
  expectContains(run.context, matchSubset({ settings: matchSubset({ env: { MODE: 'safe' } }) }));
  expect(
    findSite(sites, '.github/workflows/nested/ci.yml', ['jobs', 'build', 'steps', 1, 'uses']).kind,
  ).toBe('reference');
  expectContains(local.targets, matchSubset({ path: 'tools/second.xyz', kind: 'file' }));
});
it('surfaces reusable workflows and Node or Docker local actions as explicit execution boundaries', () => {
  const f = createFixture();
  f.write(
    '.github/workflows/ci.yml',
    'on: push\njobs:\n  reuse:\n    uses: ./.github/workflows/reusable.yml\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ./.github/actions/node\n      - uses: ./.github/actions/docker\n',
  );
  f.write('.github/workflows/reusable.yml', 'on: workflow_call\njobs: {}\n');
  f.write(
    '.github/actions/node/action.yml',
    'name: Node\nruns:\n  using: node20\n  main: main.xyz\n  post: cleanup.xyz\n',
  );
  f.write('.github/actions/node/main.xyz', 'main');
  f.write('.github/actions/node/cleanup.xyz', 'cleanup');
  f.write(
    '.github/actions/docker/action.yml',
    'name: Docker\nruns:\n  using: docker\n  image: Dockerfile\n',
  );
  f.write('.github/actions/docker/Dockerfile', 'FROM scratch\n');
  const sites = f.discover();
  expect(findSite(sites, '.github/workflows/ci.yml', ['jobs', 'reuse', 'uses']).kind).toBe(
    'reference',
  );
  expect(findSite(sites, '.github/actions/node/action.yml', ['runs', 'main']).observedRuntime).toBe(
    'node',
  );
  expectContains(
    findSite(sites, '.github/actions/node/action.yml', ['runs', 'post']).targets,
    matchSubset({ path: '.github/actions/node/cleanup.xyz' }),
  );
  expect(
    findSite(sites, '.github/actions/docker/action.yml', ['runs', 'image']).resolution.kind,
  ).toBe('unresolved');
});
it('changes execution identity when inherited cwd or environment changes without changing the command', () => {
  const f = createFixture();
  f.write('first/program.xyz', 'first');
  f.write('second/program.xyz', 'second');
  function write(cwd: string, mode: string) {
    f.write(
      'project.json',
      JSON.stringify({
        targets: {
          x: {
            executor: 'nx:run-commands',
            options: { command: 'bun ./program.xyz', cwd, env: { MODE: mode } },
          },
        },
      }),
    );
  }
  write('first', 'one');
  const before = findSite(f.discover(), 'project.json', ['targets', 'x', 'options', 'command']);
  write('second', 'two');
  const after = findSite(f.discover(), 'project.json', ['targets', 'x', 'options', 'command']);
  expect(after.bodyDigest).toBe(before.bodyDigest);
  expect(after.digest).not.toBe(before.digest);
});
for (const [path, contents] of [
  ['package.json', '{"scripts":{"x":"bun a","x":"bun b"}}'],
  ['project.json', '{"targets":{"x":{"options":{"commands":[12]}}}}'],
  ['.github/workflows/ci.yml', 'jobs:\n  x:\n    steps: ['],
  ['.github/workflows/ci.yml', 'jobs:\n  x:\n    steps:\n      - run: bun a\n        run: bun b\n'],
] as const)
  it(
    'refuses malformed or duplicate execution configuration ' +
      path +
      ' ' +
      JSON.stringify(contents),
    () => {
      const f = createFixture();
      f.write(path, contents);
      expect(() => f.discover()).toThrow();
    },
  );
it('refuses ambiguous local action metadata instead of choosing a preferred extension', () => {
  const f = createFixture();
  f.write(
    '.github/workflows/ci.yml',
    'jobs:\n  x:\n    steps:\n      - uses: ./.github/actions/ambiguous\n',
  );
  for (const name of ['action.yml', 'action.yaml'])
    f.write('.github/actions/ambiguous/' + name, 'runs:\n  using: composite\n  steps: []\n');
  expect(() => f.discover()).toThrow('ambiguous');
});

it('retains caller environment and resolves local action metadata at the workspace root despite run cwd', () => {
  const f = createFixture();
  f.write('.github/actions/local/action.yml', 'runs:\n  using: composite\n  steps: []\n');
  function write(mode: string) {
    f.write(
      '.github/workflows/ci.yml',
      'defaults:\n  run:\n    working-directory: elsewhere\njobs:\n  x:\n    env:\n      MODE: ' +
        mode +
        '\n    steps:\n      - uses: ./.github/actions/local\n',
    );
  }
  write('one');
  const before = findSite(f.discover(), '.github/workflows/ci.yml', [
    'jobs',
    'x',
    'steps',
    0,
    'uses',
  ]);
  write('two');
  const after = findSite(f.discover(), '.github/workflows/ci.yml', [
    'jobs',
    'x',
    'steps',
    0,
    'uses',
  ]);
  expect(after.digest).not.toBe(before.digest);
  expectContains(
    after.targets,
    matchSubset({ path: '.github/actions/local/action.yml', kind: 'file' }),
  );
});
it('includes executor-key Nx defaults in execution identity rather than only target-name defaults', () => {
  const f = createFixture();
  f.write(
    'project.json',
    JSON.stringify({
      targets: { x: { executor: 'nx:run-commands', options: { command: 'bun ./program.xyz' } } },
    }),
  );
  f.write('program.xyz', 'program');
  function write(mode: string) {
    f.write(
      'nx.json',
      JSON.stringify({
        targetDefaults: { 'nx:run-commands': { options: { env: { MODE: mode } } } },
      }),
    );
  }
  write('one');
  const before = findSite(f.discover(), 'project.json', ['targets', 'x', 'options', 'command']);
  write('two');
  const after = findSite(f.discover(), 'project.json', ['targets', 'x', 'options', 'command']);
  expect(after.digest).not.toBe(before.digest);
});
it('does not read inherited JavaScript prototype properties as Nx defaults', () => {
  const f = createFixture();
  f.write('nx.json', '{"targetDefaults":{}}');
  f.write(
    'project.json',
    JSON.stringify({
      targets: {
        toString: { executor: 'nx:run-commands', options: { command: 'bun ./program.xyz' } },
      },
    }),
  );
  f.write('program.xyz', 'program');
  expectContains(
    findSite(f.discover(), 'project.json', ['targets', 'toString', 'options', 'command']).targets,
    matchSubset({ kind: 'file', path: 'program.xyz' }),
  );
});

it('keeps glob and filtered Nx defaults as explicit unsupported boundaries even without command fields', () => {
  const f = createFixture();
  f.write(
    'nx.json',
    JSON.stringify({
      targetDefaults: {
        'verify-*': { options: { cwd: 'elsewhere' } },
        build: { filter: { project: 'special' }, options: { env: { MODE: 'filtered' } } },
      },
    }),
  );
  const sites = f.discover();
  expect(findSite(sites, 'nx.json', ['targetDefaults', 'verify-*']).resolution.kind).toBe(
    'unresolved',
  );
  expect(findSite(sites, 'nx.json', ['targetDefaults', 'build']).resolution.kind).toBe(
    'unresolved',
  );
});
it('preserves a captured symlink ancestor as the boundary for a referenced descendant', () => {
  const f = createFixture();
  f.write('package.json', JSON.stringify({ scripts: { run: 'bun ./linked/program.xyz' } }));
  symlinkSync('outside-directory', join(f.root, 'linked'));
  expectContains(findSite(f.discover(), 'package.json', ['scripts', 'run']).targets, {
    usage: 'program',
    kind: 'symlink',
    path: 'linked',
  });
});
it('treats local action metadata as configuration references rather than executable program candidates', () => {
  const f = createFixture();
  f.write(
    '.github/workflows/ci.yml',
    'jobs:\n  x:\n    steps:\n      - uses: ./.github/actions/local\n',
  );
  f.write('.github/actions/local/action.yml', 'runs:\n  using: composite\n  steps: []\n');
  expect(
    f
      .discover()
      .some(
        (site) => site.source === '.github/actions/local/action.yml' && site.kind === 'entrypoint',
      ),
  ).toBe(false);
});

function matchSubset(expected: object): unknown {
  return expect.objectContaining(expected);
}
function matchString(): unknown {
  return expect.any(String);
}
function expectContains(actual: readonly unknown[], expected: unknown): void {
  expect(actual).toContainEqual(expected);
}

it('keeps program versus configuration reference usage explicit for later caller validation', () => {
  const f = createFixture();
  f.write('package.json', JSON.stringify({ scripts: { run: 'bun ./program.xyz' } }));
  f.write('program.xyz', 'program');
  f.write(
    '.github/workflows/ci.yml',
    'jobs:\n  x:\n    steps:\n      - uses: ./.github/actions/local\n',
  );
  f.write('.github/actions/local/action.yml', 'runs:\n  using: composite\n  steps: []\n');
  expectContains(
    findSite(f.discover(), 'package.json', ['scripts', 'run']).targets,
    matchSubset({ kind: 'file', usage: 'program' }),
  );
  expectContains(
    findSite(f.discover(), '.github/workflows/ci.yml', ['jobs', 'x', 'steps', 0, 'uses']).targets,
    matchSubset({ kind: 'file', usage: 'configuration' }),
  );
});

it('surfaces a project invocation inherited only from Nx defaults with overridden cwd', () => {
  const f = createFixture();
  f.write(
    'nx.json',
    JSON.stringify({
      targetDefaults: {
        verify: { executor: 'nx:run-commands', options: { command: 'bun ./program.xyz' } },
      },
    }),
  );
  f.write(
    'project.json',
    JSON.stringify({
      targets: { verify: { executor: 'nx:run-commands', options: { cwd: 'alternate' } } },
    }),
  );
  f.write('program.xyz', 'default');
  f.write('alternate/program.xyz', 'alternate');
  expect(
    f
      .discover()
      .some((site) => site.source === 'project.json' && site.resolution.kind === 'unresolved'),
  ).toBe(true);
});
it('rejects YAML non-string mapping keys before distinct scalar keys can overwrite one another', () => {
  const f = createFixture();
  f.write(
    '.github/workflows/ci.yml',
    'jobs:\n  1:\n    steps:\n      - run: node ./hidden.xyz\n  "1":\n    steps:\n      - run: bun ./safe.xyz\n',
  );
  f.write('hidden.xyz', 'hidden');
  f.write('safe.xyz', 'safe');
  expect(() => f.discover()).toThrow('mapping key');
});
it('retains an explicit custom workflow shell as an unresolved program boundary', () => {
  const f = createFixture();
  f.write('safe.xyz', 'safe');
  f.write('tools/wrapper.py', 'wrapper');
  f.write(
    '.github/workflows/ci.yml',
    'jobs:\n  x:\n    steps:\n      - shell: python tools/wrapper.py {0}\n        run: bun ./safe.xyz\n',
  );
  expect(
    findSite(f.discover(), '.github/workflows/ci.yml', ['jobs', 'x', 'steps', 0, 'run']).resolution
      .kind,
  ).toBe('unresolved');
});
it('does not classify a Git execution wrapper as a resolved external operation', () => {
  const f = createFixture();
  f.write(
    'package.json',
    JSON.stringify({ scripts: { verify: 'git submodule foreach bash ./child.xyz' } }),
  );
  expect(findSite(f.discover(), 'package.json', ['scripts', 'verify']).resolution.kind).toBe(
    'unresolved',
  );
});
it('retains startup program options in captured environment as unresolved program indirection', () => {
  const f = createFixture();
  f.write('safe.xyz', 'safe');
  f.write('hidden.cjs', 'hidden');
  f.write(
    'project.json',
    JSON.stringify({
      targets: {
        x: {
          executor: 'nx:run-commands',
          options: { command: 'bun ./safe.xyz', env: { NODE_OPTIONS: '--require=./hidden.cjs' } },
        },
      },
    }),
  );
  expect(
    findSite(f.discover(), 'project.json', ['targets', 'x', 'options', 'command']).resolution.kind,
  ).toBe('unresolved');
});
it('keeps tracked executable index evidence when current execute bits were removed', () => {
  const f = createFixture();
  f.write('indexed.xyz', 'opaque program');
  chmodSync(join(f.root, 'indexed.xyz'), 0o755);
  const staged = Bun.spawnSync(['/usr/bin/git', '-C', f.root, 'add', 'indexed.xyz'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(staged.exitCode).toBe(0);
  chmodSync(join(f.root, 'indexed.xyz'), 0o644);
  expect(
    f.discover().some((site) => site.source === 'indexed.xyz' && site.kind === 'entrypoint'),
  ).toBe(true);
});

for (const contents of ['[]', '{"scripts":[]}', '{"scripts":{"verify":12}}'])
  it('refuses non-object or non-string package execution shapes ' + contents, () => {
    const f = createFixture();
    f.write('package.json', contents);
    expect(() => f.discover()).toThrow('requires');
  });
it('refuses unresolved YAML tags even if the library could return a string command', () => {
  const f = createFixture();
  f.write('safe.xyz', 'safe');
  f.write(
    '.github/workflows/ci.yml',
    'jobs:\n  x:\n    steps:\n      - run: !unknown bun ./safe.xyz\n',
  );
  expect(() => f.discover()).toThrow('malformed');
});
it('refuses YAML merge semantics instead of overlooking a merged startup program', () => {
  const f = createFixture();
  f.write('safe.xyz', 'safe');
  f.write(
    '.github/workflows/ci.yml',
    'startup: &startup\n  NODE_OPTIONS: --require=./hidden.cjs\njobs:\n  x:\n    env:\n      <<: *startup\n    steps:\n      - run: bun ./safe.xyz\n',
  );
  expect(() => f.discover()).toThrow('mapping key');
});
it('refuses excessive YAML alias expansion before materializing the configuration', () => {
  const f = createFixture();
  f.write('safe.xyz', 'safe');
  f.write(
    '.github/workflows/ci.yml',
    'a: &a [x,x,x]\nb: &b [*a,*a,*a]\nc: &c [*b,*b,*b]\nd: &d [*c,*c,*c]\ne: &e [*d,*d,*d]\nf: [*e,*e,*e]\njobs:\n  x:\n    steps:\n      - run: bun ./safe.xyz\n',
  );
  expect(() => f.discover()).toThrow('alias');
});
it('refuses cyclic YAML values as non-JSON state instead of recursing into a partial discovery', () => {
  const f = createFixture();
  f.write('.github/workflows/ci.yml', 'cycle: &cycle\n  self: *cycle\njobs: {}\n');
  expect(() => f.discover()).toThrow('alias');
});
it('refuses a local composite action cycle with the named configuration error', () => {
  const f = createFixture();
  f.write(
    '.github/workflows/ci.yml',
    'jobs:\n  x:\n    steps:\n      - uses: ./.github/actions/a\n',
  );
  f.write(
    '.github/actions/a/action.yml',
    'runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/b\n',
  );
  f.write(
    '.github/actions/b/action.yml',
    'runs:\n  using: composite\n  steps:\n    - uses: ./.github/actions/a\n',
  );
  expect(() => f.discover()).toThrow('cycle');
});

it('refuses tagged YAML objects that cannot be represented in the JSON execution model', () => {
  const f = createFixture();
  f.write('safe.xyz', 'safe');
  f.write(
    '.github/workflows/ci.yml',
    'metadata: !!timestamp 2026-01-01\njobs:\n  x:\n    steps:\n      - run: bun ./safe.xyz\n',
  );
  expect(() => f.discover()).toThrow('non-JSON object');
});
it('refuses nonfinite YAML numbers instead of colliding their execution identity with null', () => {
  const f = createFixture();
  f.write('safe.xyz', 'safe');
  f.write(
    '.github/workflows/ci.yml',
    'jobs:\n  x:\n    env:\n      MODE: .inf\n    steps:\n      - run: bun ./safe.xyz\n',
  );
  expect(() => f.discover()).toThrow('non-JSON value');
});

for (const [path, contents] of [
  ['package.json', '{'],
  ['package.json', '// unsupported package comment\n{"scripts":{"verify":"bun ./safe.xyz"}}'],
  ['package.json', '{"scripts":{"verify":"bun ./safe.xyz",}}'],
  ['project.json', '{"targets":'],
] as const)
  it(
    'refuses strict or malformed configuration syntax ' + path + ' ' + JSON.stringify(contents),
    () => {
      const f = createFixture();
      f.write('safe.xyz', 'safe');
      f.write(path, contents);
      expect(() => f.discover()).toThrow('malformed');
    },
  );
it('accepts explicit Nx JSONC comments and trailing commas without relaxing package JSON', () => {
  const f = createFixture();
  f.write('safe.xyz', 'safe');
  f.write(
    'project.json',
    '// Nx JSONC\n{"targets":{"x":{"executor":"nx:run-commands","options":{"command":"bun ./safe.xyz",},},},}\n',
  );
  expect(
    findSite(f.discover(), 'project.json', ['targets', 'x', 'options', 'command']).resolution.kind,
  ).toBe('resolved');
});
it('refuses malformed UTF8 inside an otherwise valid captured package configuration', () => {
  const f = createFixture();
  f.write('safe.xyz', 'safe');
  writeFileSync(
    join(f.root, 'package.json'),
    Buffer.concat([
      Buffer.from('{"scripts":{"verify":"bun ./safe.xyz"},"description":"invalid-'),
      Buffer.from([0xff]),
      Buffer.from('"}'),
    ]),
  );
  expect(() => f.discover()).toThrow('UTF8');
});
it('refuses a symbolic configuration boundary before decoding its external bytes', () => {
  const f = createFixture(),
    other = createFixture();
  other.write('package.json', '{}');
  symlinkSync(join(other.root, 'package.json'), join(f.root, 'package.json'));
  expect(() => f.discover()).toThrow('captured regular file');
});
for (const command of [
  'bun first.xyz && bun second.xyz',
  'bun "first.xyz"',
  'node -e literal',
  'bun run named-script',
])
  it(
    'keeps an otherwise captured syntax or interpreter indirection unresolved ' +
      JSON.stringify(command),
    () => {
      const f = createFixture();
      for (const path of ['first.xyz', 'second.xyz', '"first.xyz"', '-e', 'run'])
        f.write(path, 'captured');
      f.write('package.json', JSON.stringify({ scripts: { verify: command } }));
      const site = findSite(f.discover(), 'package.json', ['scripts', 'verify']);
      expect(site.resolution.kind).toBe('unresolved');
      if (site.resolution.kind !== 'unresolved') throw new Error('resolution fence not reached');
      expect(site.resolution.reason).toMatch(/supported literal|interpreter option/u);
    },
  );
for (const [path, contents] of [
  [
    '.github/workflows/ci.yml',
    'jobs:\n  x:\n    steps:\n      - run: bun ./safe.xyz\n        uses: external/action@v1\n',
  ],
  ['.github/workflows/ci.yml', 'jobs:\n  x:\n    steps:\n      - name: no execution\n'],
  ['.github/workflows/ci.yml', 'jobs:\n  x:\n    steps: 12\n'],
  [
    '.github/actions/local/action.yml',
    'runs:\n  using: composite\n  steps:\n    - run: bun ./safe.xyz\n',
  ],
  ['.github/actions/local/action.yml', 'runs:\n  using: unsupported\n'],
] as const)
  it(
    'refuses an existing unsupported workflow form ' + path + ' ' + JSON.stringify(contents),
    () => {
      const f = createFixture();
      f.write('safe.xyz', 'safe');
      if (path.includes('/actions/'))
        f.write(
          '.github/workflows/ci.yml',
          'jobs:\n  x:\n    steps:\n      - uses: ./.github/actions/local\n',
        );
      f.write(path, contents);
      if (contents.includes('steps: 12'))
        expect(() => f.discover()).toThrow('steps must be an array');
      else expect(() => f.discover()).toThrow();
    },
  );
it('retains commandless Nx overrides and custom executors as unresolved invocation boundaries', () => {
  const f = createFixture();
  f.write('safe.xyz', 'safe');
  f.write(
    'project.json',
    JSON.stringify({
      targets: {
        x: {
          executor: 'custom:executor',
          options: { command: 'bun ./safe.xyz' },
          configurations: { alternate: { cwd: 'elsewhere' } },
        },
      },
    }),
  );
  const sites = f.discover();
  expect(findSite(sites, 'project.json', ['targets', 'x', 'executor']).resolution.kind).toBe(
    'unresolved',
  );
  expect(
    findSite(sites, 'project.json', ['targets', 'x', 'configurations', 'alternate']).resolution
      .kind,
  ).toBe('unresolved');
});
it('retains a dynamic environment mapping as unresolved execution context', () => {
  const f = createFixture();
  f.write('safe.xyz', 'safe');
  f.write(
    'project.json',
    JSON.stringify({
      targets: {
        x: {
          executor: 'nx:run-commands',
          options: { command: 'bun ./safe.xyz', env: '${{ inputs.environment }}' },
        },
      },
    }),
  );
  expect(
    findSite(f.discover(), 'project.json', ['targets', 'x', 'options', 'command']).resolution.kind,
  ).toBe('unresolved');
});

for (const fault of ['children', 'property', 'key'] as const)
  it('refuses broken parser AST ' + fault + ' with a contextual boundary error', () => {
    const f = createFixture();
    f.write('safe.xyz', 'safe');
    f.write('package.json', JSON.stringify({ scripts: { verify: 'bun ./safe.xyz' } }));
    const entry = join(f.root, 'parser-fault.ts'),
      parser = Bun.resolveSync('jsonc-parser', import.meta.dir),
      context =
        fault === 'children'
          ? 'omitted container children'
          : fault === 'property'
            ? 'omitted object property'
            : 'property key is malformed';
    const patch =
      fault === 'children'
        ? 'tree.children=undefined;'
        : fault === 'property'
          ? 'tree.children[0].children=tree.children[0].children.slice(0,1);'
          : 'tree.children[0].children[0].value=42;';
    writeFileSync(
      entry,
      'import{mock}from"bun:test";const actual=await import(' +
        JSON.stringify(parser) +
        ');const parseTree=actual.parseTree;mock.module(' +
        JSON.stringify(parser) +
        ',()=>({...actual,parseTree:(...args)=>{const tree=parseTree(...args);if(tree===undefined)throw new Error("fixture tree absent");' +
        patch +
        'return tree;}}));const{readWorkspace}=await import(' +
        JSON.stringify(join(import.meta.dir, 'workspace.ts')) +
        ');const{discoverConsumers}=await import(' +
        JSON.stringify(join(import.meta.dir, 'consumers.ts')) +
        ');try{discoverConsumers(readWorkspace(' +
        JSON.stringify(f.root) +
        '));process.exit(2);}catch(cause){if(!(cause instanceof Error)||!cause.message.includes(' +
        JSON.stringify(context) +
        '))throw cause;process.stdout.write("refused");}',
    );
    const child = Bun.spawnSync([process.execPath, '--no-env-file', '--config=/dev/null', entry], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
    });
    expect(child.exitCode, new TextDecoder().decode(child.stderr)).toBe(0);
    expect(new TextDecoder().decode(child.stdout)).toBe('refused');
  });

for (const source of ['compose.yml', 'docker-compose.yaml', '.new/jobs/compose.prod.override.yml'])
  it('discovers container startup in ' + source + ' independently of declarations', () => {
    const f = createFixture();
    f.write(
      source,
      JSON.stringify({ services: { worker: { command: ['bun', './worker.unknown'] } } }),
    );
    const site = findSite(f.discover(), source, ['services', 'worker', 'command']);
    expect(site.invocation).toEqual({ kind: 'argv', argv: ['bun', './worker.unknown'] });
    expect(site.observedRuntime).toBe('bun');
    expect(site.resolution.kind).toBe('unresolved');
  });

it('retains exact container argv without treating container paths as host programs', () => {
  const f = createFixture();
  f.write('worker.unknown', 'host program with the same spelling');
  f.write(
    'compose.yml',
    JSON.stringify({
      services: {
        worker: {
          image: 'reviewed@sha256:abc',
          working_dir: '/app',
          volumes: ['./elsewhere:/app:ro'],
          command: [
            'bun',
            './worker.unknown',
            '',
            'space value',
            '$(touch /tmp/forbidden)',
            '--flag=a;b',
          ],
        },
      },
    }),
  );
  const sites = f.discover(),
    site = findSite(sites, 'compose.yml', ['services', 'worker', 'command']);
  expect(site.invocation).toEqual({
    kind: 'argv',
    argv: ['bun', './worker.unknown', '', 'space value', '$(touch /tmp/forbidden)', '--flag=a;b'],
  });
  expect(site.targets).toEqual([]);
  expect(sites.some((candidate) => candidate.source === 'worker.unknown')).toBe(false);
  expect(site.context).toEqual([
    {
      source: 'compose.yml',
      location: [],
      settings: {
        compose: {
          services: {
            worker: {
              image: 'reviewed@sha256:abc',
              working_dir: '/app',
              volumes: ['./elsewhere:/app:ro'],
              command: [
                'bun',
                './worker.unknown',
                '',
                'space value',
                '$(touch /tmp/forbidden)',
                '--flag=a;b',
              ],
            },
          },
        },
      },
    },
  ]);
});

for (const command of [
  null,
  '',
  [],
  'bun ./worker --value "space value"',
  ['bun', './worker'],
] as const)
  it('preserves the declared container command form ' + JSON.stringify(command), () => {
    const f = createFixture();
    f.write('compose.yml', JSON.stringify({ services: { worker: { command } } }));
    const site = findSite(f.discover(), 'compose.yml', ['services', 'worker', 'command']);
    expect(site.body).toEqual({
      kind: 'command',
      text: typeof command === 'string' ? command : JSON.stringify(command),
    });
    expect(site.resolution.kind).toBe('unresolved');
    if (command === null || typeof command === 'string')
      expect(site.invocation.kind).toBe('unresolved');
    else expect(site.invocation).toEqual({ kind: 'argv', argv: command });
  });

it('keeps image inheritance and include-only Compose files as explicit unresolved consumers', () => {
  const f = createFixture();
  f.write(
    'compose.yml',
    JSON.stringify({
      include: ['./elsewhere.yaml'],
      services: { inherited: { image: 'external:1' } },
    }),
  );
  const inherited = findSite(f.discover(), 'compose.yml', ['services', 'inherited']);
  expect(inherited.kind).toBe('reference');
  expect(inherited.resolution.kind).toBe('unresolved');
  f.write('compose.yml', JSON.stringify({ include: ['./elsewhere.yaml'] }));
  const include = findSite(f.discover(), 'compose.yml', []);
  expect(include.resolution.kind).toBe('unresolved');
  expect(include.context[0]?.settings).toEqual({ compose: { include: ['./elsewhere.yaml'] } });
});

for (const field of ['entrypoint', 'post_start', 'pre_stop'] as const)
  it('discovers actual Compose ' + field + ' executable bodies', () => {
    const f = createFixture();
    const value =
      field === 'entrypoint'
        ? ['node', '/app/start']
        : [{ command: ['sh', '-c', 'touch /app/witness'], user: 'operator' }];
    f.write('compose.yml', JSON.stringify({ services: { worker: { [field]: value } } }));
    const location =
      field === 'entrypoint'
        ? ['services', 'worker', field]
        : ['services', 'worker', field, 0, 'command'];
    const site = findSite(f.discover(), 'compose.yml', location);
    expect(site.invocation).toEqual({
      kind: 'argv',
      argv: field === 'entrypoint' ? ['node', '/app/start'] : ['sh', '-c', 'touch /app/witness'],
    });
    expect(site.observedRuntime).toBe(field === 'entrypoint' ? 'node' : 'shell');
    expect(site.resolution.kind).toBe('unresolved');
  });

for (const command of [12, {}, ['bun', 12]])
  it('refuses malformed Compose command values ' + JSON.stringify(command), () => {
    const f = createFixture();
    f.write('compose.yml', JSON.stringify({ services: { worker: { command } } }));
    expect(() => f.discover()).toThrow(
      'Compose command must be null, a string or an array of strings',
    );
  });

for (const [field, value] of [
  ['services', []],
  ['service', []],
  ['post_start', {}],
  ['hook', []],
  ['missing-command', {}],
] as const)
  it('refuses malformed Compose structural ' + field, () => {
    const f = createFixture();
    const configuration =
      field === 'services'
        ? { services: value }
        : field === 'service'
          ? { services: { worker: value } }
          : field === 'post_start'
            ? { services: { worker: { post_start: value } } }
            : { services: { worker: { post_start: [value] } } };
    f.write('compose.yml', JSON.stringify(configuration));
    expect(() => f.discover()).toThrow(
      field === 'post_start'
        ? 'Compose hooks must be an array'
        : field === 'missing-command'
          ? 'Compose hook command is absent'
          : 'requires an object',
    );
  });

for (const field of [
  'image',
  'volumes',
  'env_file',
  'extends',
  'unrecognized_execution_extension',
] as const)
  it('binds complete Compose ' + field + ' context to unchanged command identities', () => {
    const f = createFixture();
    f.write(
      'compose.yml',
      JSON.stringify({ services: { worker: { command: ['bun', './worker'], [field]: 'first' } } }),
    );
    const before = findSite(f.discover(), 'compose.yml', ['services', 'worker', 'command']);
    f.write(
      'compose.yml',
      JSON.stringify({ services: { worker: { command: ['bun', './worker'], [field]: 'second' } } }),
    );
    const after = findSite(f.discover(), 'compose.yml', ['services', 'worker', 'command']);
    expect(after.bodyDigest).toBe(before.bodyDigest);
    expect(after.digest).not.toBe(before.digest);
  });

it('refuses an active Bun declaration for an unqualified container command', () => {
  const f = createFixture();
  f.write(
    'compose.yml',
    JSON.stringify({ services: { worker: { command: ['bun', './worker'] } } }),
  );
  const site = findSite(f.discover(), 'compose.yml', ['services', 'worker', 'command']);
  expect(() =>
    checkInventory([site], {
      schemaVersion: 1,
      entries: [
        {
          id: site.id,
          digest: site.digest,
          runtime: 'bun',
          owner: 'puni dash',
          callers: [site.id],
          replacement: 'puni dash dev',
          verification: 'actual container qualification remains required',
          disposition: 'active',
          clientExposure: { kind: 'client', command: ['puni', 'dash', 'dev'] },
        },
      ],
    }),
  ).toThrow('script inventory consumer is unresolved');
});

it('refuses null for a required Compose lifecycle command rather than interpreting image inheritance', () => {
  const f = createFixture();
  f.write(
    'compose.yml',
    JSON.stringify({ services: { worker: { post_start: [{ command: null }] } } }),
  );
  expect(() => f.discover()).toThrow('Compose hook command is absent');
});

for (const source of [
  'Dockerfile',
  'Containerfile',
  '.new/images/worker.Dockerfile',
  'images/Dockerfile.dev',
])
  it('discovers Docker execution in ' + source + ' independently of declarations', () => {
    const f = createFixture();
    f.write(source, 'FROM oven/bun:1\nRUN bun ./build.unknown\nCMD ["bun", "./start.unknown"]\n');
    const sites = f.discover().filter((site) => site.source === source);
    expect(sites).toHaveLength(3);
    expect(findSite(sites, source, []).kind).toBe('reference');
    expect(findSite(sites, source, ['instructions', 2]).body).toEqual({
      kind: 'command',
      text: 'RUN bun ./build.unknown\n',
    });
    expect(findSite(sites, source, ['instructions', 3]).body).toEqual({
      kind: 'command',
      text: 'CMD ["bun", "./start.unknown"]\n',
    });
    for (const site of sites) {
      expect(site.resolution.kind).toBe('unresolved');
      expect(site.targets).toEqual([]);
    }
  });

it('retains complete Docker continuation bodies and all executable instruction families', () => {
  const f = createFixture();
  const continued = ['RUN first ' + String.fromCharCode(92), '  && second', ''].join('\n');
  const contents =
    'FROM scratch\n' +
    continued +
    'ENTRYPOINT ["/entry"]\nHEALTHCHECK --interval=5s CMD probe\nonbuild RUN bun ./generated\n';
  f.write('Dockerfile', contents);
  const sites = f.discover();
  expect(findSite(sites, 'Dockerfile', ['instructions', 2]).body).toEqual({
    kind: 'command',
    text: continued,
  });
  for (const line of [4, 5, 6])
    expect(findSite(sites, 'Dockerfile', ['instructions', line]).kind).toBe('command');
  expect(findSite(sites, 'Dockerfile', []).body).toEqual({ kind: 'reference', text: contents });
});

for (const contents of [
  'FROM scratch\nCOPY <<EOF /script\nRUN looks like an instruction\nEOF\nCMD ["bun", "/script"]\n',
  '# escape=`\nFROM scratch\nRUN first `\nRUN is continuation\n',
  '# syntax=example.invalid/custom:1\nFROM scratch\nCUSTOM_EXECUTE anything\nRUN may have custom semantics\n',
])
  it(
    'keeps complex Docker syntax as a complete opaque execution boundary ' +
      JSON.stringify(contents),
    () => {
      const f = createFixture();
      f.write('Dockerfile', contents);
      const sites = f.discover().filter((site) => site.source === 'Dockerfile');
      expect(sites).toHaveLength(1);
      expect(sites[0]?.body).toEqual({ kind: 'reference', text: contents });
      expect(sites[0]?.resolution.kind).toBe('unresolved');
    },
  );

it('binds Docker image and copy context to unchanged commands without resolving container paths on the host', () => {
  const f = createFixture();
  f.write('start', 'host program is not image authority');
  f.write('Dockerfile', 'FROM image:first\nCOPY elsewhere /app\nCMD ["bun", "./start"]\n');
  const before = findSite(f.discover(), 'Dockerfile', ['instructions', 3]);
  f.write('Dockerfile', 'FROM image:second\nCOPY elsewhere /app\nCMD ["bun", "./start"]\n');
  const sites = f.discover(),
    after = findSite(sites, 'Dockerfile', ['instructions', 3]);
  expect(before.bodyDigest).toBe(after.bodyDigest);
  expect(before.digest).not.toBe(after.digest);
  expect(after.targets).toEqual([]);
  expect(sites.some((site) => site.source === 'start')).toBe(false);
});

it('does not accept declared Bun compliance for unqualified Docker execution', () => {
  const f = createFixture();
  f.write('Dockerfile', 'FROM oven/bun:1\nCMD ["bun", "./start"]\n');
  const site = findSite(f.discover(), 'Dockerfile', ['instructions', 2]);
  expect(() =>
    checkInventory([site], {
      schemaVersion: 1,
      entries: [
        {
          id: site.id,
          digest: site.digest,
          runtime: 'bun',
          owner: 'puni dash',
          callers: [site.id],
          replacement: 'puni dash dev',
          verification: 'image qualification required',
          disposition: 'active',
          clientExposure: { kind: 'client', command: ['puni', 'dash', 'dev'] },
        },
      ],
    }),
  ).toThrow('script inventory consumer is unresolved');
});

it('retains Docker instructions with a standard frontend and ignores directive-looking comments and continued text', () => {
  const f = createFixture();
  const contents = [
    '# syntax=docker/dockerfile:1',
    'FROM scratch',
    '# RUN is a comment',
    'RUN first ' + String.fromCharCode(92),
    '# ignored comment',
    '',
    '  CMD is continued text',
    'ENTRYPOINT ["/entry"]',
    '',
  ].join('\r\n');
  f.write('Dockerfile', contents);
  const sites = f.discover().filter((site) => site.source === 'Dockerfile');
  expect(sites).toHaveLength(3);
  expect(findSite(sites, 'Dockerfile', ['instructions', 4]).body).toEqual({
    kind: 'command',
    text: [
      'RUN first ' + String.fromCharCode(92),
      '# ignored comment',
      '',
      '  CMD is continued text',
      '',
    ].join('\r\n'),
  });
  expect(findSite(sites, 'Dockerfile', ['instructions', 8]).body).toEqual({
    kind: 'command',
    text: 'ENTRYPOINT ["/entry"]\r\n',
  });
});

it('refuses a Docker build-file symlink before treating it as captured instruction bytes', () => {
  const f = createFixture();
  f.write('outside-build', 'FROM scratch\nRUN unowned\n');
  symlinkSync('outside-build', join(f.root, 'Dockerfile'));
  expect(() => f.discover()).toThrow('Docker build file is not a captured regular file');
});

it('preserves the exact Docker final instruction without requiring a final newline', () => {
  const f = createFixture();
  f.write('Dockerfile', 'FROM scratch\nCMD ["bun", "./start"]');
  expect(findSite(f.discover(), 'Dockerfile', ['instructions', 2]).body).toEqual({
    kind: 'command',
    text: 'CMD ["bun", "./start"]',
  });
});
