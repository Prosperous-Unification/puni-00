import * as filesystem from 'node:fs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dlopen, FFIType } from 'bun:ffi';
import { afterAll, expect, it, spyOn } from 'bun:test';

import { holdLock, readEpochNanoseconds } from './native';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni shared native lock '));
  roots.push(root);
  return { root, path: join(root, 'mutex') };
}
function runPeer(root: string, path: string) {
  const entry = join(root, 'peer.ts');
  writeFileSync(
    entry,
    'import{holdLock}from ' +
      JSON.stringify(join(import.meta.dir, 'native.ts')) +
      ';process.stdout.write(JSON.stringify(await holdLock(' +
      JSON.stringify(path) +
      ',async()=>"peer-owned")));',
  );
  return Bun.spawnSync([process.execPath, '--no-env-file', '--config=/dev/null', entry], {
    cwd: root,
    env: { PATH: '/usr/bin:/bin' },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000,
  });
}

it('holds the actual inode through awaited work and admits the next independent process only after close', async () => {
  const fixture = createFixture(),
    entered = Promise.withResolvers<undefined>(),
    release = Promise.withResolvers<undefined>();
  let competitorCalls = 0;
  const owning = holdLock(fixture.path, async () => {
    entered.resolve(undefined);
    await release.promise;
    return 'first-owned';
  });
  try {
    await Promise.race([
      entered.promise,
      owning.then(() => {
        throw new Error('lock returned before entering awaited operation');
      }),
    ]);
    expect(
      await holdLock(fixture.path, () => {
        competitorCalls++;
        return Promise.resolve('wrong');
      }),
    ).toEqual({ kind: 'busy' });
    expect(competitorCalls).toBe(0);
    const peer = runPeer(fixture.root, fixture.path);
    expect(peer.exitCode, peer.stderr.toString()).toBe(0);
    expect(JSON.parse(peer.stdout.toString())).toEqual({ kind: 'busy' });
  } finally {
    release.resolve(undefined);
    await owning;
  }
  expect(await owning).toEqual({ kind: 'owned', value: 'first-owned' });
  const peer = runPeer(fixture.root, fixture.path);
  expect(peer.exitCode, peer.stderr.toString()).toBe(0);
  expect(JSON.parse(peer.stdout.toString())).toEqual({ kind: 'owned', value: 'peer-owned' });
}, 15000);

it('preserves the operation failure and closes its kernel lock before returning it', async () => {
  const fixture = createFixture(),
    failure = new Error('controlled protected operation failure');
  const cause: unknown = await holdLock(fixture.path, () => Promise.reject(failure)).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(cause).toBe(failure);
  const peer = runPeer(fixture.root, fixture.path);
  expect(peer.exitCode, peer.stderr.toString()).toBe(0);
  expect(JSON.parse(peer.stdout.toString())).toEqual({ kind: 'owned', value: 'peer-owned' });
});

it('never removes or replaces an existing canonical mutex inode or its bytes', async () => {
  const fixture = createFixture();
  writeFileSync(fixture.path, 'operator-owned mutex bytes');
  const before = Bun.file(fixture.path);
  const inode = await before.stat();
  expect(await holdLock(fixture.path, () => Promise.resolve(42))).toEqual({
    kind: 'owned',
    value: 42,
  });
  expect(existsSync(fixture.path)).toBe(true);
  expect(readFileSync(fixture.path, 'utf8')).toBe('operator-owned mutex bytes');
  const after = await Bun.file(fixture.path).stat();
  expect([after.dev, after.ino]).toEqual([inode.dev, inode.ino]);
});

it('does not enter work when the selected lock file cannot be acquired', async () => {
  const fixture = createFixture();
  mkdirSync(fixture.path);
  let calls = 0;
  const cause: unknown = await holdLock(fixture.path, () => {
    calls++;
    return Promise.resolve(undefined);
  }).then(
    () => undefined,
    (cause: unknown) => cause,
  );
  expect(calls).toBe(0);
  expect(cause).toBeInstanceOf(Error);
});

it('reads a true epoch nanosecond timestamp within native wall bounds', () => {
  const before = BigInt(Date.now()),
    stamp = readEpochNanoseconds(),
    after = BigInt(Date.now());
  expect(stamp).toBeTypeOf('bigint');
  expect(stamp.toString()).toMatch(/^[0-9]{19}$/u);
  expect(stamp / 1000000n >= before).toBe(true);
  expect(stamp / 1000000n <= after).toBe(true);
});

