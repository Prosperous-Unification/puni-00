import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterEach, expect, it } from 'bun:test';

import { hashBytes } from '../evidence/content-manifest';
import type { LintInterrupt } from '../lint-interrupts';
import { readLintRuntime } from '../lint-runtime';
import { planBunToolkit } from './bun-release';
import { readPreparationSource } from './preparation-source';
import { hashTrustedModules } from './trusted-modules';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function git(repository: string, ...args: string[]) {
  const child = Bun.spawnSync(['/usr/bin/git', '-C', repository, ...args], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw new Error(child.stderr.toString());
  return child.stdout.toString().trim();
}
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni preparation source '));
  roots.push(root);
  const repository = join(root, 'candidate'),
    runtime = join(root, 'runtime'),
    toolkit = join(root, 'toolkit');
  for (const path of [repository, runtime, toolkit, join(toolkit, 'trusted-node-modules')])
    mkdirSync(path, { recursive: true });
  git(repository, 'init', '--initial-branch=main');
  git(repository, 'config', 'user.name', 'PUNI Preparation');
  git(repository, 'config', 'user.email', 'preparation@example.test');
  writeFileSync(join(repository, '.gitattributes'), 'tracked.txt filter=specimen\n');
  writeFileSync(join(repository, 'tracked.txt'), 'committed\n');
  git(repository, 'add', '--all');
  git(repository, 'commit', '-m', 'baseline');
  const sha = git(repository, 'rev-parse', 'HEAD');
  // Authenticated inert role bytes exercise selection only; no usable preparer/archive is claimed.
  const roles = {
    'launcher.mjs': Buffer.from('launcher'),
    'snapshotter.ts': Buffer.from('snapshotter'),
    'validator.mjs': Buffer.from('validator'),
    'prepare-activation.mjs': Buffer.from('preparer'),
    'prepare-relocation-activation.mjs': Buffer.from('relocation'),
  };
  const plan = planBunToolkit({
    tag: 'puni-v0.3.0',
    sourceRevision: 'a'.repeat(40),
    bunVersion: Bun.version,
    roleBytes: roles,
    trustedNodeModules: [],
    trustedNodeModulesIdentity: hashTrustedModules(join(toolkit, 'trusted-node-modules')),
  });
  for (const [role, bytes] of Object.entries(roles)) writeFileSync(join(toolkit, role), bytes);
  writeFileSync(join(toolkit, 'toolkit.json'), plan.descriptor);
  writeFileSync(join(toolkit, 'SHA256SUMS'), plan.checksums);
  const listeners = new Set<(signal: LintInterrupt) => void>();
  let first: LintInterrupt | undefined;
  const interrupt = (signal: LintInterrupt) => {
    first ??= signal;
    for (const listener of listeners) listener(signal);
  };
  const context = {
    callerDirectory: root,
    toolkitDirectory: 'toolkit',
    expectedToolkitIdentity: hashBytes(plan.descriptor),
    runtime: readLintRuntime('/usr/bin:/bin', runtime),
    subscribeInterrupts: (listener: (signal: LintInterrupt) => void) => {
      listeners.add(listener);
      if (first !== undefined) listener(first);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const request = { candidateRepository: 'candidate', candidateSha: sha };
  return { root, repository, runtime, toolkit, sha, context, request, interrupt, listeners };
}
function observeGit(fixture: ReturnType<typeof createFixture>, behavior = '') {
  const directory = join(fixture.root, 'git lookup'),
    log = join(fixture.root, 'git-observed.jsonl');
  mkdirSync(directory);
  const shim = join(directory, 'git');
  writeFileSync(
    shim,
    '#!' +
      process.execPath +
      ' --no-env-file --config=/dev/null\nimport{appendFileSync,writeFileSync}from"node:fs";const args=process.argv.slice(2);appendFileSync(' +
      JSON.stringify(log) +
      ',JSON.stringify({args,cwd:process.cwd(),environment:process.env})+"\\n");' +
      behavior +
      'const child=Bun.spawn(["/usr/bin/git",...args],{env:process.env,stdin:"inherit",stdout:"inherit",stderr:"inherit"});process.exitCode=await child.exited;\n',
    { mode: 0o755 },
  );
  fixture.context.runtime = readLintRuntime(
    relative(fixture.runtime, directory) + ':/usr/bin:/bin',
    fixture.runtime,
  );
  return { log, directory };
}
async function refuse(pending: Promise<unknown>) {
  const cause: unknown = await pending.then(
    () => {
      throw new Error('selection unexpectedly passed');
    },
    (cause: unknown) => cause,
  );
  if (!(cause instanceof Error)) throw new Error('non-error refusal', { cause });
  return cause;
}
async function waitPath(path: string) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (existsSync(path)) return;
    await Bun.sleep(5);
  }
  throw new Error('missing marker: ' + path);
}
function isGone(pid: number) {
  try {
    process.kill(-pid, 0);
    return false;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ESRCH') return true;
    throw cause;
  }
}

