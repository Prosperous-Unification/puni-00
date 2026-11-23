import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it } from 'bun:test';

import type { LintInterrupt } from '../lint-interrupts';
import { readLintRuntime } from '../lint-runtime';
import { captureCommittedSource } from './committed-source';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const marker = join(root, 'batch.pid');
    if (existsSync(marker)) {
      const pid = Number(readFileSync(marker, 'utf8'));
      for (let attempt = 0; attempt < 1000 && !isGone(pid); attempt++) await Bun.sleep(5);
      if (!isGone(pid)) throw new Error('retained unconfirmed capture fixture: ' + root);
    }
    rmSync(root, { recursive: true, force: true });
  }
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
  const root = mkdtempSync(join(tmpdir(), 'puni committed source '));
  roots.push(root);
  const repository = join(root, 'candidate'),
    runtime = join(root, 'runtime');
  mkdirSync(repository);
  mkdirSync(runtime);
  git(repository, 'init', '--initial-branch=main');
  git(repository, 'config', 'user.name', 'PUNI Capture');
  git(repository, 'config', 'user.email', 'capture@example.test');
  writeFileSync(join(repository, 'alpha.txt'), 'alpha\n');
  git(repository, 'add', '--all');
  git(repository, 'commit', '-m', 'baseline');
  const revision = git(repository, 'rev-parse', 'HEAD'),
    blob = git(repository, 'rev-parse', 'HEAD:alpha.txt');
  const listeners = new Set<(signal: LintInterrupt) => void>();
  let first: LintInterrupt | undefined;
  const interrupt = (signal: LintInterrupt) => {
    first ??= signal;
    for (const listener of listeners) listener(signal);
  };
  const context = {
    repository,
    runtime: readLintRuntime('/usr/bin:/bin', runtime),
    subscribeInterrupts: (listener: (signal: LintInterrupt) => void) => {
      listeners.add(listener);
      if (first !== undefined) listener(first);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return { root, repository, runtime, revision, blob, context, interrupt, listeners };
}
function observeGit(fixture: ReturnType<typeof createFixture>, behavior: string) {
  const directory = join(fixture.root, 'lookup'),
    log = join(fixture.root, 'queries.jsonl');
  mkdirSync(directory);
  writeFileSync(
    join(directory, 'git'),
    '#!' +
      process.execPath +
      ' --no-env-file --config=/dev/null\nimport{appendFileSync,writeFileSync}from"node:fs";const args=process.argv.slice(2);appendFileSync(' +
      JSON.stringify(log) +
      ',JSON.stringify({args,cwd:process.cwd(),environment:process.env})+String.fromCharCode(10));' +
      behavior +
      'const child=Bun.spawn(["/usr/bin/git",...args],{env:process.env,stdin:"inherit",stdout:"inherit",stderr:"inherit"});process.exitCode=await child.exited;\n',
    { mode: 0o755 },
  );
  fixture.context.runtime = readLintRuntime(directory + ':/usr/bin:/bin', fixture.runtime);
  return log;
}
async function capture(fixture: ReturnType<typeof createFixture>, revision = fixture.revision) {
  const outcome = await captureCommittedSource(revision, fixture.context);
  if (outcome.kind !== 'captured') throw new Error('expected captured source');
  return outcome.source;
}
async function refuse(pending: Promise<unknown>) {
  const cause: unknown = await pending.then(
    () => {
      throw new Error('capture unexpectedly passed');
    },
    (cause: unknown) => cause,
  );
  if (!(cause instanceof Error)) throw new Error('wrong capture refusal', { cause });
  return cause;
}
async function waitPath(path: string) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    if (existsSync(path)) return;
    await Bun.sleep(5);
  }
  throw new Error('capture marker absent: ' + path);
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

