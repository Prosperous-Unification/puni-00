import * as fs from 'node:fs';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hashBytes, hashCanonical, serializeCanonical } from '@twilight-burokrat/judge';
import { afterEach, expect, spyOn, test } from 'bun:test';

import { readReviewRuntime } from './review-runtime';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'review-runtime-'));
  roots.push(root);
  const runtimeRoot = join(root, 'runtime');
  const candidateRoot = join(root, 'candidate');
  mkdirSync(runtimeRoot);
  mkdirSync(candidateRoot);
  const files = [
    {
      path: 'parser.js',
      role: 'program',
      identity: hashBytes(Buffer.from('parser')),
      byteLength: 6,
    },
    {
      path: 'typescript.js',
      role: 'dependency',
      identity: hashBytes(Buffer.from('compiler')),
      byteLength: 8,
    },
  ];
  writeFileSync(join(runtimeRoot, 'parser.js'), 'parser');
  writeFileSync(join(runtimeRoot, 'typescript.js'), 'compiler');
  const closure = {
    schemaVersion: 1,
    kind: 'review-runtime-closure',
    parserProgramIdentity: files[0].identity,
    compilerHostIdentity: 'a'.repeat(64),
    resolutionPolicyIdentity: 'b'.repeat(64),
    files,
  };
  const limits = {
    maximumManifestBytes: 4096,
    maximumEntries: 8,
    maximumPathBytes: 128,
    maximumReads: 32,
    maximumBytes: 4096,
    maximumProbes: 128,
    maximumReadBytes: 4096,
    maximumOwnedBytes: 4096,
  };
  return {
    root,
    closure,
    input: {
      runtimeRoot,
      candidateRoot,
      closureBytes: Buffer.from(serializeCanonical(closure)),
      runtimeClosureIdentity: hashCanonical(closure),
      limits,
    },
  };
}
function capture(change: (closure: ReturnType<typeof fixture>['closure']) => void) {
  const f = fixture();
  change(f.closure);
  f.input.closureBytes = Buffer.from(serializeCanonical(f.closure));
  f.input.runtimeClosureIdentity = hashCanonical(f.closure);
  return f.input;
}
test('owns complete exact bytes despite caller and ambient mutation', () => {
  const { input } = fixture();
  const runtime = readReviewRuntime(input);
  expect(runtime.closure.files).toHaveLength(2);
  const entry = runtime.closure.files[0];
  const bytes = runtime.readFile(entry);
  bytes.fill(0);
  input.closureBytes.fill(0);
  input.limits.maximumBytes = 1;
  rmSync(input.runtimeRoot, { recursive: true });
  expect(() => runtime.readFile(entry)).not.toThrow();
  expect(Buffer.from(runtime.readFile(entry)).toString()).toBe('parser');
  expect(Object.isFrozen(runtime)).toBe(true);
  expect(Object.isFrozen(runtime.closure)).toBe(true);
  expect(Object.isFrozen(runtime.closure.files)).toBe(true);
  expect(Object.isFrozen(runtime.closure.files[0])).toBe(true);
  expect(() => runtime.readFile({ ...entry, role: 'dependency' })).toThrow('tuple');
  expect(() => runtime.readFile({ ...entry, path: 'foreign.js' })).toThrow('tuple');
  expect(() => runtime.readFile({ ...entry, identity: 'f'.repeat(64) })).toThrow('tuple');
  expect(() => runtime.readFile({ ...entry, byteLength: 5 })).toThrow('tuple');
});
test('requires the independent exact canonical pin', () => {
  const { input } = fixture();
  expect(() => readReviewRuntime({ ...input, runtimeClosureIdentity: 'f'.repeat(64) })).toThrow(
    'identity',
  );
});
test('rejects closed schema, noncanonical paths, duplicate and unordered paths', () => {
  for (const change of [
    (c: ReturnType<typeof fixture>['closure']) => Object.assign(c, { foreign: 1 }),
    (c: ReturnType<typeof fixture>['closure']) => Object.assign(c.files[0], { foreign: 1 }),
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files[0].path = '../parser.js';
    },
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files[0].path = 'a//parser.js';
    },
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files[1].path = c.files[0].path;
    },
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files.reverse();
    },
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files[0].role = 'foreign';
    },
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files[0].byteLength = -1;
    },
  ])
    expect(() => readReviewRuntime(capture(change))).toThrow();
});
test('rejects absent, unreadable, changed and wrong-length files', () => {
  for (const fault of ['absent', 'unreadable', 'changed', 'length']) {
    const { input } = fixture();
    const path = join(input.runtimeRoot, 'parser.js');
    if (fault === 'absent') rmSync(path);
    if (fault === 'unreadable') chmodSync(path, 0);
    if (fault === 'changed') writeFileSync(path, 'edited');
    if (fault === 'length') writeFileSync(path, 'longer parser');
    expect(() => readReviewRuntime(input)).toThrow(
      fault === 'absent' ? 'absent' : fault === 'unreadable' ? 'unreadable' : 'identity or length',
    );
  }
});
test('rejects leaf and ancestor symlinks and candidate overlap', () => {
  const { input, root } = fixture();
  const leaf = join(input.runtimeRoot, 'parser.js');
  rmSync(leaf);
  writeFileSync(join(root, 'outside'), 'parser');
  symlinkSync(join(root, 'outside'), leaf);
  expect(() => readReviewRuntime(input)).toThrow();
  rmSync(leaf);
  writeFileSync(leaf, 'parser');
  symlinkSync(input.runtimeRoot, join(root, 'alias'));
  expect(() => readReviewRuntime({ ...input, runtimeRoot: join(root, 'alias') })).toThrow();
  expect(() => readReviewRuntime({ ...input, candidateRoot: input.runtimeRoot })).toThrow(
    'overlap',
  );
  expect(() => readReviewRuntime({ ...input, candidateRoot: root })).toThrow('overlap');
});
test('bounds admission and subsequent copy allocations and reads', () => {
  for (const key of [
    'maximumManifestBytes',
    'maximumEntries',
    'maximumPathBytes',
    'maximumReads',
    'maximumBytes',
    'maximumProbes',
    'maximumReadBytes',
    'maximumOwnedBytes',
  ] as const) {
    const { input } = fixture();
    expect(() => readReviewRuntime({ ...input, limits: { ...input.limits, [key]: 1 } })).toThrow(
      'ceiling',
    );
    expect(() => readReviewRuntime({ ...input, limits: { ...input.limits, [key]: NaN } })).toThrow(
      'positive safe integer',
    );
  }
  const { input } = fixture();
  const runtime = readReviewRuntime({ ...input, limits: { ...input.limits, maximumReads: 4 } });
  expect(() => runtime.readFile(runtime.closure.files[0])).toThrow('read ceiling');
  const owned = readReviewRuntime({ ...input, limits: { ...input.limits, maximumBytes: 16 } });
  expect(() => owned.readFile(owned.closure.files[0])).toThrow('byte ceiling');
});

