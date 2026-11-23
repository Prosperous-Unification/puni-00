import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
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

import { afterAll, expect, it } from 'bun:test';

import { createHold, formatIdentity, readHold, releaseHold, verifyHold } from './hold-token';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni immutable hold '));
  roots.push(root);
  return { root, path: join(root, 'hold') };
}
const identity = {
  pid: process.pid,
  boot: '01234567-89ab-cdef-0123-456789abcdef',
  start: '123456',
};
it('publishes a complete immutable full identity and recognizes only its authorized disappearance', () => {
  const f = createFixture(),
    hold = createHold(f.path, identity);
  expect(readFileSync(f.path, 'utf8')).toBe(
    String(identity.pid) + ' ' + identity.boot + ' ' + identity.start + String.fromCharCode(10),
  );
  expect(hold.identity).toEqual(identity);
  expect(Object.isFrozen(hold.identity)).toBe(true);
  expect(Object.isFrozen(hold)).toBe(true);
  expect(readHold(f.path)).toEqual(hold);
  expect(verifyHold(hold)).toBe('present');
  expect(releaseHold(hold)).toBe('released');
  expect(readHold(f.path)).toBeUndefined();
  expect(verifyHold(hold)).toBe('released');
  expect(releaseHold(hold)).toBe('gone');
});
it('never overwrites an existing token or removes it after publication refusal', () => {
  const f = createFixture();
  writeFileSync(f.path, 'foreign', { mode: 0o600 });
  expect(() => createHold(f.path, identity)).toThrow();
  expect(readFileSync(f.path, 'utf8')).toBe('foreign');
});
for (const malformed of [
  '',
  '42',
  '42 boot start' + String.fromCharCode(10),
  '0 ' + identity.boot + ' 3' + String.fromCharCode(10),
  String(identity.pid) + ' ' + identity.boot + ' invalid' + String.fromCharCode(10),
])
  it('refuses malformed complete hold evidence ' + JSON.stringify(malformed), () => {
    const f = createFixture();
    writeFileSync(f.path, malformed, { mode: 0o600 });
    expect(() => readHold(f.path)).toThrow();
  });
it('refuses a symlink token without reading its target or treating it as released', () => {
  const f = createFixture(),
    target = join(f.root, 'target');
  const targetHold = createHold(target, identity);
  symlinkSync(target, f.path);
  captureInput('token-nofollow-input', {
    path: f.path,
    target,
    targetHold,
    link: lstatSync(f.path, { bigint: true }),
  });
  expect(() => readHold(f.path)).toThrow();
  expect(readFileSync(target, 'utf8')).toBe(targetHold.bytes);
});
it('refuses unreadable evidence while distinguishing ordinary absence', () => {
  const f = createFixture();
  expect(readHold(f.path)).toBeUndefined();
  createHold(f.path, identity);
  chmodSync(f.path, 0);
  try {
    expect(() => readHold(f.path)).toThrow();
  } finally {
    chmodSync(f.path, 0o600);
  }
});
for (const mutation of ['bytes', 'inode', 'mode'] as const)
  it('retains a changed ' + mutation + ' token rather than using it as release authority', () => {
    const f = createFixture(),
      hold = createHold(f.path, identity),
      bytes = readFileSync(f.path);
    if (mutation === 'bytes') writeFileSync(f.path, 'foreign');
    else if (mutation === 'inode') {
      renameSync(f.path, f.path + '.original');
      writeFileSync(f.path, bytes, { mode: 0o600 });
    } else chmodSync(f.path, 0o644);
    expect(() => verifyHold(hold)).toThrow();
    expect(() => releaseHold(hold)).toThrow();
    expect(existsSync(f.path)).toBe(true);
  });
for (const changed of [
  { ...identity, pid: 0 },
  { ...identity, boot: '' },
  { ...identity, start: 'invalid' },
])
  it('refuses invalid identity before creating a token ' + JSON.stringify(changed), () => {
    const f = createFixture();
    expect(() => createHold(f.path, changed)).toThrow();
    expect(existsSync(f.path)).toBe(false);
  });
it('requires an absolute normalized hold pathname before publication', () => {
  expect(() => createHold('relative', identity)).toThrow();
});