it('captures committed binary bytes, modes and exact Unicode BOM whitespace paths without live checkout reads', async () => {
  const fixture = createFixture(),
    payload = Uint8Array.from([0, 10, 255, 13, 128, 0, 65]);
  for (const path of ['binary.bin', 'duplicate.bin', ' spaces \n\u96EA', '\uFEFFname'])
    writeFileSync(join(fixture.repository, path), payload);
  writeFileSync(join(fixture.repository, 'executable.ts'), 'committed executable\n');
  chmodSync(join(fixture.repository, 'executable.ts'), 0o755);
  symlinkSync('binary.bin', join(fixture.repository, 'link'));
  git(fixture.repository, 'add', '--all');
  git(fixture.repository, 'commit', '-m', 'binary');
  const revision = git(fixture.repository, 'rev-parse', 'HEAD'),
    tree = git(fixture.repository, 'rev-parse', 'HEAD^{tree}');
  writeFileSync(join(fixture.repository, 'binary.bin'), 'uncommitted substitution');
  rmSync(join(fixture.repository, 'executable.ts'));
  const source = await capture(fixture, revision),
    snapshot = source.readSnapshot();
  expect(snapshot.selection).toEqual({ kind: 'committed', revision, tree });
  expect(snapshot.untracked).toEqual([]);
  for (const path of ['binary.bin', 'duplicate.bin', ' spaces \n\u96EA', '\uFEFFname'])
    expect(source.readFile(path)).toEqual(payload);
  expect(source.readFile('executable.ts')).toEqual(Buffer.from('committed executable\n'));
  expect(source.readFile('link')).toEqual(Buffer.from('binary.bin'));
  expect(snapshot.entries.find((entry) => entry.path === 'executable.ts')?.mode).toBe('100755');
  expect(snapshot.entries.find((entry) => entry.path === 'link')?.mode).toBe('120000');
});
it('retains explicitly selected earlier commit and never silently reselects HEAD', async () => {
  const fixture = createFixture();
  writeFileSync(join(fixture.repository, 'alpha.txt'), 'later\n');
  git(fixture.repository, 'commit', '-am', 'later');
  const source = await capture(fixture);
  expect(source.readSnapshot().selection).toMatchObject({
    kind: 'committed',
    revision: fixture.revision,
  });
  expect(source.readFile('alpha.txt')).toEqual(Buffer.from('alpha\n'));
});
it('returns fresh snapshot and file copies without aliases across paths or callers', async () => {
  const fixture = createFixture();
  writeFileSync(join(fixture.repository, 'duplicate.txt'), 'alpha\n');
  git(fixture.repository, 'add', '--all');
  git(fixture.repository, 'commit', '-m', 'duplicate');
  const source = await capture(fixture, git(fixture.repository, 'rev-parse', 'HEAD'));
  source.readFile('alpha.txt').fill(0);
  const metadata = source.readSnapshot(),
    first = metadata.entries.at(0);
  if (first === undefined || metadata.selection.kind !== 'committed')
    throw new Error('invalid capture fixture metadata');
  first.path = 'changed-path';
  first.mode = '120000';
  first.blob = '0'.repeat(40);
  metadata.selection.revision = '0'.repeat(40);
  metadata.selection.tree = '0'.repeat(40);
  const fresh = source.readSnapshot();
  expect(fresh.entries.find((entry) => entry.path === 'alpha.txt')).toMatchObject({
    mode: '100644',
    blob: fixture.blob,
  });
  expect(fresh.selection).toMatchObject({
    revision: git(fixture.repository, 'rev-parse', 'HEAD'),
    tree: git(fixture.repository, 'rev-parse', 'HEAD^{tree}'),
  });
  source.readSnapshot().entries.splice(0);
  expect(source.readFile('alpha.txt')).toEqual(Buffer.from('alpha\n'));
  expect(source.readFile('duplicate.txt')).toEqual(Buffer.from('alpha\n'));
  expect(source.readSnapshot().entries).toHaveLength(2);
  expect(() => source.readFile('absent')).toThrow('absent');
});
it('requests each selected object once through explicit owned Git authority', async () => {
  const fixture = createFixture();
  writeFileSync(join(fixture.repository, 'duplicate.txt'), 'alpha\n');
  git(fixture.repository, 'add', '--all');
  git(fixture.repository, 'commit', '-m', 'duplicate');
  const log = observeGit(
    fixture,
    'if(args.includes("cat-file")){const input=await Bun.stdin.bytes();appendFileSync(' +
      JSON.stringify(join(fixture.root, 'requested')) +
      ',input);const child=Bun.spawn(["/usr/bin/git",...args],{env:process.env,stdin:input,stdout:"inherit",stderr:"inherit"});process.exitCode=await child.exited;process.exit();}',
  );
  const previous = process.env['GIT_DIR'];
  process.env['GIT_DIR'] = '/poison';
  try {
    await capture(fixture, git(fixture.repository, 'rev-parse', 'HEAD'));
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, 'GIT_DIR');
    else process.env['GIT_DIR'] = previous;
  }
  expect(readFileSync(join(fixture.root, 'requested'), 'utf8')).toBe(fixture.blob + '\n');
  const invocations = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map(
      (line) =>
        JSON.parse(line) as { args: string[]; cwd: string; environment: Record<string, string> },
    );
  expect(invocations.filter((invocation) => invocation.args.includes('cat-file'))).toHaveLength(1);
  for (const invocation of invocations) {
    expect(invocation.cwd).toBe(fixture.runtime);
    expect(invocation.environment['GIT_DIR']).toBeUndefined();
  }
  expect(fixture.listeners.size).toBe(0);
});
it('captures a real empty tree without starting a blob reader', async () => {
  const fixture = createFixture();
  git(fixture.repository, 'rm', 'alpha.txt');
  git(fixture.repository, 'commit', '-m', 'empty');
  const log = observeGit(fixture, '');
  const source = await capture(fixture, git(fixture.repository, 'rev-parse', 'HEAD'));
  expect(source.readSnapshot().entries).toEqual([]);
  expect(readFileSync(log, 'utf8')).not.toContain('"cat-file"');
});
it('returns prior cancellation before absent repository IO', async () => {
  const fixture = createFixture();
  fixture.interrupt('SIGTERM');
  expect(
    await captureCommittedSource(fixture.revision, { ...fixture.context, repository: '/absent' }),
  ).toEqual({ kind: 'cancelled', status: 143 });
  expect(fixture.listeners.size).toBe(0);
});
for (const revision of ['HEAD', 'z'.repeat(40), 'a'.repeat(39), 'a'.repeat(40) + '\n'])
  it('refuses nonfull capture revision ' + JSON.stringify(revision) + ' before Git', async () => {
    const fixture = createFixture(),
      log = observeGit(fixture, '');
    expect((await refuse(captureCommittedSource(revision, fixture.context))).message).toContain(
      'revision',
    );
    expect(existsSync(log)).toBe(false);
  });