it('selects exact committed HEAD through explicit independently frozen Git authority', async () => {
  const fixture = createFixture(),
    observed = observeGit(fixture);
  const previous = process.env['GIT_DIR'];
  process.env['GIT_DIR'] = '/operator/poison';
  try {
    const outcome = await readPreparationSource(fixture.request, fixture.context);
    expect(outcome.kind).toBe('ready');
    if (outcome.kind !== 'ready') throw new Error('wrong selection');
    expect(outcome.candidateDirectory).toBe(fixture.repository);
    expect(outcome.sourceRevision).toBe(fixture.sha);
    expect(outcome.toolkit.digest).toBe(fixture.context.expectedToolkitIdentity);
    expect(outcome.runtime).toEqual(fixture.context.runtime);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, 'GIT_DIR');
    else process.env['GIT_DIR'] = previous;
  }
  const invocations = readFileSync(observed.log, 'utf8')
    .trim()
    .split('\n')
    .map(
      (line) =>
        JSON.parse(line) as {
          args: readonly string[];
          cwd: string;
          environment: Record<string, string>;
        },
    );
  expect(invocations.length).toBeGreaterThanOrEqual(6);
  for (const invocation of invocations) {
    expect(invocation.cwd).toBe(fixture.runtime);
    expect(invocation.environment['GIT_DIR']).toBeUndefined();
    expect(invocation.environment['PATH']).toBe(fixture.context.runtime.environment['PATH']);
  }
  expect(fixture.listeners.size).toBe(0);
});
it('replays prior cancellation before reading absent toolkit or candidate', async () => {
  const fixture = createFixture();
  fixture.interrupt('SIGTERM');
  expect(
    await readPreparationSource(
      { ...fixture.request, candidateRepository: 'absent' },
      { ...fixture.context, toolkitDirectory: 'absent' },
    ),
  ).toEqual({ kind: 'cancelled', status: 143 });
  expect(fixture.listeners.size).toBe(0);
});
it('refuses substituted toolkit digest before candidate-dependent Git IO', async () => {
  const fixture = createFixture(),
    observed = observeGit(fixture);
  expect(
    (
      await refuse(
        readPreparationSource(fixture.request, {
          ...fixture.context,
          expectedToolkitIdentity: 'b'.repeat(64),
        }),
      )
    ).message,
  ).toContain('package');
  expect(existsSync(observed.log)).toBe(false);
});
it('refuses legacy toolkit format before candidate-dependent Git IO', async () => {
  const fixture = createFixture(),
    observed = observeGit(fixture);
  const descriptor = JSON.parse(readFileSync(join(fixture.toolkit, 'toolkit.json'), 'utf8')) as {
    schemaVersion: number;
    roles: Record<string, string>;
    trustedNodeModulesIdentity: string;
  };
  descriptor.schemaVersion = 1;
  descriptor.roles['launcher.sh'] = hashBytes(readFileSync(join(fixture.toolkit, 'launcher.mjs')));
  Reflect.deleteProperty(descriptor.roles, 'launcher.mjs');
  renameSync(join(fixture.toolkit, 'launcher.mjs'), join(fixture.toolkit, 'launcher.sh'));
  const bytes = Buffer.from(JSON.stringify(descriptor));
  writeFileSync(join(fixture.toolkit, 'toolkit.json'), bytes);
  expect(
    (
      await refuse(
        readPreparationSource(fixture.request, {
          ...fixture.context,
          expectedToolkitIdentity: hashBytes(bytes),
        }),
      )
    ).message,
  ).toContain('schema 2');
  expect(existsSync(observed.log)).toBe(false);
});
for (const revision of [
  'HEAD',
  'a'.repeat(39),
  'a'.repeat(40),
  'z'.repeat(40),
  'a'.repeat(40) + '\n',
])
  it('refuses noncurrent full revision ' + JSON.stringify(revision), async () => {
    const fixture = createFixture(),
      observed = observeGit(fixture);
    expect(
      (
        await refuse(
          readPreparationSource({ ...fixture.request, candidateSha: revision }, fixture.context),
        )
      ).message,
    ).toMatch(/revision|commit/u);
    if (revision !== 'a'.repeat(40))
      expect(readFileSync(observed.log, 'utf8')).not.toContain('"--verify"');
  });