it('refuses a same-inode UTF8 BOM mutation instead of accepting normalized token bytes', () => {
  const f = createFixture(),
    hold = createHold(f.path, identity);
  writeFileSync(f.path, Buffer.concat([Buffer.from([239, 187, 191]), Buffer.from(hold.bytes)]));
  captureInput('token-bom-input', {
    hold,
    mutatedBytes: readFileSync(f.path),
    file: lstatSync(f.path, { bigint: true }),
  });
  expect(() => verifyHold(hold)).toThrow();
  expect(() => releaseHold(hold)).toThrow();
  expect(existsSync(f.path)).toBe(true);
});

for (const kind of ['hold', 'decision'] as const)
  it(
    'preserves malformed ' + kind + ' decoding together with actual descriptor close failure',
    () => {
      const f = createFixture();
      writeFileSync(f.path, 'malformed', { mode: 0o600 });
      const program = [
        'import{mock}from"bun:test";',
        'const fs=await import("node:fs"),close=fs.closeSync;',
        'mock.module("node:fs",()=>({...fs,closeSync(descriptor){close(descriptor);throw new Error("controlled descriptor close failure");}}));',
        'const module=await import(' +
          JSON.stringify(new URL('./hold-token.ts', import.meta.url).href) +
          ');',
        'try{module[' +
          JSON.stringify(kind === 'hold' ? 'readHold' : 'readDecision') +
          '](' +
          JSON.stringify(f.path) +
          ');throw new Error("decoder unexpectedly accepted");}catch(cause){const failures=cause instanceof AggregateError?cause.errors:[cause];process.stdout.write(JSON.stringify(failures.map(failure=>failure instanceof Error?failure.message:String(failure))));}',
      ].join(String.fromCharCode(10));
      new Bun.Transpiler({ loader: 'ts' }).transformSync(program);
      captureInput('token-decode-' + kind + '-input', {
        program,
        path: f.path,
        bytes: readFileSync(f.path),
      });
      const child = Bun.spawnSync(
        [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
        { cwd: f.root, stdout: 'pipe', stderr: 'pipe' },
      );
      captureInput('token-decode-' + kind + '-output', {
        exitCode: child.exitCode,
        stdout: child.stdout.toString(),
        stderr: child.stderr.toString(),
      });
      expect(child.exitCode, child.stderr.toString()).toBe(0);
      expect(JSON.parse(child.stdout.toString())).toEqual([
        kind === 'hold' ? 'hold process identity is malformed' : 'hold decision kind is malformed',
        'controlled descriptor close failure',
      ]);
    },
  );

function captureInput(name: string, input: unknown): void {
  const directory = process.env['PUNI_HOLDER_R5_CAPTURE'];
  if (directory === undefined) return;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(directory, name + '.json'),
    JSON.stringify(
      input,
      (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  );
}
function inspectPhysicalToken(
  f: ReturnType<typeof createFixture>,
  name: string,
  setup: string,
): unknown {
  const program = [
    'import{mock}from"bun:test";',
    'const fs=await import("node:fs"),path=' +
      JSON.stringify(f.path) +
      ',bytes=' +
      JSON.stringify(formatIdentity(identity)) +
      ',trace=[];',
    setup,
    'const module=await import(' +
      JSON.stringify(new URL('./hold-token.ts', import.meta.url).href) +
      ');',
    'let observation;try{const token=module.readHold(path);observation={kind:token===undefined?"absent":"admitted",token};}catch(cause){observation={kind:"refused",message:cause instanceof Error?cause.message:String(cause)};}',
    'process.stdout.write(JSON.stringify({observation,trace},(_key,value)=>typeof value==="bigint"?value.toString():value));',
  ].join('\n');
  new Bun.Transpiler({ loader: 'ts' }).transformSync(program);
  captureInput(name + '-input', {
    program,
    path: f.path,
    bytes: formatIdentity(identity),
    file: lstatSync(f.path, { bigint: true }),
  });
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    { cwd: f.root, stdout: 'pipe', stderr: 'pipe', timeout: 2000 },
  );
  captureInput(name + '-output', {
    exitCode: child.exitCode,
    signalCode: child.signalCode,
    stdout: child.stdout.toString(),
    stderr: child.stderr.toString(),
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  const receipt: unknown = JSON.parse(child.stdout.toString());
  if (typeof receipt !== 'object' || receipt === null || !('observation' in receipt))
    throw new Error('physical token receipt malformed');
  return receipt.observation;
}
it('rejects otherwise valid token bytes exposed to other users', () => {
  const f = createFixture();
  createHold(f.path, identity);
  chmodSync(f.path, 0o644);
  captureInput('token-private-input', {
    path: f.path,
    bytes: readFileSync(f.path, 'utf8'),
    file: lstatSync(f.path, { bigint: true }),
  });
  expect(() => readHold(f.path)).toThrow('owner-only');
});
it('rejects otherwise valid token bytes with stable foreign ownership observations', () => {
  const f = createFixture();
  createHold(f.path, identity);
  expect(
    inspectPhysicalToken(
      f,
      'token-uid',
      [
        'const fstat=fs.fstatSync;',
        'await mock.module("node:fs",()=>({...fs,fstatSync(descriptor,options){const stat=fstat(descriptor,options);stat.uid+=1n;trace.push({uid:stat.uid,mode:stat.mode,dev:stat.dev,ino:stat.ino});return stat;}}));',
      ].join('\n'),
    ),
  ).toEqual({ kind: 'refused', message: 'hold token must belong to the current user' });
});
it('rejects a real private FIFO containing otherwise valid token bytes', () => {
  const f = createFixture();
  const fifo = Bun.spawnSync(['/usr/bin/mkfifo', '-m', '600', f.path], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(fifo.exitCode, fifo.stderr.toString()).toBe(0);
  expect(
    inspectPhysicalToken(
      f,
      'token-type',
      [
        'const fstat=fs.fstatSync;let filled=false;',
        'await mock.module("node:fs",()=>({...fs,fstatSync(descriptor,options){if(!filled){filled=true;const writer=fs.openSync(path,fs.constants.O_WRONLY|fs.constants.O_NONBLOCK);try{fs.writeFileSync(writer,bytes);}finally{fs.closeSync(writer);}}const stat=fstat(descriptor,options);trace.push({isFile:stat.isFile(),isFIFO:stat.isFIFO(),mode:stat.mode,uid:stat.uid,dev:stat.dev,ino:stat.ino});return stat;}}));',
      ].join('\n'),
    ),
  ).toEqual({ kind: 'refused', message: 'hold token must be a regular file' });
});
it('rejects actual same-inode timestamp change between token byte observation and final fstat', () => {
  const f = createFixture();
  createHold(f.path, identity);
  expect(
    inspectPhysicalToken(
      f,
      'token-read-change',
      [
        'const fstat=fs.fstatSync;let calls=0;',
        'await mock.module("node:fs",()=>({...fs,fstatSync(descriptor,options){if(++calls===2)fs.utimesSync(path,1,1);const stat=fstat(descriptor,options);trace.push({call:calls,dev:stat.dev,ino:stat.ino,size:stat.size,mode:stat.mode,uid:stat.uid,mtimeNs:stat.mtimeNs,ctimeNs:stat.ctimeNs});return stat;}}));',
      ].join('\n'),
    ),
  ).toEqual({ kind: 'refused', message: 'hold token changed during observation' });
});
it('reads the same published token when its draft link is removed during observation', () => {
  const f = createFixture(),
    hold = createHold(f.path, identity);
  linkSync(f.path, f.path + '.draft');
  expect(
    inspectPhysicalToken(
      f,
      'token-published-draft-removal',
      [
        'const fstat=fs.fstatSync;let calls=0;',
        'await mock.module("node:fs",()=>({...fs,fstatSync(descriptor,options){if(++calls===2)fs.unlinkSync(path+".draft");const stat=fstat(descriptor,options);trace.push({call:calls,nlink:stat.nlink,ino:stat.ino,ctimeNs:stat.ctimeNs});return stat;}}));',
      ].join('\n'),
    ),
  ).toMatchObject({
    kind: 'admitted',
    token: { path: f.path, bytes: hold.bytes, inode: hold.inode.toString() },
  });
});
it('refuses an identical replacement encountered after observing draft removal', () => {
  const f = createFixture();
  createHold(f.path, identity);
  linkSync(f.path, f.path + '.draft');
  expect(
    inspectPhysicalToken(
      f,
      'token-publication-replacement',
      [
        'const fstat=fs.fstatSync;let calls=0;',
        'await mock.module("node:fs",()=>({...fs,fstatSync(descriptor,options){if(++calls!==2)return fstat(descriptor,options);fs.unlinkSync(path+".draft");const stat=fstat(descriptor,options);fs.renameSync(path,path+".original");fs.writeFileSync(path,bytes,{mode:0o600});trace.push({ino:stat.ino,replacement:fs.lstatSync(path,{bigint:true}).ino});return stat;}}));',
      ].join('\n'),
    ),
  ).toEqual({ kind: 'refused', message: 'hold token changed during observation' });
});
it('refuses changed byte observations during the draft removal retry', () => {
  const f = createFixture();
  createHold(f.path, identity);
  linkSync(f.path, f.path + '.draft');
  expect(
    inspectPhysicalToken(
      f,
      'token-publication-bytes',
      [
        'const fstat=fs.fstatSync,read=fs.readFileSync;let stats=0,reads=0;',
        'await mock.module("node:fs",()=>({...fs,fstatSync(fd,options){if(++stats===2)fs.unlinkSync(path+".draft");return fstat(fd,options);},readFileSync(fd,options){const observed=read(fd,options);return ++reads===1?Buffer.from(bytes.replace("123456","123457")):observed;}}));',
      ].join('\n'),
    ),
  ).toEqual({ kind: 'refused', message: 'hold token changed during observation' });
});
it('direct release refuses a replacement inode with otherwise identical valid identity bytes', () => {
  const f = createFixture(),
    hold = createHold(f.path, identity);
  renameSync(f.path, f.path + '.original');
  writeFileSync(f.path, hold.bytes, { mode: 0o600 });
  captureInput('token-release-input', {
    hold,
    replacement: lstatSync(f.path, { bigint: true }),
    replacementBytes: readFileSync(f.path, 'utf8'),
  });
  expect(() => releaseHold(hold)).toThrow('no longer matches');
  expect(readFileSync(f.path, 'utf8')).toBe(hold.bytes);
});

function inspectBoundary(
  f: ReturnType<typeof createFixture>,
  name: string,
  setup: string,
  operation: string,
  moduleFile = './hold-token.ts',
): unknown {
  const program = [
    'import{mock}from"bun:test";',
    'const fs=await import("node:fs"),path=' +
      JSON.stringify(f.path) +
      ',identity=' +
      JSON.stringify(identity) +
      ',trace=[];',
    setup,
    'const module=await import(' + JSON.stringify(new URL(moduleFile, import.meta.url).href) + ');',
    operation,
  ].join('\n');
  new Bun.Transpiler({ loader: 'ts' }).transformSync(program);
  captureInput(name + '-input', { program, path: f.path, identity });
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    { cwd: f.root, stdout: 'pipe', stderr: 'pipe', timeout: 3000 },
  );
  captureInput(name + '-output', {
    exitCode: child.exitCode,
    stdout: child.stdout.toString(),
    stderr: child.stderr.toString(),
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  return JSON.parse(child.stdout.toString()) as unknown;
}
it('exclusive token publication refuses an existing otherwise identical valid identity generation', () => {
  const f = createFixture();
  writeFileSync(f.path, formatIdentity(identity), { mode: 0o600 });
  captureInput('token-exclusive-input', {
    path: f.path,
    bytes: readFileSync(f.path, 'utf8'),
    file: lstatSync(f.path, { bigint: true }),
  });
  expect(() => createHold(f.path, identity)).toThrow();
  expect(readFileSync(f.path, 'utf8')).toBe(formatIdentity(identity));
});
it('refuses changed valid published bytes before granting token ownership', () => {
  const f = createFixture();
  expect(
    inspectBoundary(
      f,
      'token-published-bytes',
      [
        'const link=fs.linkSync,foreign={...identity,start:String(BigInt(identity.start)+1n)},foreignBytes=String(foreign.pid)+" "+foreign.boot+" "+foreign.start+"\\n";',
        'await mock.module("node:fs",()=>({...fs,linkSync(from,to){link(from,to);fs.writeFileSync(to,foreignBytes);trace.push({from,to,foreignBytes});}}));',
      ].join('\n'),
      'module.parseIdentity(foreignBytes);let observation;try{const token=module.createHold(path,identity);observation={kind:"admitted",token};}catch(cause){observation={kind:"refused",message:cause.message};}process.stdout.write(JSON.stringify(observation,(_key,value)=>typeof value==="bigint"?value.toString():value));',
    ),
  ).toEqual({ kind: 'refused', message: 'published hold token is absent or changed' });
});
it('preserves a partial token write and actual close failure while independently removing its owned draft', () => {
  const f = createFixture();
  expect(
    inspectBoundary(
      f,
      'token-partial-cleanup',
      [
        'const write=fs.writeFileSync,close=fs.closeSync;let closes=0;',
        'await mock.module("node:fs",()=>({...fs,writeFileSync(descriptor,bytes){write(descriptor,bytes.slice(0,5));throw new Error("controlled partial token write");},closeSync(descriptor){close(descriptor);closes++;throw new Error("controlled actual token close");}}));',
      ].join('\n'),
      'let failures;try{module.createHold(path,identity);failures=["unexpected admission"];}catch(cause){failures=(cause instanceof AggregateError?cause.errors:[cause]).map(failure=>failure.message);}process.stdout.write(JSON.stringify({failures,closes,published:fs.existsSync(path),drafts:fs.readdirSync(' +
        JSON.stringify(f.root) +
        ').filter(name=>name.includes(".draft-"))}));',
    ),
  ).toEqual({
    failures: ['controlled partial token write', 'controlled actual token close'],
    closes: 1,
    published: false,
    drafts: [],
  });
});
it('never recloses a recycled descriptor after creator close actually succeeded then reported failure', () => {
  const f = createFixture();
  expect(
    inspectBoundary(
      f,
      'token-close-once',
      [
        'const close=fs.closeSync;let closes=0,sibling;',
        'await mock.module("node:fs",()=>({...fs,closeSync(descriptor){close(descriptor);if(++closes===1){sibling=fs.openSync(path+".sibling","wx",0o600);if(sibling!==descriptor)throw new Error("controlled descriptor was not recycled");throw new Error("controlled reported close failure");}}}));',
      ].join('\n'),
      'let failures;try{module.createHold(path,identity);failures=["unexpected admission"];}catch(cause){failures=(cause instanceof AggregateError?cause.errors:[cause]).map(failure=>failure.message);}if(sibling===undefined)throw new Error("recycled sibling absent");let writer;try{fs.writeFileSync(sibling,"retained");writer="written";close(sibling);}catch(cause){if(cause.code!=="EBADF")throw cause;writer="closed";}process.stdout.write(JSON.stringify({failures,closes,writer,drafts:fs.readdirSync(' +
        JSON.stringify(f.root) +
        ').filter(name=>name.includes(".draft-"))}));',
    ),
  ).toEqual({
    failures: ['controlled reported close failure'],
    closes: 1,
    writer: 'written',
    drafts: [],
  });
});
it('refuses prohibited platform before reading otherwise valid Linux self identity', () => {
  const f = createFixture();
  expect(
    inspectBoundary(
      f,
      'self-platform',
      'Object.defineProperty(process,"platform",{value:"darwin"});',
      'let observation;try{observation={kind:"identified",identity:module.identifySelf()};}catch(cause){observation={kind:"refused",message:cause.message};}process.stdout.write(JSON.stringify(observation));',
      './process-identity.ts',
    ),
  ).toEqual({ kind: 'refused', message: 'durable hold identity requires Linux' });
});
it('refuses malformed trusted proc self structure before returning an identity', () => {
  const f = createFixture();
  expect(
    inspectBoundary(
      f,
      'self-malformed',
      [
        'const read=fs.readFileSync;',
        'await mock.module("node:fs",()=>({...fs,readFileSync(path,options){if(path==="/proc/self/stat")return "malformed trusted process state";return read(path,options);}}));',
      ].join('\n'),
      'let observation;try{observation={kind:"identified",identity:module.identifySelf()};}catch(cause){observation={kind:"refused",message:cause.message};}process.stdout.write(JSON.stringify(observation));',
      './process-identity.ts',
    ),
  ).toEqual({ kind: 'refused', message: 'durable hold process identity is malformed' });
});
it('identifies complete current Linux birth only with required readable proc identity files', () => {
  const f = createFixture();
  const receipt = inspectBoundary(
    f,
    'self-required-io',
    [
      'const read=fs.readFileSync,stat=read("/proc/self/stat","utf8"),expected={pid:process.pid,boot:read("/proc/sys/kernel/random/boot_id","utf8").trim(),start:stat.slice(stat.lastIndexOf(")")+2).split(" ").at(19)},fault=process.env.PUNI_SELF_IO_FAULT;',
      'if(fault!==undefined)await mock.module("node:fs",()=>({...fs,readFileSync(path,options){if((fault==="stat-missing"&&path==="/proc/self/stat")||(fault==="boot-unreadable"&&path==="/proc/sys/kernel/random/boot_id"))throw Object.assign(new Error("controlled required proc read failure"),{code:fault==="stat-missing"?"ENOENT":"EACCES"});return read(path,options);}}));',
    ].join('\n'),
    'let observation;try{observation={kind:"identified",identity:module.identifySelf()};}catch(cause){observation={kind:"refused",message:cause.message,code:cause.code};}process.stdout.write(JSON.stringify({observation,expected}));',
    './process-identity.ts',
  );
  if (
    typeof receipt !== 'object' ||
    receipt === null ||
    !('observation' in receipt) ||
    !('expected' in receipt)
  )
    throw new Error('self identity receipt malformed');
  expect(receipt.observation).toEqual({ kind: 'identified', identity: receipt.expected });
});

it('preserves owned draft unlink failure beside the original partial write and actual close failure', () => {
  const f = createFixture();
  expect(
    inspectBoundary(
      f,
      'token-unlink-failure',
      [
        'const write=fs.writeFileSync,close=fs.closeSync;let closes=0;',
        'await mock.module("node:fs",()=>({...fs,writeFileSync(descriptor,bytes){write(descriptor,bytes.slice(0,5));throw new Error("controlled partial token write");},closeSync(descriptor){close(descriptor);closes++;throw new Error("controlled actual token close");},unlinkSync(path){throw Object.assign(new Error("controlled owned draft unlink"),{code:"EACCES"});}}));',
      ].join('\n'),
      'let failures;try{module.createHold(path,identity);failures=["unexpected admission"];}catch(cause){failures=(cause instanceof AggregateError?cause.errors:[cause]).map(failure=>failure.code??failure.message);}process.stdout.write(JSON.stringify({failures,closes,published:fs.existsSync(path),draftCount:fs.readdirSync(' +
        JSON.stringify(f.root) +
        ').filter(name=>name.includes(".draft-")).length}));',
    ),
  ).toEqual({
    failures: ['controlled partial token write', 'controlled actual token close', 'EACCES'],
    closes: 1,
    published: false,
    draftCount: 1,
  });
});

for (const shape of ['relative', 'nonnormalized'] as const)
  it('refuses token publication outside an absolute normalized pathname ' + shape, () => {
    const f = createFixture();
    expect(
      inspectBoundary(
        f,
        'token-path-' + shape,
        'fs.mkdirSync(path+".nested");const target=' +
          (shape === 'relative'
            ? JSON.stringify('relative')
            : JSON.stringify(f.path + '.nested/../hold')) +
          ';',
        'let observation;try{const token=module.createHold(target,identity);observation={kind:"admitted",token};}catch(cause){observation={kind:"refused",message:cause.message};}process.stdout.write(JSON.stringify(observation,(_key,value)=>typeof value==="bigint"?value.toString():value));',
      ),
    ).toEqual({ kind: 'refused', message: 'hold pathname must be absolute and normalized' });
  });
it('refuses noncanonical boot identity grammar with all physical token prerequisites valid', () => {
  const f = createFixture(),
    bytes = String(identity.pid) + ' invalid-boot ' + identity.start + '\n';
  writeFileSync(f.path, bytes, { mode: 0o600 });
  captureInput('token-grammar-input', {
    path: f.path,
    bytes,
    file: lstatSync(f.path, { bigint: true }),
  });
  expect(() => readHold(f.path)).toThrow('malformed');
});
it('refuses a syntactically complete PID outside the native range with valid token bytes', () => {
  const f = createFixture(),
    bytes = '2147483648 ' + identity.boot + ' ' + identity.start + '\n';
  writeFileSync(f.path, bytes, { mode: 0o600 });
  captureInput('token-pid-input', {
    path: f.path,
    bytes,
    file: lstatSync(f.path, { bigint: true }),
  });
  expect(() => readHold(f.path)).toThrow('native range');
});

it('residual invalid UTF8 fails at the fatal trusted-byte decoder before identity parsing', () => {
  const f = createFixture(),
    bytes = Buffer.from([0xc3, 0x28]);
  writeFileSync(f.path, bytes, { mode: 0o600 });
  captureInput('residual-token-utf8', {
    path: f.path,
    hex: bytes.toString('hex'),
    physical: lstatSync(f.path, { bigint: true }),
  });
  let observation;
  try {
    readHold(f.path);
    observation = 'accepted';
  } catch (cause) {
    observation =
      cause instanceof TypeError
        ? 'fatal-utf8'
        : cause instanceof Error
          ? cause.message
          : String(cause);
  }
  expect(observation).toBe('fatal-utf8');
});