for (const [label, response] of [
  ['unterminated header', (oid: string) => oid + ' blob'],
  ['wrong object', (_oid: string) => 'b'.repeat(40) + ' blob 6\nalpha\n\n'],
  ['wrong type', (oid: string) => oid + ' tree 6\nalpha\n\n'],
  ['invalid size', (oid: string) => oid + ' blob nope\nalpha\n\n'],
  ['negative size', (oid: string) => oid + ' blob -1\nalpha\n\n'],
  ['unbounded size', (oid: string) => oid + ' blob 9007199254740993\nalpha\n\n'],
  ['truncated bytes', (oid: string) => oid + ' blob 6\nal'],
  ['missing payload LF', (oid: string) => oid + ' blob 6\nalpha\n'],
  ['missing object', (oid: string) => oid + ' missing\n'],
  ['substituted payload', (oid: string) => oid + ' blob 6\nALPHA\n\n'],
  ['trailing bytes', (oid: string) => oid + ' blob 6\nalpha\n\nextra'],
] as const)
  it('refuses batch ' + label + ' rather than returning partial captured source', async () => {
    const fixture = createFixture();
    observeGit(
      fixture,
      'if(args.includes("cat-file")){await Bun.stdin.bytes();process.stdout.write(' +
        JSON.stringify(response(fixture.blob)) +
        ');process.exit(0);}',
    );
    const cause = await refuse(captureCommittedSource(fixture.revision, fixture.context));
    expect(cause.message).toMatch(/batch|blob/u);
  });
for (const [stage, match] of [
  ['commit', 'args.includes("--verify")'],
  ['tree', 'args.some(arg=>arg.endsWith("^{tree}"))'],
  ['entries', 'args.includes("ls-tree")'],
  ['batch', 'args.includes("cat-file")'],
] as const)
  it('refuses failed ' + stage + ' capture query with original diagnostics', async () => {
    const fixture = createFixture();
    observeGit(
      fixture,
      'if(' +
        match +
        '){process.stderr.write("injected ' +
        stage +
        ' capture failure");process.exit(42);}',
    );
    expect(
      (await refuse(captureCommittedSource(fixture.revision, fixture.context))).message,
    ).toContain('injected ' + stage + ' capture failure');
  });
for (const path of ['/absolute', '../escape', 'a/../escape', 'a//empty', 'a/./dot'])
  it('refuses noncanonical captured path ' + JSON.stringify(path), async () => {
    const fixture = createFixture();
    const entry = '100644 blob ' + fixture.blob + '\t' + path + '\0';
    const log = observeGit(
      fixture,
      'if(args.includes("ls-tree")){process.stdout.write(' +
        JSON.stringify(entry) +
        ');process.exit(0);}',
    );
    expect(
      (await refuse(captureCommittedSource(fixture.revision, fixture.context))).message,
    ).toContain('path');
    expect(readFileSync(log, 'utf8')).not.toContain('"cat-file"');
  });