it('refuses a real earlier commit instead of silently selecting current HEAD', async () => {
  const fixture = createFixture();
  git(fixture.repository, 'commit', '--allow-empty', '-m', 'later');
  expect((await refuse(readPreparationSource(fixture.request, fixture.context))).message).toContain(
    'HEAD',
  );
});
for (const kind of ['tracked', 'untracked'] as const)
  it('refuses ' + kind + ' dirt despite operator status configuration', async () => {
    const fixture = createFixture();
    git(fixture.repository, 'config', 'status.showUntrackedFiles', 'no');
    writeFileSync(
      join(fixture.repository, kind === 'tracked' ? 'tracked.txt' : 'untracked.txt'),
      'changed\n',
    );
    expect(
      (await refuse(readPreparationSource(fixture.request, fixture.context))).message,
    ).toContain('dirty');
  });
for (const subject of [
  'runtime',
  'toolkit',
  'toolkit.json',
  'launcher.mjs',
  'snapshotter.ts',
  'validator.mjs',
  'prepare-activation.mjs',
  'prepare-relocation-activation.mjs',
  'trusted-node-modules',
] as const)
  it('refuses candidate-contained ' + subject + ' through physical selection', async () => {
    const fixture = createFixture();
    const target = join(fixture.repository, 'local-authority');
    appendFileSync(join(fixture.repository, '.git/info/exclude'), '\n/local-authority\n');
    if (subject === 'runtime') {
      mkdirSync(target);
      fixture.context.runtime = readLintRuntime('/usr/bin:/bin', target);
    } else if (subject === 'toolkit') {
      mkdirSync(target);
      for (const member of [
        'toolkit.json',
        'launcher.mjs',
        'snapshotter.ts',
        'validator.mjs',
        'prepare-activation.mjs',
        'prepare-relocation-activation.mjs',
        'trusted-node-modules',
      ])
        symlinkSync(join(fixture.toolkit, member), join(target, member));
      fixture.context.toolkitDirectory = target;
    } else {
      const selected = join(fixture.toolkit, subject);
      renameSync(selected, target);
      symlinkSync(target, selected);
    }
    expect(
      (await refuse(readPreparationSource(fixture.request, fixture.context))).message,
    ).toContain('outside');
  });
it('preserves native symlink-parent semantics for toolkit selection', async () => {
  const fixture = createFixture();
  const external = join(fixture.root, 'other');
  mkdirSync(join(external, 'child'), { recursive: true });
  renameSync(fixture.toolkit, join(external, 'toolkit'));
  symlinkSync(join(external, 'child'), join(fixture.root, 'link'));
  expect(
    (
      await readPreparationSource(fixture.request, {
        ...fixture.context,
        toolkitDirectory: 'link/../toolkit',
      })
    ).kind,
  ).toBe('ready');
});
for (const kind of ['clean', 'process'] as const)
  it('refuses actual ' + kind + ' filter before status can execute its sentinel', async () => {
    const fixture = createFixture(),
      marker = join(fixture.root, 'filter-ran'),
      program = join(fixture.root, 'filter.mjs');
    writeFileSync(
      program,
      'await Bun.write(' + JSON.stringify(marker) + ',"ran");process.exit(1);',
    );
    const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
    git(
      fixture.repository,
      'config',
      'filter.specimen.' + kind,
      quote(process.execPath) + ' --no-env-file --config=/dev/null ' + quote(program),
    );
    writeFileSync(join(fixture.repository, 'tracked.txt'), 'different\n');
    const observed = observeGit(fixture);
    const refusal = await refuse(readPreparationSource(fixture.request, fixture.context));
    expect(existsSync(marker)).toBe(false);
    expect(refusal.message).toContain('preparation refuses configured Git clean/process filters');
    expect(readFileSync(observed.log, 'utf8')).not.toContain('"status"');
    const direct = Bun.spawnSync(
      [
        '/usr/bin/git',
        '-C',
        fixture.repository,
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
        '--ignore-submodules=none',
      ],
      { env: fixture.context.runtime.environment, stdout: 'pipe', stderr: 'pipe', timeout: 5000 },
    );
    expect(direct.exitCode).not.toBeNull();
    expect(existsSync(marker)).toBe(true);
  });