async function waitMarker(path: string) {
  const deadline = performance.now() + 5000;
  while (!existsSync(path)) {
    if (performance.now() >= deadline)
      throw new Error('native lock child did not acquire: ' + path);
    await Bun.sleep(5);
  }
}

it('the kernel releases the native lock after its owning process is killed', async () => {
  const fixture = createFixture(),
    marker = join(fixture.root, 'held'),
    entry = join(fixture.root, 'owner.ts');
  writeFileSync(
    entry,
    'import{holdLock}from ' +
      JSON.stringify(join(import.meta.dir, 'native.ts')) +
      ';await holdLock(' +
      JSON.stringify(fixture.path) +
      ',async()=>{await Bun.write(' +
      JSON.stringify(marker) +
      ',"held");await new Promise(()=>setInterval(()=>undefined,1000));});',
  );
  const child = Bun.spawn([process.execPath, '--no-env-file', '--config=/dev/null', entry], {
    cwd: fixture.root,
    env: { PATH: '/usr/bin:/bin' },
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 10000,
  });
  const diagnostic = new Response(child.stderr).text();
  try {
    await waitMarker(marker);
    expect(await holdLock(fixture.path, () => Promise.resolve('must-not-enter'))).toEqual({
      kind: 'busy',
    });
    child.kill('SIGKILL');
    await child.exited;
    expect(child.signalCode).toBe('SIGKILL');
    expect(await holdLock(fixture.path, () => Promise.resolve('after-death'))).toEqual({
      kind: 'owned',
      value: 'after-death',
    });
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
    await child.exited;
    expect(await diagnostic).toBe('');
  }
}, 15000);

it.skipIf(process.platform !== 'linux')(
  'a spawned child inherits no descriptor for the held mutex inode',
  async () => {
    const fixture = createFixture();
    await holdLock(fixture.path, () => {
      const identity = filesystem.statSync(fixture.path, { bigint: true }),
        entry = join(fixture.root, 'inheritance.ts');
      writeFileSync(
        entry,
        'import{fstatSync,readdirSync}from"node:fs";const inherited=[];for(const fd of readdirSync("/proc/self/fd")){try{const status=fstatSync(Number(fd),{bigint:true});if(status.dev===' +
          identity.dev.toString() +
          'n&&status.ino===' +
          identity.ino.toString() +
          'n)inherited.push(fd);}catch(cause){if(!(cause instanceof Error&&"code"in cause&&cause.code==="EBADF"))throw cause;}}process.stdout.write(JSON.stringify(inherited));',
      );
      const child = Bun.spawnSync(
        [process.execPath, '--no-env-file', '--config=/dev/null', entry],
        {
          cwd: fixture.root,
          env: { PATH: '/usr/bin:/bin' },
          stdin: 'ignore',
          stdout: 'pipe',
          stderr: 'pipe',
          timeout: 5000,
        },
      );
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      expect(JSON.parse(child.stdout.toString())).toEqual([]);
      return Promise.resolve(undefined);
    });
  },
);

