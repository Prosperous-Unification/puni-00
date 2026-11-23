import {
  chmodSync,
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, expect, it } from 'bun:test';

import { readGeneration, removeGeneration, removeLog, reserveLog, verifyLog } from './hold-log';
import { identifySelf } from './process-identity';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'puni hold log reservation '));
  roots.push(root);
  return { root, holdFile: join(root, 'hold'), record: join(root, 'reservation.json') };
}
const helper = join(import.meta.dir, 'testing/hold-log.test.fixture.ts');
function inspect(
  f: ReturnType<typeof createFixture>,
  stdout: number,
  stderr = stdout,
  fault?: string,
) {
  const controller = identifySelf();
  captureInput('log-' + (fault ?? 'bound') + '-parent-input', {
    holdFile: f.holdFile,
    controller,
    stdout: fstatSync(stdout, { bigint: true }),
    stderr: fstatSync(stderr, { bigint: true }),
    named: lstatSync(f.holdFile + '.log', { bigint: true }),
  });
  return Bun.spawnSync(
    [
      process.execPath,
      '--no-env-file',
      '--config=/dev/null',
      helper,
      f.holdFile,
      f.record,
      String(controller.pid),
      controller.boot,
      controller.start,
    ],
    {
      env: { ...process.env, ...(fault === undefined ? {} : { PUNI_LOG_CONTROLLER_FAULT: fault }) },
      cwd: f.root,
      stdin: 'ignore',
      stdout,
      stderr,
      timeout: 2000,
    },
  );
}

it('binds both inherited native output descriptors to the same exclusive physical controller log', () => {
  const f = createFixture(),
    log = reserveLog(f.holdFile);
  try {
    expect(inspect(f, log.descriptor).exitCode).toBe(0);
    expect(JSON.parse(readFileSync(f.record, 'utf8'))).toEqual({
      controller: log.controller,
      path: log.path,
      device: log.device.toString(),
      inode: log.inode.toString(),
    });
    expect(readFileSync(log.path, 'utf8')).toBe('');
    expect(Object.isFrozen(log.controller)).toBe(true);
  } finally {
    log.closeDescriptor();
    removeLog(log);
  }
});
it('refuses an existing log without changing its bytes', () => {
  const f = createFixture();
  writeFileSync(f.holdFile + '.log', 'foreign', { mode: 0o600 });
  expect(() => reserveLog(f.holdFile)).toThrow();
  expect(readFileSync(f.holdFile + '.log', 'utf8')).toBe('foreign');
});
it('refuses unrelated inherited stderr without publishing a reservation', () => {
  const f = createFixture(),
    other = createFixture(),
    log = reserveLog(f.holdFile),
    peer = reserveLog(other.holdFile);
  try {
    expect(inspect(f, log.descriptor, peer.descriptor, 'split-outputs').exitCode).toBe(70);
    expect(existsSync(f.record)).toBe(false);
  } finally {
    log.closeDescriptor();
    peer.closeDescriptor();
    removeLog(log);
    removeLog(peer);
  }
});
it('refuses malformed controller operands before granting the child reservation', () => {
  const f = createFixture(),
    log = reserveLog(f.holdFile);
  try {
    expect(inspect(f, log.descriptor, log.descriptor, 'malformed').exitCode).toBe(70);
    expect(existsSync(f.record)).toBe(false);
  } finally {
    log.closeDescriptor();
    removeLog(log);
  }
});
it('refuses a symlink pathname even when both outputs refer to its physical target', () => {
  const f = createFixture(),
    other = createFixture(),
    log = reserveLog(other.holdFile);
  symlinkSync(log.path, f.holdFile + '.log');
  try {
    expect(inspect(f, log.descriptor).exitCode).toBe(70);
    expect(existsSync(f.record)).toBe(false);
  } finally {
    log.closeDescriptor();
    removeLog(log);
  }
});
it('never closes a recycled native descriptor on repeated log release', () => {
  const f = createFixture(),
    log = reserveLog(f.holdFile);
  log.closeDescriptor();
  const sibling = openSync(join(f.root, 'sibling'), 'wx');
  try {
    log.closeDescriptor();
    expect(() => log.descriptor).toThrow();
    writeFileSync(sibling, 'retained');
    expect(readFileSync(join(f.root, 'sibling'), 'utf8')).toBe('retained');
  } finally {
    closeSync(sibling);
    removeLog(log);
  }
});
it('retains a replacement log rather than deleting another inode', () => {
  const f = createFixture(),
    log = reserveLog(f.holdFile);
  log.closeDescriptor();
  renameSync(log.path, log.path + '.original');
  writeFileSync(log.path, 'foreign', { mode: 0o600 });
  captureInput('log-remove-replacement-input', {
    log: { path: log.path, device: log.device, inode: log.inode },
    replacement: lstatSync(log.path, { bigint: true }),
    bytes: readFileSync(log.path, 'utf8'),
  });
  expect(() => {
    removeLog(log);
  }).toThrow();
  expect(readFileSync(log.path, 'utf8')).toBe('foreign');
});

