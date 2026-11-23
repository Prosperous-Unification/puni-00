import * as filesystem from 'node:fs';
import {
  appendFileSync,
  chmodSync,
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
import { join } from 'node:path';

import { afterAll, expect, it, spyOn } from 'bun:test';

import { readWorkspace } from './workspace';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function git(root: string, args: string[], input?: string) {
  const child = Bun.spawnSync(
    ['/usr/bin/git', '-c', 'core.hooksPath=/dev/null', '-C', root, ...args],
    {
      env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
      stdin: input === undefined ? 'ignore' : Buffer.from(input),
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 5000,
    },
  );
  if (child.exitCode !== 0) throw new Error('fixture git failed: ' + child.stderr.toString());
  return child.stdout.toString();
}
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni script universe '));
  roots.push(root);
  git(root, ['init', '--quiet']);
  return {
    root,
    write: (path: string, contents: string | Uint8Array) => {
      mkdirSync(join(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), contents);
    },
    add: (...paths: string[]) => {
      git(root, ['add', '--', ...paths]);
    },
  };
}

it('captures tracked current bytes and nested new unknown extensions without consulting declarations', () => {
  const f = createFixture();
  f.write('tracked.ts', 'old');
  f.add('tracked.ts');
  f.write('tracked.ts', 'current');
  f.write('new/deep/program.unknown', '#!/usr/bin/env bun\n');
  chmodSync(join(f.root, 'new/deep/program.unknown'), 0o755);
  const workspace = readWorkspace(f.root);
  expect(workspace.root).toBe(f.root);
  const tracked = workspace.entries.find((entry) => entry.path === 'tracked.ts'),
    added = workspace.entries.find((entry) => entry.path === 'new/deep/program.unknown');
  expect(tracked).toMatchObject({ kind: 'file', provenance: { kind: 'tracked', mode: '100644' } });
  if (tracked?.kind !== 'file') throw new Error('tracked file absent');
  expect(new TextDecoder().decode(tracked.bytes)).toBe('current');
  expect(tracked.sha256).toBe(new Bun.CryptoHasher('sha256').update('current').digest('hex'));
  expect(added).toMatchObject({
    kind: 'file',
    provenance: { kind: 'untracked' },
    executable: true,
  });
});
it('includes dot directories and preserves spaces tabs and newlines through the Git record protocol', () => {
  const f = createFixture(),
    path = '.github/workflows/a space\tline\nprogram.yml';
  f.write(path, 'jobs: {}\n');
  const workspace = readWorkspace(f.root);
  expect(workspace.entries.map((entry) => entry.path)).toEqual([path]);
});
it('uses repository ignore files without dropping already tracked ignored files', () => {
  const f = createFixture();
  f.write('kept.sh', 'old');
  f.add('kept.sh');
  f.write('.gitignore', 'ignored/\nkept.sh\n');
  f.write('ignored/new.sh', 'ignored');
  f.write('active/new.sh', 'new');
  expect(readWorkspace(f.root).entries.map((entry) => entry.path)).toEqual([
    '.gitignore',
    'active/new.sh',
    'kept.sh',
  ]);
});
it('does not trust global excludes or git info excludes to hide new programs', () => {
  const f = createFixture();
  f.write('global-hidden/script.xyz', 'first');
  f.write('info-hidden/script.xyz', 'second');
  const excludes = join(f.root, '.git', 'ambient-excludes');
  writeFileSync(excludes, 'global-hidden/\n');
  git(f.root, ['config', 'core.excludesFile', excludes]);
  writeFileSync(join(f.root, '.git/info/exclude'), 'info-hidden/\n');
  expect(readWorkspace(f.root).entries.map((entry) => entry.path)).toEqual([
    'global-hidden/script.xyz',
    'info-hidden/script.xyz',
  ]);
});
it('captures current executable mode independently of the older tracked index mode', () => {
  const f = createFixture();
  f.write('script.xyz', 'program');
  f.add('script.xyz');
  chmodSync(join(f.root, 'script.xyz'), 0o755);
  expect(readWorkspace(f.root).entries[0]).toMatchObject({
    kind: 'file',
    executable: true,
    provenance: { kind: 'tracked', mode: '100644' },
  });
});
it('records symlinks without reading or traversing their destinations', () => {
  const f = createFixture(),
    other = createFixture();
  other.write('private/secret.ts', 'must not capture');
  symlinkSync(join(other.root, 'private'), join(f.root, 'outside'));
  symlinkSync('missing-destination', join(f.root, 'broken'));
  const workspace = readWorkspace(f.root);
  expect(workspace.entries).toMatchObject([
    {
      kind: 'symlink',
      path: 'broken',
      target: 'missing-destination',
      provenance: { kind: 'untracked' },
    },
    { kind: 'symlink', path: 'outside', target: join(other.root, 'private') },
  ]);
  expect(workspace.entries).toHaveLength(2);
});
it('captures a tracked symlink as an explicit boundary', () => {
  const f = createFixture();
  symlinkSync('missing', join(f.root, 'link'));
  f.add('link');
  expect(readWorkspace(f.root).entries[0]).toMatchObject({
    kind: 'symlink',
    target: 'missing',
    provenance: { kind: 'tracked', mode: '120000' },
  });
});
it('captures a gitlink as an explicit pinned boundary without discovering its nested program', () => {
  const f = createFixture(),
    child = join(f.root, 'nested');
  mkdirSync(child);
  git(child, ['init', '--quiet']);
  git(child, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '--allow-empty',
    '-m',
    'fixture',
  ]);
  const commit = git(child, ['rev-parse', 'HEAD']).trim();
  writeFileSync(join(child, 'untracked-script.sh'), 'nested body');
  git(f.root, ['update-index', '--add', '--cacheinfo', '160000,' + commit + ',nested']);
  expect(readWorkspace(f.root).entries).toMatchObject([
    {
      kind: 'gitlink',
      path: 'nested',
      provenance: { kind: 'tracked', mode: '160000', objectId: commit },
    },
  ]);
  expect(readWorkspace(f.root).entries).toHaveLength(1);
});
it('refuses unmerged index stages before returning a partial workspace', () => {
  const f = createFixture();
  f.write('conflict.ts', 'content');
  const objectId = git(f.root, ['hash-object', '-w', 'conflict.ts']).trim();
  git(
    f.root,
    ['update-index', '--index-info'],
    '100644 ' +
      objectId +
      ' 1\tconflict.ts\n100644 ' +
      objectId +
      ' 2\tconflict.ts\n100644 ' +
      objectId +
      ' 3\tconflict.ts\n',
  );
  expect(() => readWorkspace(f.root)).toThrow('unmerged');
});
it('refuses missing tracked state rather than treating an unstaged deletion as an absent script', () => {
  const f = createFixture();
  f.write('required.ts', 'content');
  f.add('required.ts');
  rmSync(join(f.root, 'required.ts'));
  expect(() => readWorkspace(f.root)).toThrow();
});
it('refuses unreadable tracked bytes rather than returning a partial snapshot', () => {
  const f = createFixture();
  f.write('required.ts', 'content');
  f.add('required.ts');
  chmodSync(join(f.root, 'required.ts'), 0o000);
  try {
    expect(() => readWorkspace(f.root)).toThrow('unreadable');
  } finally {
    chmodSync(join(f.root, 'required.ts'), 0o600);
  }
});
it('refuses a tracked regular path replaced by a directory', () => {
  const f = createFixture();
  f.write('required.ts', 'content');
  f.add('required.ts');
  rmSync(join(f.root, 'required.ts'));
  mkdirSync(join(f.root, 'required.ts'));
  expect(() => readWorkspace(f.root)).toThrow('regular');
});
it('refuses a requested child directory instead of silently widening the selected root', () => {
  const f = createFixture();
  mkdirSync(join(f.root, 'child'));
  expect(() => readWorkspace(join(f.root, 'child'))).toThrow('root');
});
it('ignores inherited Git redirection and reads the explicitly selected worktree', () => {
  const f = createFixture(),
    other = createFixture();
  f.write('selected.ts', 'selected');
  other.write('wrong.ts', 'wrong');
  other.add('wrong.ts');
  const keys = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'] as const,
    prior = keys.map((key) => process.env[key]);
  process.env['GIT_DIR'] = join(other.root, '.git');
  process.env['GIT_WORK_TREE'] = other.root;
  process.env['GIT_INDEX_FILE'] = join(other.root, '.git/index');
  try {
    expect(readWorkspace(f.root).entries.map((entry) => entry.path)).toEqual(['selected.ts']);
  } finally {
    for (const [index, key] of keys.entries()) {
      const value = prior[index];
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
  }
});
it('requires an actual Git repository and never initializes one as a fallback', () => {
  const root = mkdtempSync(join(tmpdir(), 'puni absent script repo '));
  roots.push(root);
  expect(() => readWorkspace(root)).toThrow();
  expect(existsSync(join(root, '.git'))).toBe(false);
});

it('refuses an unexpected untracked nested repository instead of treating it as covered', () => {
  const f = createFixture(),
    nested = join(f.root, 'unexpected');
  mkdirSync(nested);
  git(nested, ['init', '--quiet']);
  writeFileSync(join(nested, 'hidden-program.xyz'), 'program');
  expect(() => readWorkspace(f.root)).toThrow('unexpanded directory');
});
it('refuses an invalid UTF8 filename rather than capturing a replacement-character path', () => {
  const f = createFixture(),
    path = Buffer.concat([Buffer.from(f.root + '/invalid-'), Buffer.from([0xff])]);
  f.write('.gitignore', 'invalid-\uFFFD\n');
  f.write('invalid-\uFFFD', 'valid replacement-character shadow');
  writeFileSync(path, 'program');
  expect(() => readWorkspace(f.root)).toThrow('UTF8');
});
it('refuses an actual file change during its owned descriptor capture', () => {
  const f = createFixture();
  f.write('changed.ts', 'before');
  f.add('changed.ts');
  const nativeRead = filesystem.readFileSync;
  let injected = false;
  // This production path reads descriptors without options; other readFileSync overloads are not exercised.
  const reading = spyOn(filesystem, 'readFileSync').mockImplementation(((
    path: filesystem.PathOrFileDescriptor,
  ) => {
    const bytes = nativeRead(path);
    if (typeof path === 'number' && !injected) {
      injected = true;
      appendFileSync(join(f.root, 'changed.ts'), 'after');
    }
    return bytes;
  }) as typeof filesystem.readFileSync);
  try {
    expect(() => readWorkspace(f.root)).toThrow('changed during capture');
    expect(injected).toBe(true);
  } finally {
    reading.mockRestore();
  }
});
it('requires the Git executable before attempting to observe a repository', () => {
  const f = createFixture(),
    locating = spyOn(Bun, 'which').mockReturnValue(null);
  try {
    expect(() => readWorkspace(f.root)).toThrow('requires Git');
  } finally {
    locating.mockRestore();
  }
});

it('refuses a tracked descendant whose parent was replaced by an external symlink', () => {
  const f = createFixture(),
    other = createFixture();
  f.write('tracked/program.xyz', 'original');
  f.add('tracked/program.xyz');
  other.write('outside/program.xyz', 'EXTERNAL SENTINEL');
  rmSync(join(f.root, 'tracked'), { recursive: true });
  symlinkSync(join(other.root, 'outside'), join(f.root, 'tracked'));
  expect(() => readWorkspace(f.root)).toThrow('ancestor');
});
it('selects the native alias-parent repository when both native and lexical roots are valid', () => {
  const parent = mkdtempSync(join(tmpdir(), 'puni alias parent authority '));
  roots.push(parent);
  const native = join(parent, 'physical', 'chosen'),
    lexical = join(parent, 'chosen');
  mkdirSync(native, { recursive: true });
  mkdirSync(lexical);
  git(native, ['init', '--quiet']);
  git(lexical, ['init', '--quiet']);
  writeFileSync(join(native, 'native.xyz'), 'native');
  writeFileSync(join(lexical, 'lexical.xyz'), 'lexical');
  mkdirSync(join(parent, 'physical', 'target'));
  symlinkSync(join(parent, 'physical', 'target'), join(parent, 'alias'));
  const requested = parent + '/alias/../chosen',
    workspace = readWorkspace(requested);
  expect(workspace.root).toBe(native);
  expect(workspace.entries.map((entry) => entry.path)).toEqual(['native.xyz']);
});

it('preserves capture and real-close-then-throw failures without returning a partial workspace', () => {
  const f = createFixture();
  f.write('required.ts', 'content');
  f.add('required.ts');
  const nativeOpen = filesystem.openSync,
    nativeClose = filesystem.closeSync,
    readFault = new Error('capture read fault'),
    closeFault = new Error('capture close fault');
  let descriptor: number | undefined;
  const opening = spyOn(filesystem, 'openSync').mockImplementation((path, flags, mode) => {
    const fd = nativeOpen(path, flags, mode);
    if (path === join(f.root, 'required.ts')) descriptor = fd;
    return fd;
  });
  const reading = spyOn(filesystem, 'readFileSync').mockImplementation(() => {
    throw readFault;
  });
  const closing = spyOn(filesystem, 'closeSync').mockImplementation((fd) => {
    nativeClose(fd);
    if (fd === descriptor) throw closeFault;
  });
  try {
    let failure: unknown;
    try {
      readWorkspace(f.root);
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    const causes: unknown[] = (failure as AggregateError).errors;
    expect((causes[0] as Error).cause).toBe(readFault);
    expect(causes[1]).toBe(closeFault);
    if (descriptor === undefined) throw new Error('descriptor not reached');
    const closedDescriptor = descriptor;
    expect(() => filesystem.fstatSync(closedDescriptor)).toThrow();
  } finally {
    opening.mockRestore();
    reading.mockRestore();
    closing.mockRestore();
  }
});
it('propagates a capture close-only failure after closing the real descriptor', () => {
  const f = createFixture();
  f.write('required.ts', 'content');
  f.add('required.ts');
  const nativeClose = filesystem.closeSync,
    fault = new Error('capture close fault');
  const closing = spyOn(filesystem, 'closeSync').mockImplementation((fd) => {
    nativeClose(fd);
    throw fault;
  });
  try {
    expect(() => readWorkspace(f.root)).toThrow(fault);
  } finally {
    closing.mockRestore();
  }
});
it('refuses an observed ancestor rebind after reading instead of returning a stale path association', () => {
  const f = createFixture(),
    outside = createFixture();
  f.write('folder/program.ts', 'original');
  f.add('folder/program.ts');
  outside.write('outside/program.ts', 'outside');
  const nativeRead = filesystem.readFileSync;
  let injected = false;
  // Capture invokes only the descriptor/no-options readFileSync overload.
  const reading = spyOn(filesystem, 'readFileSync').mockImplementation(((
    path: filesystem.PathOrFileDescriptor,
  ) => {
    const bytes = nativeRead(path);
    if (typeof path === 'number' && !injected) {
      injected = true;
      renameSync(join(f.root, 'folder'), join(f.root, 'retained-folder'));
      symlinkSync(join(outside.root, 'outside'), join(f.root, 'folder'));
    }
    return bytes;
  }) as typeof filesystem.readFileSync);
  try {
    expect(() => readWorkspace(f.root)).toThrow('ancestor changed');
    expect(injected).toBe(true);
  } finally {
    reading.mockRestore();
  }
});
it('refuses a readerless FIFO swapped after leaf observation before open can block', async () => {
  const f = createFixture();
  f.write('required.ts', 'content');
  f.add('required.ts');
  const entry = join(f.root, 'fifo-census.ts'),
    target = join(f.root, 'required.ts');
  writeFileSync(
    entry,
    'import * as fs from "node:fs";import{spyOn}from"bun:test";import{readWorkspace}from ' +
      JSON.stringify(join(import.meta.dir, 'workspace.ts')) +
      ';const target=' +
      JSON.stringify(target) +
      ',nativeOpen=fs.openSync;let injected=false;const opening=spyOn(fs,"openSync").mockImplementation((path,flags,mode)=>{if(path===target&&!injected){injected=true;fs.unlinkSync(target);const made=Bun.spawnSync(["/usr/bin/mkfifo",target],{stdout:"pipe",stderr:"pipe"});if(made.exitCode!==0)throw new Error("mkfifo failed");}return nativeOpen(path,flags,mode);});try{readWorkspace(' +
      JSON.stringify(f.root) +
      ');process.exit(2);}catch(cause){if(!(cause instanceof Error)||!cause.message.includes("regular file"))throw cause;process.stdout.write("fifo refused");}finally{opening.mockRestore();}',
  );
  const child = Bun.spawn([process.execPath, '--no-env-file', '--config=/dev/null', entry], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    }),
    timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, 1000);
  try {
    expect(await child.exited).toBe(0);
    expect(await new Response(child.stdout).text()).toBe('fifo refused');
    expect(await new Response(child.stderr).text()).toBe('');
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
  }
});