it('refuses an actual descriptor whose close-on-exec bit was cleared before admission', async () => {
  const fixture = createFixture(),
    nativeOpen = filesystem.openSync,
    library = dlopen(process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libc.so.6', {
      fcntl: { args: [FFIType.i32, FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    });
  let injected = false,
    calls = 0;
  const changed = spyOn(filesystem, 'openSync').mockImplementation((path, flags, mode) => {
    const fd = nativeOpen(path, flags, mode);
    if (path === fixture.path) {
      if (library.symbols.fcntl(fd, 2, 0) !== 0) throw new Error('controlled bit clearing failed');
      injected = true;
    }
    return fd;
  });
  try {
    const cause: unknown = await holdLock(fixture.path, () => {
      calls++;
      return Promise.resolve(undefined);
    }).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(injected).toBe(true);
    expect(calls).toBe(0);
    expect(String(cause)).toContain('mutex descriptor must close on exec');
  } finally {
    changed.mockRestore();
    library.close();
  }
  expect(await holdLock(fixture.path, () => Promise.resolve('restored'))).toEqual({
    kind: 'owned',
    value: 'restored',
  });
});

it('refuses a ready FIFO at the regular-file boundary without entering work', async () => {
  const fixture = createFixture(),
    made = Bun.spawnSync(['/usr/bin/mkfifo', fixture.path], { stdout: 'pipe', stderr: 'pipe' });
  expect(made.exitCode, made.stderr.toString()).toBe(0);
  const reader = filesystem.openSync(
    fixture.path,
    filesystem.constants.O_RDONLY | filesystem.constants.O_NONBLOCK,
  );
  let calls = 0;
  try {
    const cause: unknown = await holdLock(fixture.path, () => {
      calls++;
      return Promise.resolve(undefined);
    }).then(
      () => undefined,
      (cause: unknown) => cause,
    );
    expect(calls).toBe(0);
    expect(String(cause)).toContain('mutex must be a regular file');
  } finally {
    filesystem.closeSync(reader);
  }
});

it('refuses a readerless FIFO before native open can block', async () => {
  const fixture = createFixture(),
    made = Bun.spawnSync(['/usr/bin/mkfifo', fixture.path], { stdout: 'pipe', stderr: 'pipe' });
  expect(made.exitCode, made.stderr.toString()).toBe(0);
  const entry = join(fixture.root, 'fifo.ts');
  writeFileSync(
    entry,
    'import{holdLock}from ' +
      JSON.stringify(join(import.meta.dir, 'native.ts')) +
      ';try{await holdLock(' +
      JSON.stringify(fixture.path) +
      ',()=>Promise.resolve("must-not-run"));throw new Error("readerless FIFO admitted");}catch(cause){if(!(cause instanceof Error&&"code"in cause&&cause.code==="ENXIO"))throw cause;process.stdout.write("nonblocking FIFO refusal");}',
  );
  const child = Bun.spawn([process.execPath, '--no-env-file', '--config=/dev/null', entry], {
      cwd: fixture.root,
      env: { PATH: '/usr/bin:/bin' },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    }),
    outward = new Response(child.stdout).text(),
    diagnostic = new Response(child.stderr).text();
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
  }, 2000);
  try {
    const [status, stdout, stderr] = await Promise.all([child.exited, outward, diagnostic]);
    expect(status, stderr).toBe(0);
    expect(stdout).toBe('nonblocking FIFO refusal');
  } finally {
    clearTimeout(timer);
    child.kill('SIGKILL');
    await child.exited;
  }
}, 5000);

for (const failedOperation of [false, true])
  it(
    'preserves ' +
      (failedOperation ? 'paired operation and close' : 'close-only') +
      ' failure identity after the real descriptor closes',
    async () => {
      const fixture = createFixture(),
        nativeClose = filesystem.closeSync,
        operation = new Error('controlled operation failure'),
        release = new Error('controlled close failure');
      let injected = false;
      const changed = spyOn(filesystem, 'closeSync').mockImplementation((fd) => {
        nativeClose(fd);
        if (!injected) {
          injected = true;
          throw release;
        }
      });
      let cause: unknown;
      try {
        cause = await holdLock(fixture.path, () =>
          failedOperation ? Promise.reject(operation) : Promise.resolve('completed'),
        ).then(
          () => undefined,
          (cause: unknown) => cause,
        );
      } finally {
        changed.mockRestore();
      }
      expect(injected).toBe(true);
      if (failedOperation) {
        expect(cause).toBeInstanceOf(AggregateError);
        if (!(cause instanceof AggregateError)) throw new Error('paired native failure absent');
        expect(cause.errors).toEqual([operation, release]);
      } else expect(cause).toBe(release);
      // The fault closes natively before throwing. A generic failed close alone would not prove release.
      const peer = runPeer(fixture.root, fixture.path);
      expect(peer.exitCode, peer.stderr.toString()).toBe(0);
      expect(JSON.parse(peer.stdout.toString())).toEqual({ kind: 'owned', value: 'peer-owned' });
    },
  );