test('rejects empty inventories, program-free inventories and noncanonical serialized bytes', () => {
  expect(() =>
    readReviewRuntime(
      capture((c) => {
        c.files.length = 0;
      }),
    ),
  ).toThrow('program');
  expect(() =>
    readReviewRuntime(
      capture((c) => {
        for (const file of c.files) file.role = 'dependency';
      }),
    ),
  ).toThrow('program');
  const { input, closure } = fixture();
  const bytes = Buffer.from(JSON.stringify(closure));
  expect(() =>
    readReviewRuntime({ ...input, closureBytes: bytes, runtimeClosureIdentity: hashBytes(bytes) }),
  ).toThrow('canonical');
});
test('copied methods grant no authority and unlisted installed files stay unreachable', () => {
  const { input } = fixture();
  writeFileSync(join(input.runtimeRoot, 'extra.js'), 'unlisted');
  const runtime = readReviewRuntime(input);
  expect(() => ({ ...runtime }).readFile(runtime.closure.files[0])).toThrow('capability');
  expect(() =>
    runtime.readFile({
      path: 'extra.js',
      role: 'dependency',
      identity: hashBytes(Buffer.from('unlisted')),
      byteLength: 8,
    }),
  ).toThrow('tuple');
});

test('rejects unsafe lengths, path prefix conflicts and noncanonical root aliases', () => {
  expect(() =>
    readReviewRuntime(
      capture((c) => {
        c.files[0].byteLength = Number.MAX_SAFE_INTEGER + 1;
      }),
    ),
  ).toThrow('length');
  expect(() =>
    readReviewRuntime(
      capture((c) => {
        c.files[0].path = 'a';
        c.files[1].path = 'a/b';
      }),
    ),
  ).toThrow('paths');
  const { input } = fixture();
  expect(() =>
    readReviewRuntime({ ...input, runtimeRoot: input.runtimeRoot + '/../runtime' }),
  ).toThrow('root');
});

