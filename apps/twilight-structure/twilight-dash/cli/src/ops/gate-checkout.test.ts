import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { type Context, type Request, runCheckout, type Scope } from './gate-checkout';
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
const gitExecutable = realpathSync('/usr/bin/git');
function git(tree: string, ...argv: string[]): string {
  const child = Bun.spawnSync([gitExecutable, '-C', tree, ...argv], {
    env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (child.exitCode !== 0) throw Error(child.stderr.toString());
  return child.stdout.toString().trim();
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni gate checkout '));
  roots.push(root);
  const tree = join(root, 'tree');
  mkdirSync(tree);
  git(tree, 'init', '-q', '-b', 'original');
  git(tree, 'config', 'user.name', 'Gate test');
  git(tree, 'config', 'user.email', 'gate@example.test');
  mkdirSync(join(tree, 'nested'));
  writeFileSync(join(tree, 'nested', 'tracked'), 'original');
  git(tree, 'add', '.');
  git(tree, 'commit', '-qm', 'original');
  const original = git(tree, 'rev-parse', 'HEAD');
  writeFileSync(join(tree, 'nested', 'tracked'), 'candidate');
  git(tree, 'commit', '-qam', 'candidate');
  const candidate = git(tree, 'rev-parse', 'HEAD');
  git(tree, 'checkout', '-q', original);
  git(tree, 'checkout', '-q', '-B', 'original');
  return { root, tree, original, candidate, path: join(root, 'mutex') };
}
function request(f: ReturnType<typeof fixture>, settle: Request['settle'] = 'restore'): Request {
  return { tree: f.tree, commit: f.candidate, settle, repairModes: false };
}
function context(
  f: ReturnType<typeof fixture>,
  work: Context['work'] = () => Promise.resolve(0),
): Context {
  return {
    path: f.path,
    label: 'checkout test',
    waitSeconds: 1,
    pollSeconds: 1,
    gitExecutable,
    lookupPath: '/usr/bin:/bin',
    signal: new AbortController().signal,
    reportAdmission: () => Promise.resolve(),
    reportHead: () => Promise.resolve(),
    reportFailure: () => Promise.resolve(),
    reportUnconfirmed: () => Promise.resolve(),
    work,
  };
}
async function completed(f: ReturnType<typeof fixture>, req = request(f), ctx = context(f)) {
  const capture = process.env['PUNI_GATE_R5_CAPTURE'];
  if (capture !== undefined) {
    const name = randomUUID();
    cpSync(f.root, join(capture, name), { recursive: true, verbatimSymlinks: true });
    writeFileSync(
      join(capture, name + '.json'),
      JSON.stringify({
        request: req,
        git: ctx.gitExecutable,
        lookup: ctx.lookupPath,
        root: f.root,
        tree: f.tree,
        original: f.original,
        candidate: f.candidate,
      }),
    );
  }
  const outcome = await runCheckout(req, ctx);
  expect(outcome.kind).toBe('completed');
  if (outcome.kind !== 'completed') throw Error('checkout was not admitted');
  return outcome.value;
}
it('runs the requested full commit under actual native ownership and restores its attached original', async () => {
  const f = fixture();
  let observed = '';
  const outcome = await completed(
    f,
    request(f),
    context(f, async (scope) => {
      observed = git(f.tree, 'rev-parse', 'HEAD');
      expect(existsSync(f.path + '.d')).toBe(true);
      const { holdLock } = await import('@shared/heavy-lock');
      expect((await holdLock(f.path, () => Promise.resolve(undefined))).kind).toBe('busy');
      return await scope.runChild([
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        '--eval',
        'process.exitCode=37;',
      ]);
    }),
  );
  expect(observed).toBe(f.candidate);
  expect(outcome.status).toBe(37);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
  expect(git(f.tree, 'symbolic-ref', 'HEAD')).toBe('refs/heads/original');
});
it('keeps successful local candidate only in keep mode', async () => {
  const f = fixture();
  expect((await completed(f, request(f, 'keep'))).status).toBe(0);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.candidate);
});
for (const dirty of ['tracked', 'untracked', 'large'] as const)
  it('refuses ' + dirty + ' dirty bytes65 without work or deletion', async () => {
    const f = fixture();
    if (dirty === 'tracked') writeFileSync(join(f.tree, 'nested', 'tracked'), 'private');
    else
      for (let i = 0; i < (dirty === 'large' ? 2000 : 1); i++)
        writeFileSync(join(f.tree, 'untracked ' + String(i)), 'private');
    let entered = false;
    const outcome = await completed(
      f,
      request(f),
      context(f, () => {
        entered = true;
        return Promise.resolve(0);
      }),
    );
    expect(outcome.status).toBe(65);
    expect(entered).toBe(false);
    expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
    expect(
      readFileSync(join(f.tree, dirty === 'tracked' ? 'nested/tracked' : 'untracked 0'), 'utf8'),
    ).toBe('private');
  });
for (const mode of ['file', 'directory'] as const)
  it('refuses private tracked ' + mode + '66 and opt-in repairs only tracked targets', async () => {
    const f = fixture(); // Equal candidate bytes keep existing modes across Git checkout.
    git(f.tree, 'checkout', '-q', f.candidate);
    chmodSync(
      join(f.tree, mode === 'file' ? 'nested/tracked' : 'nested'),
      mode === 'file' ? 0o600 : 0o700,
    );
    const ignored = join(f.tree, 'ignored');
    writeFileSync(join(f.tree, '.git', 'info', 'exclude'), 'ignored\n');
    writeFileSync(ignored, 'unchanged', { mode: 0o600 });
    const untracked = join(f.root, 'outside');
    writeFileSync(untracked, 'untouched', { mode: 0o600 });
    symlinkSync(untracked, join(f.tree, 'link'));
    git(f.tree, 'add', 'link');
    git(f.tree, 'commit', '-qm', 'symlink');
    const candidate = git(f.tree, 'rev-parse', 'HEAD');
    const req = { ...request(f), commit: candidate };
    expect((await completed(f, req)).status).toBe(66);
    expect((await completed(f, { ...req, repairModes: true })).status).toBe(0);
    expect(Bun.file(untracked).size).toBe(9);
    expect(lstatSync(untracked).mode & 0o777).toBe(0o600);
    expect(lstatSync(ignored).mode & 0o777).toBe(0o600);
    expect(
      lstatSync(join(f.tree, mode === 'file' ? 'nested/tracked' : 'nested')).mode &
        (mode === 'file' ? 0o004 : 0o005),
    ).toBe(mode === 'file' ? 0o004 : 0o005);
    expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(candidate);
  });
it('restores detached originals without inventing a branch', async () => {
  const f = fixture();
  git(f.tree, 'checkout', '-q', '--detach', f.original);
  expect((await completed(f)).status).toBe(0);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
  const ref = Bun.spawnSync([gitExecutable, '-C', f.tree, 'symbolic-ref', '-q', 'HEAD']);
  expect(ref.exitCode).toBe(1);
});
for (const change of ['moved', 'deleted'] as const)
  it('preserves ' + change + ' original branch and saved detached commit74', async () => {
    const f = fixture();
    const outcome = await completed(
      f,
      request(f),
      context(f, () => {
        if (change === 'moved') git(f.tree, 'update-ref', 'refs/heads/original', f.candidate);
        else git(f.tree, 'update-ref', '-d', 'refs/heads/original');
        return Promise.resolve(37);
      }),
    );
    expect(outcome.status).toBe(74);
    expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
    const ref = Bun.spawnSync(
      [gitExecutable, '-C', f.tree, 'rev-parse', '--verify', '--quiet', 'refs/heads/original'],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(ref.exitCode).toBe(change === 'moved' ? 0 : 1);
    if (change === 'moved') expect(ref.stdout.toString().trim()).toBe(f.candidate);
    expect(outcome.failures.some((failure) => failure.phase === 'work')).toBe(true);
  });
it('refuses effective executable filters before Git status or candidate checkout', async () => {
  const f = fixture(),
    marker = join(f.root, 'filter-ran'),
    program = join(f.root, 'filter');
  writeFileSync(
    program,
    '#!' +
      process.execPath +
      '\nawait Bun.write(' +
      JSON.stringify(marker) +
      ',"executed");process.stdout.write(await Bun.stdin.text());',
    { mode: 0o755 },
  );
  git(f.tree, 'config', 'filter.evil.clean', program);
  writeFileSync(join(f.tree, '.git', 'info', 'attributes'), 'nested/tracked filter=evil\n');
  writeFileSync(join(f.tree, 'nested', 'tracked'), 'original');
  let entered = false;
  const outcome = await completed(
    f,
    request(f),
    context(f, () => {
      entered = true;
      return Promise.resolve(0);
    }),
  );
  expect(existsSync(marker)).toBe(false);
  expect(entered).toBe(false);
  expect(outcome.status).toBe(70);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
});
it('refuses gitlinks before candidate checkout', async () => {
  const f = fixture();
  git(f.tree, 'update-index', '--add', '--cacheinfo', '160000,' + f.original + ',submodule');
  git(f.tree, 'commit', '-qm', 'gitlink');
  const req = { ...request(f), commit: git(f.tree, 'rev-parse', 'HEAD') };
  git(f.tree, 'checkout', '-q', f.original);
  const marker = join(f.root, 'gitlink-checkout');
  const ctx = {
    ...context(f),
    gitExecutable: wrapper(
      f,
      'if(argv.includes("checkout")&&argv.at(-1)===' +
        JSON.stringify(req.commit) +
        ')await Bun.write(' +
        JSON.stringify(marker) +
        ',"entered");',
    ),
  };
  const outcome = await completed(f, req, ctx);
  expect(existsSync(marker)).toBe(false);
  expect(outcome.status).toBe(70);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
});
it('waits for a started child even when work throws before awaiting it', async () => {
  const f = fixture(),
    done = join(f.root, 'done');
  let launched: Promise<number> | undefined, failure: unknown;
  try {
    const outcome = await completed(
      f,
      request(f),
      context(f, (scope) => {
        launched = scope.runChild([
          process.execPath,
          '--no-env-file',
          '--config=/dev/null',
          '--eval',
          'await Bun.sleep(100);await Bun.write(' + JSON.stringify(done) + ',"done");',
        ]);
        return Promise.reject(Error('primary work cause'));
      }),
    );
    expect(launched).toBeDefined();
    expect(existsSync(done)).toBe(true);
    expect(outcome.status).toBe(70);
    expect(outcome.failures.some((failure) => failure.phase === 'work')).toBe(true);
    expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
  } catch (cause) {
    failure = cause;
  } finally {
    if (launched !== undefined)
      try {
        await launched;
      } catch (cause) {
        failure =
          failure === undefined
            ? cause
            : new AggregateError(
                [failure, cause],
                'checkout assertion and owned child cleanup failed',
              );
      }
  }
  if (failure !== undefined)
    throw failure instanceof Error
      ? failure
      : new Error('checkout child control failed', { cause: failure });
});

function wrapper(f: ReturnType<typeof fixture>, body: string): string {
  const path = join(f.root, 'git-wrapper');
  writeFileSync(
    path,
    '#!' +
      process.execPath +
      '\nconst argv=process.argv.slice(2);' +
      body +
      '\nconst child=Bun.spawnSync(["/usr/bin/git",...argv],{env:process.env,stdin:"ignore",stdout:"inherit",stderr:"inherit"});process.exit(child.exitCode);',
    { mode: 0o755 },
  );
  return path;
}
it('refuses a successful checkout response with the wrong actual HEAD', async () => {
  const f = fixture(),
    ctx = {
      ...context(f),
      gitExecutable: wrapper(
        f,
        'if(argv.includes("checkout")&&argv.at(-1)===' +
          JSON.stringify(f.candidate) +
          ')process.exit(0);',
      ),
    };
  let entered = false;
  const outcome = await completed(f, request(f), {
    ...ctx,
    work: () => {
      entered = true;
      return Promise.resolve(0);
    },
  });
  expect(entered).toBe(false);
  expect(outcome.status).toBe(70);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
});
it('propagates required Git status scan failures before work', async () => {
  const f = fixture(),
    ctx = {
      ...context(f),
      gitExecutable: wrapper(f, 'if(argv.includes("status"))process.exit(41);'),
    };
  expect((await completed(f, request(f), ctx)).status).toBe(70);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
});
it('rejects incomplete NUL-framed tracked path scans before checkout', async () => {
  const f = fixture(),
    marker = join(f.root, 'malformed-checkout');
  const ctx = {
    ...context(f),
    gitExecutable: wrapper(
      f,
      'if(argv.includes("checkout")&&argv.at(-1)===' +
        JSON.stringify(f.candidate) +
        ')await Bun.write(' +
        JSON.stringify(marker) +
        ',"entered");' +
        'if(argv.includes("ls-tree")){process.stdout.write("100644 blob ' +
        f.original +
        '\\ttracked");process.exit(0);}',
    ),
  };
  const outcome = await completed(f, request(f), ctx);
  expect(existsSync(marker)).toBe(false);
  expect(outcome.status).toBe(70);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
});
it('retains primary work and reporting causes when restoration fails74', async () => {
  const f = fixture(),
    ctx = {
      ...context(f),
      gitExecutable: wrapper(
        f,
        'if(argv.includes("checkout")&&argv.at(-1)===' +
          JSON.stringify(f.original) +
          ')process.exit(42);',
      ),
      work: (scope: Scope) =>
        scope.runChild([
          process.execPath,
          '--no-env-file',
          '--config=/dev/null',
          '--eval',
          'process.exitCode=37;',
        ]),
      reportFailure: () => Promise.reject(Error('controlled report failure')),
    };
  const outcome = await completed(f, request(f), ctx);
  expect(outcome.status).toBe(74);
  expect(outcome.failures.map((failure) => failure.phase)).toEqual([
    'work',
    'work',
    'restore',
    'report',
    'report',
    'report',
  ]);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.candidate);
});
it('disables actual configured checkout hooks and fsmonitor before status', async () => {
  const f = fixture(),
    marker = join(f.root, 'untrusted-ran'),
    program = join(f.root, 'untrusted'),
    monitor = join(f.root, 'valid fsmonitor');
  writeFileSync(
    program,
    '#!' + process.execPath + '\nawait Bun.write(' + JSON.stringify(marker) + ',"executed");',
    { mode: 0o755 },
  );
  writeFileSync(
    monitor,
    '#!' +
      process.execPath +
      '\nawait Bun.write(' +
      JSON.stringify(marker) +
      ',JSON.stringify(process.argv.slice(2)));process.stdout.write("c33-token\\0/\\0");',
    { mode: 0o755 },
  );
  git(f.tree, 'config', 'core.fsmonitor', JSON.stringify(monitor));
  git(f.tree, 'config', 'core.fsmonitorHookVersion', '2');
  writeFileSync(
    join(f.tree, '.git', 'hooks', 'post-checkout'),
    '#!' + process.execPath + '\nawait Bun.write(' + JSON.stringify(marker) + ',"executed");',
    { mode: 0o755 },
  );
  const unprotected = Bun.spawnSync(
    [gitExecutable, '-C', f.tree, 'status', '--porcelain=v1', '-z'],
    {
      env: {
        PATH: '/usr/bin:/bin',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  expect(unprotected.exitCode, unprotected.stderr.toString()).toBe(0);
  expect(unprotected.stderr.toString()).toBe('');
  expect(unprotected.stdout.byteLength).toBe(0);
  const invocation: unknown = JSON.parse(readFileSync(marker, 'utf8'));
  expect(invocation).toEqual(['2', expect.any(String)]);
  rmSync(marker);
  expect((await completed(f)).status).toBe(0);
  expect(existsSync(marker)).toBe(false);
});
it('observes cancellation during reporting before starting work and restores', async () => {
  const f = fixture(),
    controller = new AbortController();
  let entered = false;
  const ctx = {
    ...context(f),
    signal: controller.signal,
    reportHead: () => {
      controller.abort();
      return Promise.resolve();
    },
    work: () => {
      entered = true;
      return Promise.resolve(0);
    },
  };
  const outcome = await completed(f, request(f, 'keep'), ctx);
  expect(entered).toBe(false);
  expect(outcome.status).toBe(130);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
});
it('refuses a missing full requested commit64 before changing the tree', async () => {
  const f = fixture();
  expect((await completed(f, { ...request(f), commit: '0'.repeat(40) })).status).toBe(64);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
});
it('verifies restored HEAD independently of a successful restoration command', async () => {
  const f = fixture(),
    ctx = {
      ...context(f),
      gitExecutable: wrapper(
        f,
        'if(argv.includes("checkout")&&argv.at(-1)===' +
          JSON.stringify(f.original) +
          ')process.exit(0);',
      ),
    };
  expect((await completed(f, request(f), ctx)).status).toBe(74);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.candidate);
});
it('verifies the original symbolic reference after restoration', async () => {
  const f = fixture(),
    ctx = {
      ...context(f),
      gitExecutable: wrapper(
        f,
        'if(argv.includes("symbolic-ref")&&argv.at(-1)==="refs/heads/original")process.exit(0);',
      ),
    };
  expect((await completed(f, request(f), ctx)).status).toBe(74);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
});
it('closes the child capability before releasing checkout ownership', async () => {
  const f = fixture(),
    state: { scope?: Scope } = {};
  expect(
    (
      await completed(
        f,
        request(f),
        context(f, (scope) => {
          state.scope = scope;
          return Promise.resolve(0);
        }),
      )
    ).status,
  ).toBe(0);
  const scope = state.scope;
  if (scope === undefined) throw Error('fixture child scope missing');
  let isRefused = false,
    pending: Promise<number> | undefined;
  try {
    pending = scope.runChild([
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      '--eval',
      'process.exitCode=0;',
    ]);
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    isRefused = true;
  }
  if (pending !== undefined) await pending;
  expect(isRefused).toBe(true);
});
it('creates readable candidate paths under022 and restores the caller umask', async () => {
  const f = fixture();
  git(f.tree, 'checkout', '-q', f.candidate);
  mkdirSync(join(f.tree, 'created'));
  writeFileSync(join(f.tree, 'created', 'tracked'), 'new');
  git(f.tree, 'add', '.');
  git(f.tree, 'commit', '-qm', 'new paths');
  const commit = git(f.tree, 'rev-parse', 'HEAD');
  git(f.tree, 'checkout', '-q', f.original);
  const previous = process.umask(0o077);
  try {
    const outcome = await completed(f, { ...request(f, 'keep'), commit });
    expect(outcome.status).toBe(0);
    expect(process.umask(0o077)).toBe(0o077);
    expect(lstatSync(join(f.tree, 'created')).mode & 0o005).toBe(0o005);
    expect(lstatSync(join(f.tree, 'created', 'tracked')).mode & 0o004).toBe(0o004);
  } finally {
    process.umask(previous);
  }
});
it('verifies detached original checkout shape independently of restored HEAD', async () => {
  const f = fixture();
  git(f.tree, 'checkout', '--detach', '-q', f.original);
  const ctx = {
    ...context(f),
    gitExecutable: wrapper(
      f,
      'if(argv.includes("checkout")&&argv.at(-1)===' +
        JSON.stringify(f.original) +
        '){const child=Bun.spawnSync(["/usr/bin/git","-C",' +
        JSON.stringify(f.tree) +
        ',"checkout","--quiet","original"],{env:process.env,stdout:"inherit",stderr:"inherit"});process.exit(child.exitCode);}',
    ),
  };
  expect((await completed(f, request(f), ctx)).status).toBe(74);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
});
it('gives every Git child explicit cwd and excludes ambient caller configuration', async () => {
  const f = fixture(),
    record = join(f.root, 'git-call.json'),
    previous = process.env['PUNI_GATE_AMBIENT'];
  process.env['PUNI_GATE_AMBIENT'] = 'controlled';
  try {
    const ctx = {
      ...context(f),
      gitExecutable: wrapper(
        f,
        'await Bun.write(' +
          JSON.stringify(record) +
          ',JSON.stringify({ambient:Object.hasOwn(process.env,"PUNI_GATE_AMBIENT"),cwd:process.cwd()}));',
      ),
    };
    expect((await completed(f, request(f), ctx)).status).toBe(0);
    expect(JSON.parse(readFileSync(record, 'utf8'))).toEqual({ ambient: false, cwd: f.tree });
  } finally {
    if (previous === undefined) delete process.env['PUNI_GATE_AMBIENT'];
    else process.env['PUNI_GATE_AMBIENT'] = previous;
  }
});
it('binds mode repair to the originally inspected physical file before chmod', () => {
  const f = fixture(),
    foreign = join(f.root, 'foreign');
  git(f.tree, 'checkout', '--detach', '-q', f.candidate);
  chmodSync(join(f.tree, 'nested', 'tracked'), 0o600);
  writeFileSync(foreign, 'foreign', { mode: 0o600 });
  const path = join(f.tree, 'nested', 'tracked');
  const program = [
    'import{mock}from"bun:test";const fs=await import("node:fs"),open=fs.openSync;',
    'mock.module("node:fs",()=>({...fs,openSync(path,flags,...rest){return open(path===' +
      JSON.stringify(path) +
      '?' +
      JSON.stringify(foreign) +
      ':path,flags,...rest);}}));',
    'const{runCheckout}=await import(' +
      JSON.stringify(new URL('./gate-checkout.ts', import.meta.url).href) +
      ');const outcome=await runCheckout(' +
      JSON.stringify({ ...request(f), repairModes: true }) +
      ',{path:' +
      JSON.stringify(f.path) +
      ',label:"physical repair",waitSeconds:0,pollSeconds:1,gitExecutable:' +
      JSON.stringify(gitExecutable) +
      ',lookupPath:"/usr/bin:/bin",signal:new AbortController().signal,reportAdmission:()=>Promise.resolve(),reportHead:()=>Promise.resolve(),reportFailure:()=>Promise.resolve(),reportUnconfirmed:()=>Promise.resolve(),work:()=>Promise.resolve(0)});process.stdout.write(JSON.stringify(outcome));',
  ].join('\n');
  const capture = process.env['PUNI_GATE_R5_CAPTURE'];
  if (capture !== undefined) {
    const name = randomUUID();
    cpSync(f.root, join(capture, name), { recursive: true, verbatimSymlinks: true });
    writeFileSync(
      join(capture, name + '.json'),
      JSON.stringify({
        program,
        path,
        foreign,
        inspected: lstatSync(path),
        other: lstatSync(foreign),
      }),
    );
  }
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(lstatSync(foreign).mode & 0o777).toBe(0o600);
  expect(JSON.parse(child.stdout.toString())).toMatchObject({ value: { status: 70 } });
});
it('refuses tracked pathname traversal before repairing outside the tree', async () => {
  const f = fixture(),
    foreign = join(f.root, 'foreign');
  writeFileSync(foreign, 'private', { mode: 0o600 });
  const frame =
    '100644 blob ' + git(f.tree, 'rev-parse', f.candidate + ':nested/tracked') + '\t../foreign\0';
  const ctx = {
    ...context(f),
    gitExecutable: wrapper(
      f,
      'if(argv.includes("ls-tree")){process.stdout.write(' +
        JSON.stringify(frame) +
        ');process.exit(0);}',
    ),
  };
  const outcome = await completed(f, { ...request(f), repairModes: true }, ctx);
  expect(lstatSync(foreign).mode & 0o777).toBe(0o600);
  expect(outcome.status).toBe(70);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
});
it('recovers saved detached commit when original branch moves during attachment', async () => {
  const f = fixture(),
    ctx = {
      ...context(f),
      work: (scope: Scope) =>
        scope.runChild([
          process.execPath,
          '--no-env-file',
          '--config=/dev/null',
          '--eval',
          'process.exitCode=37;',
        ]),
      gitExecutable: wrapper(
        f,
        'if(argv.includes("symbolic-ref")&&argv.at(-1)==="refs/heads/original"){const child=Bun.spawnSync(["/usr/bin/git","-C",' +
          JSON.stringify(f.tree) +
          ',"update-ref","refs/heads/original",' +
          JSON.stringify(f.candidate) +
          '],{env:process.env,stdout:"inherit",stderr:"inherit"});if(child.exitCode!==0)process.exit(child.exitCode);}',
      ),
    };
  const outcome = await completed(f, request(f), ctx);
  expect(outcome.status).toBe(74);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
  expect(git(f.tree, 'rev-parse', 'refs/heads/original')).toBe(f.candidate);
});
it('preserves repair observation and actual descriptor-close causes independently', () => {
  const f = fixture();
  git(f.tree, 'checkout', '--detach', '-q', f.candidate);
  chmodSync(join(f.tree, 'nested', 'tracked'), 0o600);
  const path = join(f.tree, 'nested', 'tracked');
  const program = [
    'import{mock}from"bun:test";const fs=await import("node:fs"),open=fs.openSync,chmod=fs.fchmodSync,close=fs.closeSync;let selected;',
    'mock.module("node:fs",()=>({...fs,openSync(path,...rest){const descriptor=open(path,...rest);if(path===' +
      JSON.stringify(path) +
      ')selected=descriptor;return descriptor;},fchmodSync(descriptor,mode){chmod(descriptor,mode);if(descriptor===selected)throw Error("controlled chmod observation failure");},closeSync(descriptor){close(descriptor);if(descriptor===selected)throw Error("controlled close observation failure");}}));',
    'const{runCheckout}=await import(' +
      JSON.stringify(new URL('./gate-checkout.ts', import.meta.url).href) +
      ');const outcome=await runCheckout(' +
      JSON.stringify({ ...request(f), repairModes: true }) +
      ',{path:' +
      JSON.stringify(f.path) +
      ',label:"repair causes",waitSeconds:0,pollSeconds:1,gitExecutable:' +
      JSON.stringify(gitExecutable) +
      ',lookupPath:"/usr/bin:/bin",signal:new AbortController().signal,reportAdmission:()=>Promise.resolve(),reportHead:()=>Promise.resolve(),reportFailure:()=>Promise.resolve(),reportUnconfirmed:()=>Promise.resolve(),work:()=>Promise.resolve(0)});let descriptor;try{fs.fstatSync(selected);descriptor="open";}catch(cause){if(cause.code!=="EBADF")throw cause;descriptor="closed";}const cause=outcome.value.failures.at(0)?.cause;process.stdout.write(JSON.stringify({status:outcome.value.status,descriptor,causes:cause instanceof AggregateError?cause.errors.map(failure=>failure.message):[cause?.message]}));',
  ].join('\n');
  const capture = process.env['PUNI_GATE_R5_CAPTURE'];
  if (capture !== undefined) {
    const name = randomUUID();
    cpSync(f.root, join(capture, name), { recursive: true, verbatimSymlinks: true });
    writeFileSync(
      join(capture, name + '.json'),
      JSON.stringify({ program, path, inspected: lstatSync(path) }),
    );
  }
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(JSON.parse(child.stdout.toString())).toEqual({
    status: 70,
    descriptor: 'closed',
    causes: ['controlled chmod observation failure', 'controlled close observation failure'],
  });
});
for (const phase of ['work', 'restore', 'work74'] as const)
  it(
    'preserves ' + phase + ' primary and reporting causes across actual admission close failure',
    () => {
      const f = fixture();
      const program = [
        'import{mock}from"bun:test";const fs=await import("node:fs"),open=fs.openSync,close=fs.closeSync;let selected;',
        'mock.module("node:fs",()=>({...fs,openSync(path,...rest){const descriptor=open(path,...rest);if(path===' +
          JSON.stringify(f.path) +
          ')selected=descriptor;return descriptor;},closeSync(descriptor){close(descriptor);if(descriptor===selected)throw Error("controlled admission close failure");}}));',
        'const{runCheckout}=await import(' +
          JSON.stringify(new URL('./gate-checkout.ts', import.meta.url).href) +
          ');let receipt;try{const outcome=await runCheckout(' +
          JSON.stringify(request(f)) +
          ',{path:' +
          JSON.stringify(f.path) +
          ',label:"admission cleanup",waitSeconds:0,pollSeconds:1,gitExecutable:' +
          JSON.stringify(gitExecutable) +
          ',lookupPath:"/usr/bin:/bin",signal:new AbortController().signal,reportAdmission:()=>Promise.resolve(),reportHead:()=>Promise.resolve(),reportFailure:()=>' +
          (phase === 'work74'
            ? 'Promise.resolve()'
            : 'Promise.reject(Error("controlled report failure"))') +
          ' ,reportUnconfirmed:()=>Promise.resolve(),work:async(scope)=>{' +
          (phase === 'restore'
            ? 'const moved=Bun.spawnSync(["/usr/bin/git","-C",' +
              JSON.stringify(f.tree) +
              ',"update-ref","refs/heads/original",' +
              JSON.stringify(f.candidate) +
              '],{stdout:"pipe",stderr:"pipe"});if(moved.exitCode!==0)throw Error("fixture branch movement failed");'
            : '') +
          'return await scope.runChild([process.execPath,"--no-env-file","--config=/dev/null","--eval","process.exitCode=' +
          String(phase === 'work74' ? 74 : 37) +
          ';"]);}});receipt={kind:"outcome",status:outcome.value.status,phases:outcome.value.failures.map(failure=>failure.phase),messages:outcome.value.failures.map(failure=>failure.cause.message)};}catch(cause){receipt={kind:"threw",message:cause.message};}process.stdout.write(JSON.stringify(receipt));',
      ].join('\n');
      const capture = process.env['PUNI_GATE_R5_CAPTURE'];
      if (capture !== undefined) {
        const name = randomUUID();
        cpSync(f.root, join(capture, name), { recursive: true, verbatimSymlinks: true });
        writeFileSync(
          join(capture, name + '.json'),
          JSON.stringify({ program, path: f.path, phase }),
        );
      }
      const child = Bun.spawnSync(
        [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
        { stdout: 'pipe', stderr: 'pipe' },
      );
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      const receipt: unknown = JSON.parse(child.stdout.toString());
      expect(receipt).toMatchObject({
        kind: 'outcome',
        status: phase === 'restore' ? 74 : 70,
        phases:
          phase === 'work74'
            ? ['work', 'work', 'cleanup']
            : phase === 'restore'
              ? ['work', 'work', 'restore', 'report', 'report', 'report', 'cleanup', 'report']
              : ['work', 'work', 'report', 'report', 'cleanup', 'report'],
        messages: expect.arrayContaining([
          'gate work exited ' + String(phase === 'work74' ? 74 : 37),
          'controlled admission close failure',
        ]) as unknown,
      });
    },
  );
for (const redirect of ['subdirectory', 'core.worktree'] as const)
  it('binds the explicit tree before Git operations for ' + redirect, async () => {
    const f = fixture(),
      outside = join(f.root, 'redirected'),
      marker = join(f.root, 'unsafe-operation');
    mkdirSync(outside);
    mkdirSync(join(outside, 'nested'));
    writeFileSync(join(outside, 'nested', 'tracked'), 'original');
    const selected = redirect === 'subdirectory' ? join(f.tree, 'nested') : f.tree;
    if (redirect === 'core.worktree') git(f.tree, 'config', 'core.worktree', outside);
    const ctx = {
      ...context(f),
      gitExecutable: wrapper(
        f,
        'if(argv.includes("checkout")||argv.includes("status"))await Bun.write(' +
          JSON.stringify(marker) +
          ',"entered");',
      ),
    };
    const outcome = await completed(f, { ...request(f, 'keep'), tree: selected }, ctx);
    expect(existsSync(marker)).toBe(false);
    expect(outcome.status).toBe(70);
    expect(readFileSync(join(f.tree, 'nested', 'tracked'), 'utf8')).toBe('original');
    expect(readFileSync(join(outside, 'nested', 'tracked'), 'utf8')).toBe('original');
  });
it('preserves exact spaced and newline-bearing canonical tree identity', async () => {
  const f = fixture(),
    selected = join(f.root, ' space root \n');
  const fs = await import('node:fs');
  fs.renameSync(f.tree, selected);
  f.tree = selected;
  expect((await completed(f)).status).toBe(0);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
});
it('supports a linked worktree whose effective canonical root matches', async () => {
  const f = fixture(),
    linked = join(f.root, 'linked tree');
  git(f.tree, 'worktree', 'add', '--quiet', '--detach', linked, f.original);
  expect((await completed(f, { ...request(f), tree: linked })).status).toBe(0);
  expect(git(linked, 'rev-parse', 'HEAD')).toBe(f.original);
  expect(
    Bun.spawnSync([gitExecutable, '-C', linked, 'symbolic-ref', '--quiet', 'HEAD']).exitCode,
  ).toBe(1);
});
for (const rootResponse of ['query failure', 'malformed response'] as const)
  it('rejects working-tree ' + rootResponse + ' without fallback', async () => {
    const f = fixture(),
      marker = join(f.root, 'unsafe-operation');
    const ctx = {
      ...context(f),
      gitExecutable: wrapper(
        f,
        'if(argv.includes("checkout")||argv.includes("status"))await Bun.write(' +
          JSON.stringify(marker) +
          ',"entered");if(argv.includes("--show-toplevel")){' +
          (rootResponse === 'query failure'
            ? 'process.exit(43);'
            : 'process.stdout.write(' + JSON.stringify(f.tree) + ');process.exit(0);') +
          '}',
      ),
    };
    const outcome = await completed(f, request(f), ctx);
    expect(existsSync(marker)).toBe(false);
    expect(outcome.status).toBe(70);
    expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
  });
for (const late of ['close failure', 'native signal'] as const)
  it('retains successful keep tree on late ' + late + ' without post-release Git mutation', () => {
    const f = fixture(),
      closed = join(f.root, 'closed'),
      trace = join(f.root, 'git-trace');
    const selectedGit = wrapper(
      f,
      'const fs=await import("node:fs");fs.appendFileSync(' +
        JSON.stringify(trace) +
        ',JSON.stringify({argv,afterRelease:fs.existsSync(' +
        JSON.stringify(closed) +
        ')})+"\\n");',
    );
    const program = [
      'import{mock}from"bun:test";const fs=await import("node:fs"),open=fs.openSync,close=fs.closeSync;let selected;',
      'mock.module("node:fs",()=>({...fs,openSync(path,...rest){const descriptor=open(path,...rest);if(path===' +
        JSON.stringify(f.path) +
        ')selected=descriptor;return descriptor;},closeSync(descriptor){close(descriptor);if(descriptor===selected){fs.writeFileSync(' +
        JSON.stringify(closed) +
        ',"released");' +
        (late === 'close failure'
          ? 'throw Error("controlled admission close failure");'
          : 'process.kill(process.pid,"SIGINT");') +
        '}}}));',
      'const{runCheckout}=await import(' +
        JSON.stringify(new URL('./gate-checkout.ts', import.meta.url).href) +
        ');const outcome=await runCheckout(' +
        JSON.stringify(request(f, 'keep')) +
        ',{path:' +
        JSON.stringify(f.path) +
        ',label:"late keep",waitSeconds:0,pollSeconds:1,gitExecutable:' +
        JSON.stringify(selectedGit) +
        ',lookupPath:"/usr/bin:/bin",signal:new AbortController().signal,reportAdmission:()=>Promise.resolve(),reportHead:()=>Promise.resolve(),reportFailure:()=>Promise.resolve(),reportUnconfirmed:()=>Promise.resolve(),work:scope=>scope.runChild([process.execPath,"--no-env-file","--config=/dev/null","--eval","process.exitCode=0;"])});const calls=fs.readFileSync(' +
        JSON.stringify(trace) +
        ',"utf8").trimEnd().split("\\n").map(line=>JSON.parse(line));process.stdout.write(JSON.stringify({outcome,afterRelease:calls.filter(call=>call.afterRelease),checkouts:calls.filter(call=>call.argv.includes("checkout")).length}));',
    ].join('\n');
    const capture = process.env['PUNI_GATE_R5_CAPTURE'];
    if (capture !== undefined) {
      const name = randomUUID();
      cpSync(f.root, join(capture, name), { recursive: true, verbatimSymlinks: true });
      writeFileSync(join(capture, name + '.json'), JSON.stringify({ program, closed, trace }));
    }
    const child = Bun.spawnSync(
      [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    const receipt: unknown = JSON.parse(child.stdout.toString());
    expect(receipt).toMatchObject({
      outcome:
        late === 'close failure'
          ? { value: { status: 70, failures: [{ phase: 'cleanup' }] } }
          : {
              value: { status: 130, failures: [] },
              interruption: { kind: 'native', signal: 'SIGINT' },
            },
      afterRelease: [],
      checkouts: 1,
    });
    expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.candidate);
  });
it('retains independent external cancellation reason in every returned outcome', async () => {
  const f = fixture(),
    controller = new AbortController();
  controller.abort('explicit external reason');
  const outcome = await runCheckout(request(f), { ...context(f), signal: controller.signal });
  expect(outcome).toMatchObject({
    kind: 'cancelled',
    interruption: { kind: 'external', reason: 'explicit external reason' },
  });
  expect(existsSync(f.path)).toBe(false);
});
it('distinguishes work exit74 from restoration74 when required reporting fails', async () => {
  const f = fixture();
  const ctx = {
    ...context(f),
    work: (scope: Scope) =>
      scope.runChild([
        process.execPath,
        '--no-env-file',
        '--config=/dev/null',
        '--eval',
        'process.exitCode=74;',
      ]),
    reportFailure: () => Promise.reject(Error('controlled report failure')),
  };
  const outcome = await completed(f, request(f), ctx);
  expect(outcome.status).toBe(70);
  expect(outcome.failures.map((failure) => failure.phase)).toEqual([
    'work',
    'work',
    'report',
    'report',
  ]);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
});
it('refuses an unsupported reported Git version before checkout or work', async () => {
  const f = fixture(),
    ctx = {
      ...context(f),
      gitExecutable: wrapper(
        f,
        'if(argv.includes("--version")){process.stdout.write("git version 2.35.0\\n");process.exit(0);}',
      ),
    };
  expect((await completed(f, request(f), ctx)).status).toBe(70);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
});

for (const workStatus of [0, 37] as const)
  it('retains every independent child failure beside work' + String(workStatus), async () => {
    const f = fixture();
    const outcome = await completed(
      f,
      request(f),
      context(f, (scope) => {
        void scope.runChild([
          process.execPath,
          '--no-env-file',
          '--config=/dev/null',
          '--eval',
          'process.exitCode=42;',
        ]);
        if (workStatus === 0)
          void scope.runChild([
            process.execPath,
            '--no-env-file',
            '--config=/dev/null',
            '--eval',
            'process.exitCode=43;',
          ]);
        return Promise.resolve(workStatus);
      }),
    );
    expect(outcome.status).toBe(workStatus === 0 ? 42 : 37);
    expect(
      outcome.failures.map((failure) =>
        failure.cause instanceof Error ? failure.cause.message : failure.cause,
      ),
    ).toEqual(
      workStatus === 0
        ? ['gate child exited 42', 'gate child exited 43']
        : ['gate work exited 37', 'gate child exited 42'],
    );
    expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
  });

it('refuses a gitlink only in the saved original before candidate checkout', async () => {
  const f = fixture();
  git(f.tree, 'update-index', '--add', '--cacheinfo', '160000,' + f.original + ',submodule');
  git(f.tree, 'commit', '-qm', 'original gitlink');
  const original = git(f.tree, 'rev-parse', 'HEAD'),
    marker = join(f.root, 'original-gitlink-checkout');
  const ctx = {
    ...context(f),
    gitExecutable: wrapper(
      f,
      'if(argv.includes("checkout")&&argv.at(-1)===' +
        JSON.stringify(f.candidate) +
        ')await Bun.write(' +
        JSON.stringify(marker) +
        ',"entered");',
    ),
  };
  const outcome = await completed({ ...f, original }, request(f), ctx);
  expect(existsSync(marker)).toBe(false);
  expect(outcome.status).toBe(70);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(original);
});
it('disables real replacement objects while verifying the same requested commit identity', async () => {
  const f = fixture();
  git(f.tree, 'checkout', '--detach', '-q', f.candidate);
  writeFileSync(join(f.tree, 'nested', 'tracked'), 'replacement poison');
  git(f.tree, 'commit', '-qam', 'replacement');
  const replacement = git(f.tree, 'rev-parse', 'HEAD');
  git(f.tree, 'checkout', '-q', 'original');
  git(f.tree, 'replace', f.candidate, replacement);
  expect(git(f.tree, 'rev-parse', f.candidate + '^{commit}')).toBe(f.candidate);
  expect(git(f.tree, 'show', f.candidate + ':nested/tracked')).toBe('replacement poison');
  let bytes: string | undefined;
  const outcome = await completed(
    f,
    request(f),
    context(f, () => {
      bytes = readFileSync(join(f.tree, 'nested', 'tracked'), 'utf8');
      return Promise.resolve(0);
    }),
  );
  expect(bytes).toBe('candidate');
  expect(outcome.status).toBe(0);
  expect(git(f.tree, 'rev-parse', 'HEAD')).toBe(f.original);
});