function runKernelControl(fault: string, clock: boolean, importOnly = false) {
  const fixture = createFixture(),
    entry = join(fixture.root, 'kernel-control.mjs');
  const source = `
import{mock}from'bun:test';import{existsSync}from'node:fs';
const actual=await import('bun:ffi'),os=await import('node:os'),realOpen=actual.dlopen,fault=${JSON.stringify(fault)};
if(fault==='platform')Object.defineProperty(process,'platform',{value:'freebsd'});
if(fault==='architecture')Object.defineProperty(process,'arch',{value:'ia32'});
if(fault==='endianness')mock.module('node:os',()=>({...os,endianness:()=> 'BE'}));
let loaded=false,touched=false,calls=0;const errnoBytes=Buffer.alloc(4);errnoBytes.writeInt32LE(fault==='flags-error'?9:13);
mock.module('bun:ffi',()=>({...actual,dlopen:(...args)=>{loaded=true;if(fault==='library')throw new Error('controlled libc load refusal');const library=realOpen(...args),symbols={...library.symbols};
const errnoName=process.platform==='darwin'?'__error':'__errno_location';symbols[errnoName]=()=>{if(fault==='errno-pointer'){touched=true;return null;}return actual.ptr(errnoBytes);};
const flock=symbols.flock;symbols.flock=(...args)=>{if(fault==='flock-error'||fault==='errno-pointer'){touched=true;return -1;}if(fault==='flock-status'){touched=true;return 1;}return flock(...args);};
const fcntl=symbols.fcntl;symbols.fcntl=(...args)=>{const flags=fcntl(...args);if(fault==='flags-error'){touched=true;return -1;}return flags;};
const readClock=symbols.clock_gettime;symbols.clock_gettime=(id,bytes)=>{const status=readClock(id,bytes);if(status!==0)throw new Error('control native realtime precondition failed');if(fault==='clock-error'){touched=true;return -1;}if(fault==='nanoseconds-negative'||fault==='nanoseconds-large'){touched=true;bytes.writeBigInt64LE(fault==='nanoseconds-negative'?-1n:1000000000n,8);}if(fault==='stamp-width'){touched=true;bytes.writeBigInt64LE(0n,0);bytes.writeBigInt64LE(0n,8);}return status;};
return{...library,symbols};}}));
const {readEpochNanoseconds,holdLock}=await import(${JSON.stringify(join(import.meta.dir, 'native.ts'))});
try{const value=${importOnly ? '"imported"' : clock ? 'readEpochNanoseconds().toString()' : 'await holdLock(' + JSON.stringify(fixture.path) + ',()=>{calls++;return Promise.resolve("entered");})'};process.stdout.write(JSON.stringify({kind:'returned',value,calls,loaded,touched,exists:existsSync(${JSON.stringify(fixture.path)})}));}
catch(cause){process.stdout.write(JSON.stringify({kind:'refused',message:cause instanceof Error?cause.message:String(cause),calls,loaded,touched,exists:existsSync(${JSON.stringify(fixture.path)})}));}
`;
  writeFileSync(entry, source);
  const child = Bun.spawnSync([process.execPath, '--no-env-file', '--config=/dev/null', entry], {
    cwd: fixture.root,
    env: { PATH: '/usr/bin:/bin' },
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 5000,
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(child.stderr.toString()).toBe('');
  return JSON.parse(child.stdout.toString()) as {
    kind: string;
    message?: string;
    calls: number;
    loaded: boolean;
    touched: boolean;
    exists: boolean;
  };
}
for (const [fault, diagnostic] of [
  ['platform', 'heavy lock platform is unsupported'],
  ['architecture', 'supported 64-bit little-endian host ABI'],
  ['endianness', 'supported 64-bit little-endian host ABI'],
  ['library', 'controlled libc load refusal'],
] as const)
  it('refuses ' + fault + ' before opening a mutex or entering work', () => {
    const report = runKernelControl(fault, false);
    expect(report.exists).toBe(false);
    expect(report.calls).toBe(0);
    expect(report.kind).toBe('refused');
    expect(report.loaded).toBe(fault === 'library');
    expect(report.message).toContain(diagnostic);
  });
for (const [fault, diagnostic] of [
  ['flock-error', 'native flock failed: errno 13'],
  ['flock-status', 'native flock returned an invalid status'],
  ['flags-error', 'descriptor flags failed: errno 9'],
  ['errno-pointer', 'native errno pointer is absent'],
] as const)
  it('refuses controlled native ' + fault + ' without entering work', () => {
    const report = runKernelControl(fault, false);
    expect(report.touched).toBe(true);
    expect(report.calls).toBe(0);
    expect(report.kind).toBe('refused');
    expect(report.message).toContain(diagnostic);
  });
for (const [fault, diagnostic] of [
  ['clock-error', 'realtime clock failed: errno 13'],
  ['nanoseconds-negative', 'realtime nanoseconds are malformed'],
  ['nanoseconds-large', 'realtime nanoseconds are malformed'],
  ['stamp-width', 'cannot name a 19-digit epoch ticket'],
] as const)
  it('refuses controlled realtime ' + fault + ' before returning a ticket stamp', () => {
    const report = runKernelControl(fault, true);
    expect(report.touched).toBe(true);
    expect(report.calls).toBe(0);
    expect(report.kind).toBe('refused');
    expect(report.message).toContain(diagnostic);
    expect(report.exists).toBe(false);
  });

it('imports the native adapter without opening a library clock mutex or worker', () => {
  const report = runKernelControl('library', false, true);
  expect(report).toMatchObject({
    kind: 'returned',
    calls: 0,
    loaded: false,
    touched: false,
    exists: false,
  });
});