it('snapshots the current physical generation and removes only that private inode', () => {
  const f = createFixture();
  expect(readGeneration(f.holdFile)).toBeUndefined();
  const log = reserveLog(f.holdFile);
  log.closeDescriptor();
  const generation = readGeneration(f.holdFile);
  expect(generation?.path).toBe(log.path);
  expect(generation?.device).toBe(log.device);
  expect(generation?.inode).toBe(log.inode);
  if (generation === undefined) throw new Error('physical generation absent');
  renameSync(log.path, log.path + '.old');
  writeFileSync(log.path, 'foreign', { mode: 0o600 });
  captureInput('residual-generation-replacement', {
    generation,
    current: lstatSync(log.path, { bigint: true }),
  });
  expect(() => {
    removeGeneration(generation);
  }).toThrow('replaced');
  expect(readFileSync(log.path, 'utf8')).toBe('foreign');
  rmSync(log.path);
  renameSync(log.path + '.old', log.path);
  removeGeneration(generation);
  removeGeneration(generation);
  expect(readGeneration(f.holdFile)).toBeUndefined();
});
it('refuses a nonprivate or linked generation snapshot', () => {
  const f = createFixture(),
    log = reserveLog(f.holdFile);
  log.closeDescriptor();
  chmodSync(log.path, 0o644);
  captureInput('residual-generation-mode', {
    path: log.path,
    physical: lstatSync(log.path, { bigint: true }),
  });
  expect(() => readGeneration(f.holdFile)).toThrow('owner-only');
  chmodSync(log.path, 0o600);
  renameSync(log.path, log.path + '.old');
  symlinkSync(log.path + '.old', log.path);
  captureInput('residual-generation-symlink', {
    path: log.path,
    link: lstatSync(log.path, { bigint: true }),
    target: lstatSync(log.path + '.old', { bigint: true }),
  });
  expect(() => readGeneration(f.holdFile)).toThrow();
});

it('distinguishes absent generation from unreadable trusted state', () => {
  const f = createFixture();
  expect(readGeneration(f.holdFile)).toBeUndefined();
  const log = reserveLog(f.holdFile);
  log.closeDescriptor();
  chmodSync(log.path, 0);
  try {
    expect(() => readGeneration(f.holdFile)).toThrow();
  } finally {
    chmodSync(log.path, 0o600);
  }
});
it('preserves generation validation and actual descriptor close failures together', () => {
  const f = createFixture();
  writeFileSync(f.holdFile + '.log', '', { mode: 0o644 });
  const program = [
    'import{mock}from"bun:test";',
    'const fs=await import("node:fs"),close=fs.closeSync;',
    'mock.module("node:fs",()=>({...fs,closeSync(descriptor){close(descriptor);throw new Error("controlled generation close failure");}}));',
    'const module=await import(' +
      JSON.stringify(new URL('./hold-log.ts', import.meta.url).href) +
      ');',
    'try{module.readGeneration(' +
      JSON.stringify(f.holdFile) +
      ');throw new Error("generation unexpectedly accepted");}catch(cause){const failures=cause instanceof AggregateError?cause.errors:[cause];process.stdout.write(JSON.stringify(failures.map(failure=>failure instanceof Error?failure.message:String(failure))));}',
  ].join(String.fromCharCode(10));
  captureInput('residual-generation-paired', { program });
  new Bun.Transpiler({ loader: 'ts' }).transformSync(program);
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    { cwd: f.root, stdout: 'pipe', stderr: 'pipe' },
  );
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(JSON.parse(child.stdout.toString())).toEqual([
    'hold log must be owner-only readable and writable',
    'controlled generation close failure',
  ]);
});