for (const [label, entries] of [
  ['duplicate', ['same', 'same']],
  ['ancestor', ['file', 'file/child']],
] as const)
  it('refuses ' + label + ' captured paths before batching', async () => {
    const fixture = createFixture();
    const output = entries
      .map((path) => '100644 blob ' + fixture.blob + '\t' + path + '\0')
      .join('');
    const log = observeGit(
      fixture,
      'if(args.includes("ls-tree")){process.stdout.write(' +
        JSON.stringify(output) +
        ');process.exit(0);}',
    );
    expect(
      (await refuse(captureCommittedSource(fixture.revision, fixture.context))).message,
    ).toContain('path');
    expect(readFileSync(log, 'utf8')).not.toContain('"cat-file"');
  });
it('refuses committed gitlinks before batching', async () => {
  const fixture = createFixture();
  git(
    fixture.repository,
    'update-index',
    '--add',
    '--cacheinfo',
    '160000,' + fixture.revision + ',nested',
  );
  git(fixture.repository, 'commit', '-m', 'gitlink');
  const log = observeGit(fixture, '');
  expect(
    (
      await refuse(
        captureCommittedSource(git(fixture.repository, 'rev-parse', 'HEAD'), fixture.context),
      )
    ).message,
  ).toContain('gitlink');
  expect(readFileSync(log, 'utf8')).not.toContain('"cat-file"');
});
it('returns cancellation before parsing a captured batch prefix and confirms group absence', async () => {
  const fixture = createFixture(),
    pid = join(fixture.root, 'batch.pid');
  observeGit(
    fixture,
    'if(args.includes("cat-file")){await Bun.stdin.bytes();await Bun.write(Bun.stdout,' +
      JSON.stringify(fixture.blob + ' blob 6\nal') +
      ');process.on("SIGINT",()=>undefined);writeFileSync(' +
      JSON.stringify(pid) +
      ',String(process.pid));await Bun.sleep(3000);process.exit(0);}',
  );
  const pending = captureCommittedSource(fixture.revision, fixture.context);
  try {
    await waitPath(pid);
    fixture.interrupt('SIGINT');
    expect(await pending).toEqual({ kind: 'cancelled', status: 130 });
    expect(isGone(Number(readFileSync(pid, 'utf8')))).toBe(true);
    expect(fixture.listeners.size).toBe(0);
  } finally {
    fixture.interrupt('SIGTERM');
    await Promise.allSettled([pending]);
  }
});

for (const [stage, match] of [
  ['commit', 'args.some(arg=>arg.endsWith("^{commit}"))'],
  ['tree', 'args.some(arg=>arg.endsWith("^{tree}"))'],
] as const)
  it('refuses malformed ' + stage + ' identity returned with status0', async () => {
    const fixture = createFixture();
    const log = observeGit(
      fixture,
      'if(' +
        match +
        '){process.stdout.write("not-an-oid"+String.fromCharCode(10));process.exit(0);}',
    );
    expect((await refuse(captureCommittedSource(fixture.revision, fixture.context))).message).toBe(
      'committed source query returned malformed identity',
    );
    expect(readFileSync(log, 'utf8')).not.toContain('"ls-tree"');
  });
it('refuses substituted resolved commit before tree capture', async () => {
  const fixture = createFixture(),
    log = observeGit(
      fixture,
      'if(args.some(arg=>arg.endsWith("^{commit}"))){process.stdout.write(' +
        JSON.stringify('b'.repeat(40)) +
        '+String.fromCharCode(10));process.exit(0);}',
    );
  expect(
    (await refuse(captureCommittedSource(fixture.revision, fixture.context))).message,
  ).toContain('another commit');
  expect(readFileSync(log, 'utf8')).not.toContain('"ls-tree"');
});
it('rejects reverse-ordered file-ancestor collisions before batching', async () => {
  const fixture = createFixture(),
    output = ['file/child', 'file']
      .map((path) => '100644 blob ' + fixture.blob + '\t' + path + '\0')
      .join('');
  const log = observeGit(
    fixture,
    'if(args.includes("ls-tree")){process.stdout.write(' +
      JSON.stringify(output) +
      ');process.exit(0);}',
  );
  expect(
    (await refuse(captureCommittedSource(fixture.revision, fixture.context))).message,
  ).toContain('ancestor');
  expect(readFileSync(log, 'utf8')).not.toContain('"cat-file"');
});
for (const [stage, match] of [
  ['commit', 'args.some(arg=>arg.endsWith("^{commit}"))'],
  ['tree', 'args.some(arg=>arg.endsWith("^{tree}"))'],
] as const)
  it('preserves invalid UTF8 ' + stage + ' identity decoding failure', async () => {
    const fixture = createFixture();
    observeGit(
      fixture,
      'if(' + match + '){await Bun.write(Bun.stdout,Uint8Array.from([255]));process.exit(0);}',
    );
    expect(await refuse(captureCommittedSource(fixture.revision, fixture.context))).toBeInstanceOf(
      TypeError,
    );
  });