it('does not treat a failed filter configuration query as absent filters', async () => {
  const fixture = createFixture(),
    observed = observeGit(
      fixture,
      'if(args.includes("config")){process.stderr.write("injected filter query failure");process.exit(42);}',
    );
  expect((await refuse(readPreparationSource(fixture.request, fixture.context))).message).toContain(
    'injected filter query failure',
  );
  expect(readFileSync(observed.log, 'utf8')).not.toContain('"status"');
});
for (const stage of ['version', 'commit', 'HEAD', 'filters', 'index', 'status'] as const)
  it('owns cancellation during ' + stage + ' query and starts no later query', async () => {
    const fixture = createFixture(),
      pid = join(fixture.root, 'query.pid');
    const matches =
      stage === 'version'
        ? 'args.includes("--version")'
        : stage === 'HEAD'
          ? 'args.includes("HEAD^{commit}")'
          : stage === 'commit'
            ? 'args.includes("--verify")'
            : stage === 'filters'
              ? 'args.includes("config")'
              : stage === 'index'
                ? 'args.includes("ls-files")'
                : 'args.includes("status")';
    const observed = observeGit(
      fixture,
      'if(' +
        matches +
        '){process.on("SIGINT",()=>undefined);writeFileSync(' +
        JSON.stringify(pid) +
        ',String(process.pid));await Bun.sleep(3000);process.exit(0);}',
    );
    const pending = readPreparationSource(fixture.request, fixture.context);
    try {
      await waitPath(pid);
      fixture.interrupt('SIGINT');
      expect(await pending).toEqual({ kind: 'cancelled', status: 130 });
      expect(isGone(Number(readFileSync(pid, 'utf8')))).toBe(true);
      const invocations = readFileSync(observed.log, 'utf8')
        .trim()
        .split('\n')
        .map(
          (line) =>
            JSON.parse(line) as {
              args: readonly string[];
              cwd: string;
              environment: Record<string, string>;
            },
        );
      expect(invocations.at(-1)?.args).toContain(
        stage === 'version'
          ? '--version'
          : stage === 'HEAD'
            ? 'HEAD^{commit}'
            : stage === 'commit'
              ? '--verify'
              : stage === 'filters'
                ? 'config'
                : stage === 'index'
                  ? 'ls-files'
                  : 'status',
      );
      expect(fixture.listeners.size).toBe(0);
    } finally {
      fixture.interrupt('SIGTERM');
      await Promise.allSettled([pending]);
    }
  });