it('rejects nonregular generation state and a changed snapshot mode', () => {
  const f = createFixture();
  mkdirSync(f.holdFile + '.log', { mode: 0o700 });
  expect(() => readGeneration(f.holdFile)).toThrow('regular file');
  rmSync(f.holdFile + '.log', { recursive: true });
  const log = reserveLog(f.holdFile);
  log.closeDescriptor();
  const generation = readGeneration(f.holdFile);
  if (generation === undefined) throw new Error('generation absent');
  chmodSync(log.path, 0o644);
  expect(() => {
    removeGeneration(generation);
  }).toThrow('owner-only');
  expect(existsSync(log.path)).toBe(true);
});
for (const operation of ['read', 'remove'] as const)
  it('rejects another UID at the generation ' + operation + ' boundary', () => {
    const f = createFixture(),
      log = reserveLog(f.holdFile);
    log.closeDescriptor();
    const program = [
      'import{mock}from"bun:test";',
      'const fs=await import("node:fs"),fstat=fs.fstatSync,lstat=fs.lstatSync;',
      'mock.module("node:fs",()=>({...fs,fstatSync(descriptor,options){const stat=fstat(descriptor,options);return {...stat,isFile:stat.isFile.bind(stat),uid:stat.uid+1n};},lstatSync(path,options){const stat=lstat(path,options);return {...stat,isFile:stat.isFile.bind(stat),uid:stat.uid+1n};}}));',
      'const module=await import(' +
        JSON.stringify(new URL('./hold-log.ts', import.meta.url).href) +
        ');',
      operation === 'read'
        ? 'try{module.readGeneration(' +
          JSON.stringify(f.holdFile) +
          ');process.stdout.write(JSON.stringify({kind:"accepted"}));}catch(cause){process.stdout.write(JSON.stringify({kind:"refused",message:cause.message}));}'
        : 'const snapshot={path:' +
          JSON.stringify(log.path) +
          ',device:BigInt(' +
          JSON.stringify(log.device.toString()) +
          '),inode:BigInt(' +
          JSON.stringify(log.inode.toString()) +
          ')};try{module.removeGeneration(snapshot);process.stdout.write(JSON.stringify({kind:"accepted"}));}catch(cause){process.stdout.write(JSON.stringify({kind:"refused",message:cause.message}));}',
    ].join(String.fromCharCode(10));
    captureInput('residual-generation-uid-' + operation, {
      program,
      path: log.path,
      physical: lstatSync(log.path, { bigint: true }),
    });
    new Bun.Transpiler({ loader: 'ts' }).transformSync(program);
    const child = Bun.spawnSync(
      [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
      { cwd: f.root, stdout: 'pipe', stderr: 'pipe' },
    );
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(JSON.parse(child.stdout.toString())).toEqual({
      kind: 'refused',
      message: 'hold log must belong to the current user',
    });
    expect(existsSync(log.path)).toBe(true);
  });

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
it('refuses a private0600 nonregular generation before granting a snapshot', () => {
  const f = createFixture();
  mkdirSync(f.holdFile + '.log', { mode: 0o600 });
  const file = lstatSync(f.holdFile + '.log', { bigint: true });
  expect(file.mode & 0o777n).toBe(0o600n);
  captureInput('log-regular-input', {
    holdFile: f.holdFile,
    file,
    isDirectory: file.isDirectory(),
  });
  expect(() => readGeneration(f.holdFile)).toThrow('regular file');
});
it('refuses matching inherited outputs bound to another valid private named log', () => {
  const f = createFixture(),
    other = createFixture(),
    log = reserveLog(f.holdFile),
    peer = reserveLog(other.holdFile);
  try {
    expect(inspect(f, peer.descriptor, peer.descriptor, 'named-path').exitCode).toBe(70);
    expect(existsSync(f.record)).toBe(false);
  } finally {
    log.closeDescriptor();
    peer.closeDescriptor();
    removeLog(log);
    removeLog(peer);
  }
});
it('refuses the helper itself as controller despite otherwise matching valid reserved outputs', () => {
  const f = createFixture(),
    log = reserveLog(f.holdFile);
  try {
    expect(inspect(f, log.descriptor, log.descriptor, 'self').exitCode).toBe(70);
    expect(existsSync(f.record)).toBe(false);
  } finally {
    log.closeDescriptor();
    removeLog(log);
  }
});

it('does not grant removal authority while the reserved native log descriptor remains open', () => {
  const f = createFixture(),
    log = reserveLog(f.holdFile);
  captureInput('log-open-authority-input', {
    path: log.path,
    device: log.device,
    inode: log.inode,
    descriptor: log.descriptor,
  });
  try {
    expect(() => {
      removeLog(log);
    }).toThrow('still open');
    expect(existsSync(log.path)).toBe(true);
  } finally {
    log.closeDescriptor();
    removeLog(log);
  }
});
it('repeated log close leaves an actually recycled descriptor writable', () => {
  const f = createFixture();
  const program = [
    'const fs=await import("node:fs"),module=await import(' +
      JSON.stringify(new URL('./hold-log.ts', import.meta.url).href) +
      ');',
    'const log=module.reserveLog(' +
      JSON.stringify(f.holdFile) +
      '),descriptor=log.descriptor;log.closeDescriptor();const sibling=fs.openSync(' +
      JSON.stringify(join(f.root, 'recycled')) +
      ',"wx",0o600);if(sibling!==descriptor)throw new Error("native descriptor was not recycled");log.closeDescriptor();let writer;try{fs.writeFileSync(sibling,"retained");writer="written";fs.closeSync(sibling);}catch(cause){if(cause.code!=="EBADF")throw cause;writer="closed";}module.removeLog(log);process.stdout.write(JSON.stringify({writer}));',
  ].join('\n');
  new Bun.Transpiler({ loader: 'ts' }).transformSync(program);
  captureInput('log-recycled-input', { program });
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    { cwd: f.root, stdout: 'pipe', stderr: 'pipe', timeout: 3000 },
  );
  captureInput('log-recycled-output', {
    exitCode: child.exitCode,
    stdout: child.stdout.toString(),
    stderr: child.stderr.toString(),
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(JSON.parse(child.stdout.toString())).toEqual({ writer: 'written' });
});
it('keeps reported actual log close failure from granting closed generation authority', () => {
  const f = createFixture();
  const program = [
    'import{mock}from"bun:test";const fs=await import("node:fs"),close=fs.closeSync;',
    'await mock.module("node:fs",()=>({...fs,closeSync(descriptor){close(descriptor);throw new Error("controlled reported log close failure");}}));',
    'const module=await import(' +
      JSON.stringify(new URL('./hold-log.ts', import.meta.url).href) +
      '),log=module.reserveLog(' +
      JSON.stringify(f.holdFile) +
      ');let closeFailure;try{log.closeDescriptor();}catch(cause){closeFailure=cause.message;}let authority;try{module.verifyLog(log);authority="granted";}catch(cause){authority=cause.message;}process.stdout.write(JSON.stringify({closeFailure,authority}));',
  ].join('\n');
  new Bun.Transpiler({ loader: 'ts' }).transformSync(program);
  captureInput('log-failed-close-input', { program });
  const child = Bun.spawnSync(
    [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
    { cwd: f.root, stdout: 'pipe', stderr: 'pipe', timeout: 3000 },
  );
  captureInput('log-failed-close-output', {
    exitCode: child.exitCode,
    stdout: child.stdout.toString(),
    stderr: child.stderr.toString(),
  });
  expect(child.exitCode, child.stderr.toString()).toBe(0);
  expect(JSON.parse(child.stdout.toString())).toEqual({
    closeFailure: 'controlled reported log close failure',
    authority: 'controlled reported log close failure',
  });
});

it('refuses to export a closed log descriptor after the same number names another physical file', () => {
  const f = createFixture(),
    log = reserveLog(f.holdFile),
    original = log.descriptor;
  log.closeDescriptor();
  const sibling = openSync(join(f.root, 'export-sibling'), 'wx', 0o600);
  try {
    expect(sibling).toBe(original);
    captureInput('log-closed-export-input', {
      log: { path: log.path, device: log.device, inode: log.inode },
      original,
      sibling,
      file: fstatSync(sibling, { bigint: true }),
    });
    expect(() => log.descriptor).toThrow('not open');
  } finally {
    closeSync(sibling);
    removeLog(log);
  }
});

it('refuses original closed log verification after its pathname names another private inode', () => {
  const f = createFixture(),
    log = reserveLog(f.holdFile);
  log.closeDescriptor();
  renameSync(log.path, log.path + '.original');
  writeFileSync(log.path, 'foreign opaque diagnostics', { mode: 0o600 });
  captureInput('log-verify-replacement-input', {
    log: { path: log.path, device: log.device, inode: log.inode },
    replacement: lstatSync(log.path, { bigint: true }),
    bytes: readFileSync(log.path, 'utf8'),
  });
  expect(() => {
    verifyLog(log);
  }).toThrow('replaced');
});

for (const shape of ['relative', 'nonnormalized'] as const)
  it('residual reserveLog rejects its own ' + shape + ' pathname', () => {
    const f = createFixture(),
      path = shape === 'relative' ? 'hold' : f.root + '/nested/../hold';
    mkdirSync(join(f.root, 'nested'));
    const program =
      'const module=await import(' +
      JSON.stringify(new URL('./hold-log.ts', import.meta.url).href) +
      ');let kind;try{const log=module.reserveLog(' +
      JSON.stringify(path) +
      ');log.closeDescriptor();kind="reserved";}catch(cause){kind="refused";}process.stdout.write(kind);';
    captureInput('residual-reservation-' + shape, { program, path });
    const child = Bun.spawnSync(
      [process.execPath, '--no-env-file', '--config=/dev/null', '--eval', program],
      { cwd: f.root, stdout: 'pipe', stderr: 'pipe' },
    );
    expect(child.exitCode, child.stderr.toString()).toBe(0);
    expect(child.stdout.toString()).toBe('refused');
  });
it('residual reserveLog cannot reserve another existing valid private generation', () => {
  const f = createFixture(),
    log = reserveLog(f.holdFile);
  log.closeDescriptor();
  captureInput('residual-reservation-existing', {
    path: log.path,
    physical: lstatSync(log.path, { bigint: true }),
  });
  expect(() => {
    const duplicate = reserveLog(f.holdFile);
    duplicate.closeDescriptor();
  }).toThrow();
});