it.skipIf(process.platform !== 'linux')(
  'captures distinct case-sensitive paths despite repository core.ignoreCase',
  () => {
    const f = createFixture();
    f.write('foo', 'tracked lowercase');
    f.add('foo');
    git(f.root, ['config', 'core.ignoreCase', 'true']);
    f.write('Foo', 'new uppercase');
    chmodSync(join(f.root, 'Foo'), 0o755);
    expect(readFileSync(join(f.root, 'foo'), 'utf8')).toBe('tracked lowercase');
    expect(readWorkspace(f.root).entries.map((entry) => entry.path)).toEqual(['Foo', 'foo']);
  },
);

for (const fault of [
  'status',
  'warning',
  'root-framing',
  'index-mode',
  'duplicate-index',
  'untracked-framing',
  'index-syntax',
  'empty-record',
] as const)
  it(
    'refuses controlled Git boundary ' + fault + ' instead of accepting a partial observation',
    () => {
      const f = createFixture();
      f.write('required.xyz', 'required');
      f.add('required.xyz');
      const control = mkdtempSync(join(tmpdir(), 'puni controlled Git '));
      roots.push(control);
      const objectId = git(f.root, ['rev-parse', ':required.xyz']).trim(),
        regular = '100644 ' + objectId + ' 0\trequired.xyz\0';
      f.write('extra.xyz', 'extra');
      const payload = {
        root: f.root + (fault === 'root-framing' ? '\r' : '\n'),
        index:
          fault === 'index-syntax'
            ? 'malformed index\u0000'
            : fault === 'index-mode'
              ? '100600 ' + objectId + ' 0\trequired.xyz\0'
              : fault === 'duplicate-index'
                ? regular + regular
                : regular,
        others:
          fault === 'empty-record'
            ? '\u0000'
            : fault === 'untracked-framing'
              ? 'extra.xyzX'
              : 'extra.xyz\0',
        fault,
      };
      const executable = join(control, 'git-fixture.ts');
      writeFileSync(
        executable,
        '#!' +
          process.execPath +
          '\nconst payload=' +
          JSON.stringify(payload) +
          ';const args=process.argv.slice(2);if(args.includes("rev-parse")){process.stdout.write(payload.root);}else if(args.includes("--stage")){process.stdout.write(payload.index);if(payload.fault==="warning")process.stderr.write("controlled warning");if(payload.fault==="status")process.exit(7);}else if(args.includes("--others")){process.stdout.write(payload.others);}else throw new Error("unexpected observation");',
      );
      chmodSync(executable, 0o755);
      const locating = spyOn(Bun, 'which').mockReturnValue(executable);
      const diagnostic =
        fault === 'index-syntax'
          ? 'index record is malformed'
          : fault === 'empty-record'
            ? 'empty entry'
            : fault === 'status' || fault === 'warning'
              ? 'Git observation failed'
              : fault === 'root-framing'
                ? 'root'
                : fault === 'index-mode'
                  ? 'index fields'
                  : fault === 'duplicate-index'
                    ? 'duplicated'
                    : 'NUL framing';
      try {
        expect(() => readWorkspace(f.root)).toThrow(diagnostic);
      } finally {
        locating.mockRestore();
      }
    },
  );