for (const committed of [false, true])
  it(
    'refuses ' +
      (committed ? 'committed' : 'newly staged') +
      ' gitlink before nested filter execution',
    async () => {
      const fixture = createFixture(),
        origin = join(fixture.root, 'nested origin'),
        nested = join(fixture.repository, 'nested'),
        marker = join(fixture.root, 'nested-filter-ran'),
        program = join(fixture.root, 'nested-filter.mjs');
      mkdirSync(origin);
      git(origin, 'init', '--initial-branch=main');
      git(origin, 'config', 'user.name', 'PUNI Nested Fixture');
      git(origin, 'config', 'user.email', 'nested@example.test');
      writeFileSync(join(origin, '.gitattributes'), 'nested.txt filter=owned\n');
      writeFileSync(join(origin, 'nested.txt'), 'original\n');
      git(origin, 'add', '--all');
      git(origin, 'commit', '-m', 'nested');
      git(
        fixture.repository,
        '-c',
        'protocol.file.allow=always',
        'submodule',
        'add',
        origin,
        'nested',
      );
      if (committed) {
        git(fixture.repository, 'commit', '-am', 'gitlink');
        fixture.request.candidateSha = git(fixture.repository, 'rev-parse', 'HEAD');
      }
      const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
      writeFileSync(
        program,
        'await Bun.write(' + JSON.stringify(marker) + ',"ran");process.exit(1);',
      );
      git(
        nested,
        'config',
        'filter.owned.clean',
        quote(process.execPath) + ' --no-env-file --config=/dev/null ' + quote(program),
      );
      writeFileSync(join(nested, 'nested.txt'), 'modified\n');
      const observed = observeGit(fixture);
      const refusal = await refuse(readPreparationSource(fixture.request, fixture.context));
      expect(existsSync(marker)).toBe(false);
      expect(refusal.message).toContain('gitlink');
      expect(readFileSync(observed.log, 'utf8')).not.toContain('"status"');
      const direct = Bun.spawnSync(
        [
          '/usr/bin/git',
          '-C',
          fixture.repository,
          'status',
          '--porcelain=v1',
          '--untracked-files=all',
          '--ignore-submodules=none',
        ],
        { env: fixture.context.runtime.environment, stdout: 'pipe', stderr: 'pipe', timeout: 5000 },
      );
      expect(direct.exitCode).not.toBeNull();
      expect(existsSync(marker)).toBe(true);
    },
  );

for (const [stage, match, message] of [
  ['commit', 'args.includes("--verify")&&!args.includes("HEAD^{commit}")', 'revision is unknown'],
  ['HEAD', 'args.includes("HEAD^{commit}")', 'cannot resolve candidate HEAD'],
  ['index', 'args.includes("ls-files")', 'cannot inspect candidate index'],
  ['status', 'args.includes("status")', 'cannot inspect candidate status'],
] as const)
  it(
    'refuses failed ' + stage + ' query without treating it as an empty successful observation',
    async () => {
      const fixture = createFixture(),
        observed = observeGit(
          fixture,
          'if(' +
            match +
            '){process.stderr.write("injected ' +
            stage +
            ' failure");process.exit(42);}',
        );
      expect(
        (await refuse(readPreparationSource(fixture.request, fixture.context))).message,
      ).toContain(message);
      expect(
        readFileSync(observed.log, 'utf8')
          .trim()
          .split('\n')
          .map(
            (line) =>
              JSON.parse(line) as {
                args: readonly string[];
                cwd: string;
                environment: Record<string, string>;
              },
          )
          .at(-1)?.args,
      ).toContain(
        stage === 'commit'
          ? '--verify'
          : stage === 'HEAD'
            ? 'HEAD^{commit}'
            : stage === 'index'
              ? 'ls-files'
              : 'status',
      );
    },
  );
for (const [label, output, message] of [
  ['short commit', 'a'.repeat(39) + '\n', 'commit identity is malformed'],
  ['nonhex commit', 'z'.repeat(40) + '\n', 'commit identity is malformed'],
  ['substituted commit', 'b'.repeat(40) + '\n', 'differs from selected revision'],
] as const)
  it('refuses ' + label + ' from successful committed revision query', async () => {
    const fixture = createFixture();
    observeGit(
      fixture,
      'if(args.includes("--verify")&&!args.includes("HEAD^{commit}")){process.stdout.write(' +
        JSON.stringify(output) +
        ');process.exit(0);}',
    );
    expect(
      (await refuse(readPreparationSource(fixture.request, fixture.context))).message,
    ).toContain(message);
  });
for (const [label, output, message] of [
  ['unterminated index', '100644 ' + 'a'.repeat(40) + ' 0\ttracked.txt', 'NUL terminator'],
  [
    'invalid index mode',
    '999999 ' + 'a'.repeat(40) + ' 0\ttracked.txt\0',
    'inventory is malformed',
  ],
  ['nonzero-stage gitlink', '160000 ' + 'a'.repeat(40) + ' 2\tnested\0', 'indexed gitlinks'],
] as const)
  it('refuses ' + label + ' before status', async () => {
    const fixture = createFixture(),
      observed = observeGit(
        fixture,
        'if(args.includes("ls-files")){process.stdout.write(' +
          JSON.stringify(output) +
          ');process.exit(0);}',
      );
    expect(
      (await refuse(readPreparationSource(fixture.request, fixture.context))).message,
    ).toContain(message);
    expect(readFileSync(observed.log, 'utf8')).not.toContain('"status"');
  });