for (const [stage, match, argument] of [
  ['commit', 'args.some(arg=>arg.endsWith("^{commit}"))', '--verify'],
  ['tree', 'args.some(arg=>arg.endsWith("^{tree}"))', '--verify'],
  ['entries', 'args.includes("ls-tree")', 'ls-tree'],
] as const)
  it(
    'owns ' +
      stage +
      ' capture cancellation before parsing partial output or starting later queries',
    async () => {
      const fixture = createFixture(),
        pid = join(fixture.root, 'batch.pid');
      const log = observeGit(
        fixture,
        'if(' +
          match +
          '){await Bun.write(Bun.stdout,"partial");process.on("SIGINT",()=>undefined);writeFileSync(' +
          JSON.stringify(pid) +
          ',String(process.pid));await Bun.sleep(3000);process.exit(0);}',
      );
      const pending = captureCommittedSource(fixture.revision, fixture.context);
      try {
        await waitPath(pid);
        fixture.interrupt('SIGINT');
        expect(await pending).toEqual({ kind: 'cancelled', status: 130 });
        expect(isGone(Number(readFileSync(pid, 'utf8')))).toBe(true);
        const invocations = readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as { args: string[] });
        expect(invocations.at(-1)?.args).toContain(argument);
        expect(fixture.listeners.size).toBe(0);
      } finally {
        fixture.interrupt('SIGTERM');
        await Promise.allSettled([pending]);
      }
    },
  );
it('captures repository and environment before the first owned await', async () => {
  const fixture = createFixture(),
    marker = join(fixture.root, 'commit-paused');
  observeGit(
    fixture,
    'if(args.some(arg=>arg.endsWith("^{commit}"))){writeFileSync(' +
      JSON.stringify(marker) +
      ',"paused");await Bun.sleep(150);}',
  );
  const pending = captureCommittedSource(fixture.revision, fixture.context);
  await waitPath(marker);
  fixture.context.repository = '/absent/repository';
  Reflect.set(fixture.context.runtime.environment, 'GIT_DIR', '/poison');
  const outcome = await pending;
  expect(outcome.kind).toBe('captured');
  if (outcome.kind !== 'captured') throw new Error('wrong captured result');
  expect(outcome.source.readFile('alpha.txt')).toEqual(Buffer.from('alpha\n'));
});

it('refuses absent parsed object after a broken batch decoder instead of manufacturing empty bytes', () => {
  const fixture = createFixture(),
    program = [
      'import{mock}from"bun:test";',
      'mock.module(' +
        JSON.stringify(new URL('../inventory/blob-batch.ts', import.meta.url).href) +
        ',()=>({parseBlobBatch:()=>new Map()}));',
      'const{captureCommittedSource}=await import(' +
        JSON.stringify(new URL('./committed-source.ts', import.meta.url).href) +
        ');',
      'try{await captureCommittedSource(' +
        JSON.stringify(fixture.revision) +
        ',{repository:' +
        JSON.stringify(fixture.repository) +
        ',runtime:' +
        JSON.stringify(fixture.context.runtime) +
        ',subscribeInterrupts:()=>()=>undefined});process.stdout.write("unexpectedly captured");}catch(cause){process.stdout.write(cause instanceof Error?cause.message:String(cause));}',
    ].join('\n');
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    {
      cwd: import.meta.dir,
      env: { PATH: '/usr/bin:/bin' },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 10000,
    },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(child.stdout.toString()).toContain('captured blob absent from batch');
});

it('returns prior cancellation before malformed capture revision validation', async () => {
  const fixture = createFixture();
  fixture.interrupt('SIGINT');
  expect(await captureCommittedSource('not-a-revision', fixture.context)).toEqual({
    kind: 'cancelled',
    status: 130,
  });
  expect(fixture.listeners.size).toBe(0);
});