test('manifest refusals precede all bootstrap filesystem probes', () => {
  for (const change of [
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files[0].path = '../parser.js';
    },
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files[0].path = 'a//parser.js';
    },
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files[0].path = 'a\\parser.js';
    },
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files[0].path = 'a\0parser.js';
    },
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files[0].path = '\ud800';
    },
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files[0].path = 'x'.repeat(150);
      c.files[1].path = 'z';
    },
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files[1].path = c.files[0].path;
    },
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files.reverse();
    },
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files[0].path = 'a';
      c.files[1].path = 'a/b';
    },
    (c: ReturnType<typeof fixture>['closure']) => {
      c.files[0].byteLength = Number.MAX_SAFE_INTEGER + 1;
    },
  ]) {
    const input = capture(change);
    const open = spyOn(fs, 'openSync');
    const realpath = spyOn(fs, 'realpathSync');
    try {
      expect(() => readReviewRuntime(input)).toThrow();
      expect(open).not.toHaveBeenCalled();
      expect(realpath).not.toHaveBeenCalled();
    } finally {
      open.mockRestore();
      realpath.mockRestore();
    }
  }
});
test('wrong-length files refuse before allocating or reading their content', () => {
  const { input } = fixture();
  writeFileSync(join(input.runtimeRoot, 'parser.js'), 'longer parser');
  const alloc = spyOn(Buffer, 'alloc');
  const read = spyOn(fs, 'readSync');
  try {
    expect(() => readReviewRuntime(input)).toThrow('identity or length');
    expect(alloc).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  } finally {
    alloc.mockRestore();
    read.mockRestore();
  }
});
test('read failure preserves a simultaneous cleanup failure', () => {
  const { input } = fixture();
  const readFailure = new Error('injected read');
  const closeFailure = new Error('injected close');
  const close = fs.closeSync;
  let injected = false;
  const read = spyOn(fs, 'readSync').mockImplementation(() => {
    throw readFailure;
  });
  const cleanup = spyOn(fs, 'closeSync').mockImplementation((fd) => {
    close(fd);
    if (!injected) {
      injected = true;
      throw closeFailure;
    }
  });
  try {
    let failure: unknown;
    try {
      readReviewRuntime(input);
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error('aggregate absent');
    expect(failure.errors).toEqual([readFailure, closeFailure]);
  } finally {
    read.mockRestore();
    cleanup.mockRestore();
  }
});
test('capture detects a same-byte file mutation during the bounded read', () => {
  const { input } = fixture();
  const read = fs.readSync;
  let changed = false;
  const probe = spyOn(fs, 'readSync').mockImplementation(
    (...args: Parameters<typeof fs.readSync>) => {
      const count = read(...args);
      if (!changed) {
        changed = true;
        chmodSync(join(input.runtimeRoot, 'parser.js'), 0o600);
      }
      return count;
    },
  );
  try {
    expect(() => readReviewRuntime(input)).toThrow('identity or length');
  } finally {
    probe.mockRestore();
  }
});

test('non-regular files refuse before allocating their content', () => {
  const f = fixture();
  const path = join(f.input.runtimeRoot, 'parser.js');
  rmSync(path);
  mkdirSync(path);
  f.closure.files[0].byteLength = fs.statSync(path).size;
  f.input.closureBytes = Buffer.from(serializeCanonical(f.closure));
  f.input.runtimeClosureIdentity = hashCanonical(f.closure);
  f.input.limits.maximumOwnedBytes = 16384;
  f.input.limits.maximumBytes = 16384;
  const alloc = spyOn(Buffer, 'alloc');
  try {
    expect(() => readReviewRuntime(f.input)).toThrow('unreadable');
    expect(alloc).not.toHaveBeenCalled();
  } finally {
    alloc.mockRestore();
  }
});
test('a FIFO refuses without waiting for a writer', async () => {
  const { input } = fixture();
  const path = join(input.runtimeRoot, 'parser.js');
  rmSync(path);
  const fifo = Bun.spawnSync(['mkfifo', path]);
  expect(fifo.exitCode).toBe(0);
  const child = Bun.spawn(
    [
      'bun',
      '-e',
      `import { readReviewRuntime } from './apps/twilight-structure/twilight-dash/cli/src/activation/review-runtime.ts'; const input = JSON.parse(process.argv[1]); input.closureBytes = Uint8Array.from(input.closureBytes); try { readReviewRuntime(input); process.exit(3); } catch { process.exit(2); }`,
      JSON.stringify({ ...input, closureBytes: [...input.closureBytes] }),
    ],
    { stdout: 'ignore', stderr: 'pipe' },
  );
  let expired = false;
  const deadline = setTimeout(() => {
    expired = true;
    child.kill(9);
  }, 3000);
  try {
    expect(await child.exited).toBe(2);
    expect(expired).toBe(false);
  } finally {
    clearTimeout(deadline);
    child.kill(9);
    await child.exited;
  }
});

test('nonadjacent file ancestors refuse before bootstrap IO', () => {
  const input = capture((c) => {
    const third = { ...c.files[1] };
    c.files[0].path = 'a';
    c.files[1].path = 'a-b';
    third.path = 'a/b';
    c.files.push(third);
  });
  const probe = spyOn(fs, 'realpathSync');
  try {
    expect(() => readReviewRuntime(input)).toThrow('ancestor');
    expect(probe).not.toHaveBeenCalled();
  } finally {
    probe.mockRestore();
  }
});
test('root path bound applies independently from virtual file paths', () => {
  const { input } = fixture();
  expect(() =>
    readReviewRuntime({ ...input, limits: { ...input.limits, maximumPathBytes: 20 } }),
  ).toThrow('root path ceiling');
});
test('copy reads have a distinct lifetime returned-byte bound', () => {
  const { input } = fixture();
  const runtime = readReviewRuntime({
    ...input,
    limits: { ...input.limits, maximumReadBytes: 20 },
  });
  const entry = runtime.closure.files[0];
  expect(runtime.readFile(entry).length).toBe(6);
  expect(() => runtime.readFile(entry)).toThrow('read byte ceiling');
});
test('literal canonical manifest vector pins LF and raw file identities', () => {
  const { input } = fixture();
  expect(input.closureBytes[input.closureBytes.length - 1]).toBe(10);
  expect(readReviewRuntime(input).runtimeClosureIdentity).toBe(
    'a7d7265d46270b8b68a03beebcf7a6d2446a445ed78caddf4abd618088a32156',
  );
});

test('an unexpected undefined read failure cannot publish a partial capability', () => {
  const { input } = fixture();
  const read = spyOn(fs, 'readSync').mockImplementation(() => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- Inject an unexpected read-boundary failure.
    throw undefined;
  });
  try {
    let failed = false;
    try {
      readReviewRuntime(input);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  } finally {
    read.mockRestore();
  }
});

test('snapshots a caller tuple before joining owned content', () => {
  const { input } = fixture();
  const runtime = readReviewRuntime(input);
  const parser = runtime.closure.files[0];
  let pathReads = 0;
  const tuple = {
    ...parser,
    get path() {
      pathReads += 1;
      return pathReads === 1 ? 'parser.js' : 'typescript.js';
    },
  };
  expect(Buffer.from(runtime.readFile(tuple)).toString()).toBe('parser');
  expect(pathReads).toBe(1);
});

test('rejects invalid raw UTF-8 before any bootstrap filesystem probe', () => {
  const { input } = fixture();
  const bytes = Buffer.from(input.closureBytes);
  const offset = bytes.indexOf('typescript.js');
  expect(offset).toBeGreaterThan(0);
  bytes[offset] = 255;
  const probe = spyOn(fs, 'realpathSync');
  try {
    expect(() =>
      readReviewRuntime({
        ...input,
        closureBytes: bytes,
        runtimeClosureIdentity: hashBytes(bytes),
      }),
    ).toThrow();
    expect(probe).not.toHaveBeenCalled();
  } finally {
    probe.mockRestore();
  }
});