it('refuses an actual execute-mode change between lstat and descriptor capture', () => {
  const f = createFixture();
  f.write('required.xyz', 'program');
  f.add('required.xyz');
  const nativeOpen = filesystem.openSync;
  let injected = false;
  const opening = spyOn(filesystem, 'openSync').mockImplementation((path, flags, mode) => {
    if (path === join(f.root, 'required.xyz') && !injected) {
      injected = true;
      chmodSync(path, 0o755);
    }
    return nativeOpen(path, flags, mode);
  });
  try {
    expect(() => readWorkspace(f.root)).toThrow('changed before capture');
    expect(injected).toBe(true);
  } finally {
    opening.mockRestore();
  }
});
it('refuses a short descriptor read even when the native file metadata remains stable', () => {
  const f = createFixture();
  f.write('required.xyz', 'program');
  f.add('required.xyz');
  const nativeRead = filesystem.readFileSync;
  let injected = false;
  // Capture invokes the no-options descriptor overload; return a real read with its final byte missing.
  const reading = spyOn(filesystem, 'readFileSync').mockImplementation(((
    path: filesystem.PathOrFileDescriptor,
  ) => {
    const bytes = nativeRead(path);
    if (typeof path === 'number' && !injected) {
      injected = true;
      return bytes.subarray(0, -1);
    }
    return bytes;
  }) as typeof filesystem.readFileSync);
  try {
    expect(() => readWorkspace(f.root)).toThrow('changed during capture');
    expect(injected).toBe(true);
  } finally {
    reading.mockRestore();
  }
});