it('allows a real empty committed index with complete successful observations', async () => {
  const fixture = createFixture();
  git(fixture.repository, 'rm', '-r', '.');
  git(fixture.repository, 'commit', '-m', 'empty');
  fixture.request.candidateSha = git(fixture.repository, 'rev-parse', 'HEAD');
  expect((await readPreparationSource(fixture.request, fixture.context)).kind).toBe('ready');
});
it('refuses a runtime closure ancestor containing the actual candidate', async () => {
  const fixture = createFixture(),
    nested = join(fixture.toolkit, 'trusted-node-modules/candidate');
  renameSync(fixture.repository, nested);
  fixture.request.candidateRepository = nested;
  const descriptor = JSON.parse(readFileSync(join(fixture.toolkit, 'toolkit.json'), 'utf8')) as {
    schemaVersion: number;
    roles: Record<string, string>;
    trustedNodeModulesIdentity: string;
  };
  descriptor.trustedNodeModulesIdentity = hashTrustedModules(
    join(fixture.toolkit, 'trusted-node-modules'),
  );
  const bytes = Buffer.from(JSON.stringify(descriptor));
  writeFileSync(join(fixture.toolkit, 'toolkit.json'), bytes);
  fixture.context.expectedToolkitIdentity = hashBytes(bytes);
  expect((await refuse(readPreparationSource(fixture.request, fixture.context))).message).toContain(
    'overlaps',
  );
});
it('uses the actual candidate root for an interior request', async () => {
  const fixture = createFixture();
  mkdirSync(join(fixture.repository, 'interior'));
  const outcome = await readPreparationSource(
    { ...fixture.request, candidateRepository: 'candidate/interior' },
    fixture.context,
  );
  expect(outcome).toMatchObject({ kind: 'ready', candidateDirectory: fixture.repository });
});
it('captures request and runtime before the first owned await', async () => {
  const fixture = createFixture(),
    marker = join(fixture.root, 'version-paused');
  observeGit(
    fixture,
    'if(args.includes("--version")){writeFileSync(' +
      JSON.stringify(marker) +
      ',"ready");await Bun.sleep(150);}',
  );
  const original = fixture.sha,
    pending = readPreparationSource(fixture.request, fixture.context);
  await waitPath(marker);
  fixture.request.candidateSha = 'b'.repeat(40);
  fixture.request.candidateRepository = '/absent/changed';
  fixture.context.callerDirectory = '/absent/caller';
  Reflect.set(fixture.context.runtime.environment, 'GIT_DIR', '/absent/git');
  const outcome = await pending;
  expect(outcome).toMatchObject({
    kind: 'ready',
    sourceRevision: original,
    candidateDirectory: fixture.repository,
  });
  if (outcome.kind !== 'ready') throw new Error('wrong captured outcome');
  expect(outcome.runtime.environment['GIT_DIR']).toBeUndefined();
});
it('refuses unsupported Git before candidate discovery', async () => {
  const fixture = createFixture(),
    observed = observeGit(
      fixture,
      'if(args.includes("--version")){process.stdout.write("git version 2.35.1"+String.fromCharCode(10));process.exit(0);}',
    );
  expect((await refuse(readPreparationSource(fixture.request, fixture.context))).message).toContain(
    '2.36',
  );
  expect(readFileSync(observed.log, 'utf8').trim().split('\n')).toHaveLength(1);
});

for (const [stage, match] of [
  ['commit', 'args.includes("--verify")&&!args.includes("HEAD^{commit}")'],
  ['index', 'args.includes("ls-files")'],
] as const)
  it('preserves invalid UTF8 ' + stage + ' decoding failure', async () => {
    const fixture = createFixture();
    observeGit(
      fixture,
      'if(' + match + '){await Bun.write(Bun.stdout,Uint8Array.from([255]));process.exit(0);}',
    );
    const cause = await refuse(readPreparationSource(fixture.request, fixture.context));
    expect(cause).toBeInstanceOf(TypeError);
  });