it('bounds an actual stalled Git worker before it can return a valid delayed root observation', () => {
  const f = createFixture();
  f.write('required.xyz', 'required');
  f.add('required.xyz');
  const control = mkdtempSync(join(tmpdir(), 'puni stalled Git worker '));
  roots.push(control);
  const objectId = git(f.root, ['rev-parse', ':required.xyz']).trim(),
    payload = { root: f.root + '\n', index: '100644 ' + objectId + ' 0\trequired.xyz\0' },
    executable = join(control, 'stalled-git.ts');
  writeFileSync(
    executable,
    '#!' +
      process.execPath +
      '\nconst payload=' +
      JSON.stringify(payload) +
      ';const args=process.argv.slice(2);if(args.includes("rev-parse")){await Bun.sleep(12000);process.stdout.write(payload.root);}else if(args.includes("--stage")){process.stdout.write(payload.index);}else if(args.includes("--others")){}else throw new Error("unexpected observation");',
  );
  chmodSync(executable, 0o755);
  const locating = spyOn(Bun, 'which').mockReturnValue(executable);
  try {
    expect(() => readWorkspace(f.root)).toThrow('Git observation failed');
  } finally {
    locating.mockRestore();
  }
}, 25000);

it('suppresses an actual repository-configured Git fsmonitor program during census', () => {
  const f = createFixture();
  f.write('required.xyz', 'required');
  f.add('required.xyz');
  const control = mkdtempSync(join(tmpdir(), 'puni-native-fsmonitor-'));
  roots.push(control);
  const marker = join(control, 'invoked'),
    executable = join(control, 'hook.ts');
  writeFileSync(
    executable,
    '#!' +
      process.execPath +
      '\nimport{writeFileSync}from"node:fs";writeFileSync(' +
      JSON.stringify(marker) +
      ',"invoked");process.stdout.write("probe-token\\0/\\0");',
  );
  chmodSync(executable, 0o755);
  git(f.root, ['config', 'core.fsmonitor', executable]);
  git(f.root, ['config', 'core.fsmonitorHookVersion', '2']);
  expect(readWorkspace(f.root).entries.map((entry) => entry.path)).toEqual(['required.xyz']);
  expect(existsSync(marker)).toBe(false);
});
it('isolates an actual malformed XDG global Git configuration from the selected worktree', () => {
  const f = createFixture();
  f.write('required.xyz', 'required');
  f.add('required.xyz');
  const control = mkdtempSync(join(tmpdir(), 'puni global Git config '));
  roots.push(control);
  mkdirSync(join(control, 'git'));
  writeFileSync(join(control, 'git/config'), '[malformed global config');
  const prior = process.env['XDG_CONFIG_HOME'];
  process.env['XDG_CONFIG_HOME'] = control;
  try {
    expect(readWorkspace(f.root).entries.map((entry) => entry.path)).toEqual(['required.xyz']);
  } finally {
    if (prior === undefined) Reflect.deleteProperty(process.env, 'XDG_CONFIG_HOME');
    else process.env['XDG_CONFIG_HOME'] = prior;
  }
});
it('suppresses a controlled native system configuration pathname at the Git tool boundary', () => {
  const f = createFixture();
  f.write('required.xyz', 'required');
  f.add('required.xyz');
  const control = mkdtempSync(join(tmpdir(), 'puni native system config '));
  roots.push(control);
  const configuration = join(control, 'system-config'),
    executable = join(control, 'git-proxy.ts');
  writeFileSync(configuration, '[malformed system config');
  writeFileSync(
    executable,
    '#!' +
      process.execPath +
      '\nconst child=Bun.spawnSync(["/usr/bin/git",...process.argv.slice(2)],{env:{...process.env,GIT_CONFIG_SYSTEM:' +
      JSON.stringify(configuration) +
      '},stdin:"ignore",stdout:"pipe",stderr:"pipe",timeout:5000});process.stdout.write(child.stdout);process.stderr.write(child.stderr);process.exit(child.exitCode);',
  );
  chmodSync(executable, 0o755);
  const locating = spyOn(Bun, 'which').mockReturnValue(executable);
  try {
    expect(readWorkspace(f.root).entries.map((entry) => entry.path)).toEqual(['required.xyz']);
  } finally {
    locating.mockRestore();
  }
});

it('refuses observed nonregular leaves before opening a descriptor', () => {
  const f = createFixture();
  f.write('required.xyz', 'original');
  f.add('required.xyz');
  rmSync(join(f.root, 'required.xyz'));
  mkdirSync(join(f.root, 'required.xyz'));
  const opening = spyOn(filesystem, 'openSync');
  try {
    expect(() => readWorkspace(f.root)).toThrow('regular file');
    expect(opening.mock.calls.some(([path]) => path === join(f.root, 'required.xyz'))).toBe(false);
  } finally {
    opening.mockRestore();
  }
});
it('refuses a gitlink whose physical directory was replaced by a symlink', () => {
  const f = createFixture(),
    child = createFixture();
  git(child.root, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '--allow-empty',
    '-m',
    'fixture',
  ]);
  const commit = git(child.root, ['rev-parse', 'HEAD']).trim();
  symlinkSync(child.root, join(f.root, 'nested'));
  git(f.root, ['update-index', '--add', '--cacheinfo', '160000,' + commit + ',nested']);
  expect(() => readWorkspace(f.root)).toThrow('physical directory');
});
it('refuses observed symlink text replacement before returning a mixed link observation', () => {
  const f = createFixture();
  symlinkSync('original-target', join(f.root, 'link'));
  const nativeRead = filesystem.readlinkSync;
  let reached = false;
  const reading = spyOn(filesystem, 'readlinkSync').mockImplementation(((
    path: filesystem.PathLike,
    options?: filesystem.BufferEncodingOption | filesystem.EncodingOption,
  ) => {
    const bytes =
      options === 'buffer' || (typeof options === 'object' && options?.encoding === 'buffer')
        ? nativeRead(path, 'buffer')
        : nativeRead(
            path,
            typeof options === 'object' && options !== null ? options.encoding : options,
          );
    if (path === join(f.root, 'link')) {
      reached = true;
      rmSync(path);
      symlinkSync('replacement-target', path);
    }
    return bytes;
  }) as typeof filesystem.readlinkSync);
  try {
    expect(() => readWorkspace(f.root)).toThrow('symlink changed');
    expect(reached).toBe(true);
  } finally {
    reading.mockRestore();
  }
});
it('preserves an actual descriptor read failure after closing instead of replacing its cause', () => {
  const f = createFixture();
  f.write('required.xyz', 'content');
  f.add('required.xyz');
  const fault = new Error('owned read failure'),
    reading = spyOn(filesystem, 'readFileSync').mockImplementation(() => {
      throw fault;
    });
  try {
    let failure: unknown;
    try {
      readWorkspace(f.root);
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).cause).toBe(fault);
  } finally {
    reading.mockRestore();
  }
});
