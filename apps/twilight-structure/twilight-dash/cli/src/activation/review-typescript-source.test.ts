import * as fs from 'node:fs';

import { hashBytes, serializeCanonical } from '@twilight-burokrat/judge';
import { spyOn } from 'bun:test';
import { expect, test } from 'bun:test';
import ts from 'typescript';

import * as namespaceModule from './review-namespace';
import { createRetainedNamespace } from './review-namespace';
import { readRetainedFileIdentity } from './review-selection-objects';
import {
  createRetainedTypeScriptSource,
  readRetainedTypeScriptSourceProvenance,
  sealRetainedTypeScriptReads,
} from './review-typescript-source';
import { fixture } from './review-typescript-source.test.fixture';

const root = '/__puni_review__/candidate';
const namespaceLimits = {
  maximumEntries: 100,
  maximumNodes: 100,
  maximumPathBytes: 1024,
  maximumTotalPathBytes: 10000,
};
const limits = {
  maximumNodes: 100,
  maximumProbes: 10000,
  maximumSteps: 10000,
  maximumReads: 100,
  maximumReadBytes: 10000,
  maximumReadEntries: 100,
  maximumReadLedgerBytes: 100000,
  maximumPathBytes: 1024,
  maximumTargetBytes: 1024,
  maximumExpandedPathBytes: 4096,
  maximumLinkExpansions: 20,
  maximumDirectoryDepth: 30,
  maximumPatterns: 200,
  maximumPatternBytes: 4096,
  maximumEnumeratedEntries: 1000,
  maximumReturnedPathBytes: 10000,
};
function setup(overrides = {}) {
  const f = fixture();
  const namespace = createRetainedNamespace(f.candidate, f.runtime, namespaceLimits);
  return {
    ...f,
    namespace,
    source: createRetainedTypeScriptSource(namespace, f.candidate, f.runtime, {
      ...limits,
      ...overrides,
    }),
  };
}

test('owned file identity authenticates tuple without consuming candidate reads', () => {
  const f = setup();
  const tuple = f.candidate.snapshot.entries.find((e) => e.path === 'a.ts');
  if (!tuple) throw new Error('fixture absent');
  const identity = readRetainedFileIdentity(f.candidate, tuple.path, tuple.blob);
  expect(identity).toEqual({ rawIdentity: hashBytes('export {};'), byteLength: 10 });
  expect(Object.isFrozen(identity)).toBe(true);
  expect(() => readRetainedFileIdentity({ ...f.candidate }, tuple.path, tuple.blob)).toThrow(
    'owned retained candidate',
  );
  expect(() => readRetainedFileIdentity(f.candidate, tuple.path, '0'.repeat(40))).toThrow('tuple');
  expect(() => readRetainedFileIdentity(f.candidate, 'absent', tuple.blob)).toThrow('tuple');
});

test('source owners precede census and provenance joins candidate and runtime', () => {
  const f = setup();
  const poison = {
    ...f.namespace,
    get nodes() {
      throw new Error('census touched');
    },
  };
  expect(() => createRetainedTypeScriptSource(poison, f.candidate, f.runtime, limits)).toThrow(
    'owned retained namespace',
  );
  expect(() =>
    createRetainedTypeScriptSource(f.namespace, { ...f.candidate }, f.runtime, limits),
  ).toThrow('owned retained candidate');
  expect(() =>
    createRetainedTypeScriptSource(f.namespace, f.candidate, { ...f.runtime }, limits),
  ).toThrow('owned review runtime');
  const foreign = fixture('sha1', undefined, { 'different.ts': 'foreign' }, {});
  expect(() =>
    createRetainedTypeScriptSource(f.namespace, foreign.candidate, f.runtime, limits),
  ).toThrow('identity differs');
  expect(() => readRetainedTypeScriptSourceProvenance({ ...f.source })).toThrow(
    'owned retained TypeScript',
  );
  expect(Object.isFrozen(f.source)).toBe(true);
  expect(Object.isFrozen(readRetainedTypeScriptSourceProvenance(f.source))).toBe(true);
  expect(readRetainedTypeScriptSourceProvenance(f.source).runtimeTrust).toBe('unverified');
  expect(f.source.compilerLibraryDirectory).toBe(root + '/node_modules/typescript/lib');
  expect(f.source.useCaseSensitiveFileNames).toBe(true);
  expect(f.source.getCurrentDirectory()).toBe(root);
});

test('reserves raw candidate and runtime bytes before any copy', () => {
  const f = setup({ maximumReadBytes: 9 });
  expect(() => f.source.readFile(root + '/a.ts')).toThrow('source read byte ceiling');
  const exact = setup({ maximumReadBytes: 10, maximumReads: 1 });
  expect(exact.source.readFile(root + '/a.ts')).toBe('export {};');
  expect(() => exact.source.readFile(root + '/a.ts')).toThrow('source read ceiling');
  const runtime = setup({ maximumReadBytes: 1 });
  expect(runtime.source.readFile(root + '/node_modules/pkg/index.d.ts')).toBe('x');
  expect(() => runtime.source.readFile(root + '/node_modules/pkg/index.d.ts')).toThrow(
    'source read byte ceiling',
  );
});

function fromPaths(
  files: Record<string, string | Uint8Array>,
  links: Record<string, string> = {},
  overrides = {},
) {
  const f = fixture('sha1', undefined, files, links);
  const namespace = createRetainedNamespace(f.candidate, f.runtime, namespaceLimits);
  return {
    ...f,
    source: createRetainedTypeScriptSource(namespace, f.candidate, f.runtime, {
      ...limits,
      ...overrides,
    }),
  };
}

test('component walk resolves owned links and preserves file ancestor semantics', () => {
  const f = fromPaths(
    { 'dir/a.ts': '\uFEFFexport {};', plain: 'x', '\uFEFFtarget': 'bom' },
    {
      alias: 'dir',
      chained: 'alias/a.ts',
      bom: '\uFEFFtarget',
      'aliases/link': '../dir',
      escape: 'aliases/link/../../dir/a.ts',
      runtime: 'node_modules/pkg',
      cycle: 'cycle',
      bad: 'plain/../dir/a.ts',
      absent: 'missing/../dir/a.ts',
    },
  );
  expect(f.source.pathKind(root + '/alias')).toBe('directory');
  expect(f.source.readFile(root + '/chained')).toBe('export {};');
  expect(f.source.realpath(root + '/alias/a.ts')).toBe(root + '/dir/a.ts');
  expect(f.source.readFile(root + '/bom')).toBe('bom');
  expect(f.source.pathKind(root + '/missing')).toBe('absent');
  expect(f.source.readFile(root + '/missing')).toBeUndefined();
  expect(f.source.readFile(root)).toBeUndefined();
  expect(f.source.realpath(root + '/missing')).toBe(root + '/missing');
  expect(() => f.source.pathKind(root + '/plain/../dir')).toThrow('not a directory');
  expect(() => f.source.pathKind(root + '/bad')).toThrow('not a directory');
  expect(f.source.pathKind(root + '/absent')).toBe('absent');
  expect(() => f.source.pathKind(root + '/escape')).toThrow('escapes');
  expect(() => f.source.pathKind(root + '/runtime')).toThrow('symlink target invalid');
  expect(() => f.source.pathKind(root + '/cycle')).toThrow('cycle');
});

test.each([
  '/etc/passwd',
  '/__puni_review__/candidate-x/a',
  root + '/../outside',
  root + '/a\\b',
  root + '/a\0b',
  root + '/a//b',
  root + '/\uD800',
])('direct malformed or outside query refuses before reads: %s', (path) => {
  const f = setup({ maximumReads: 1 });
  expect(() => f.source.pathKind(path)).toThrow();
  expect(() => f.source.readFile(path)).toThrow();
  expect(() => f.source.realpath(path)).toThrow();
  expect(f.source.readFile(root + '/a.ts')).toBe('export {};');
});

test('fatal UTF8 for files and exact BOM link target bytes', () => {
  const f = fixture(
    'sha1',
    undefined,
    { target: 'valid' },
    { link: 'target' },
    Uint8Array.from([255]),
  );
  const namespace = createRetainedNamespace(f.candidate, f.runtime, namespaceLimits);
  const source = createRetainedTypeScriptSource(namespace, f.candidate, f.runtime, limits);
  expect(() => source.readFile(root + '/node_modules/pkg/index.d.ts')).toThrow();
  expect(source.readFile(root + '/link')).toBe('valid');
});

test.each(Object.keys(limits))('explicit positive finite source ceiling required: %s', (key) => {
  const f = setup();
  for (const value of [undefined, 0, NaN, Infinity, 1.5]) {
    expect(() =>
      createRetainedTypeScriptSource(f.namespace, f.candidate, f.runtime, {
        ...limits,
        [key]: value,
      }),
    ).toThrow('positive safe integer');
  }
});

test('lifetime probes steps path targets expansions and depth are bounded', () => {
  const probe = setup({ maximumProbes: 1 });
  probe.source.pathKind(root);
  expect(() => probe.source.pathKind(root)).toThrow('source probe ceiling');
  const step = setup({ maximumSteps: 1 });
  expect(() => step.source.pathKind(root + '/src/b.ts')).toThrow('source step ceiling');
  const path = setup({ maximumPathBytes: root.length + 2 });
  expect(() => path.source.pathKind(root + '/a.ts')).toThrow('source path ceiling');
  const target = fromPaths({ abc: 'x' }, { link: 'abc' }, { maximumTargetBytes: 2 });
  expect(() => target.source.pathKind(root + '/link')).toThrow('source target ceiling');
  const expanded = fromPaths({ 'long/a': 'x' }, { l: 'long/a' }, { maximumExpandedPathBytes: 4 });
  expect(() => expanded.source.pathKind(root + '/l')).toThrow('source expanded path ceiling');
  const link = fromPaths({ a: 'x' }, { l: 'm', m: 'a' }, { maximumLinkExpansions: 1 });
  expect(() => link.source.pathKind(root + '/l')).toThrow('source link ceiling');
  const depth = setup({ maximumDirectoryDepth: 1 });
  expect(() => depth.source.pathKind(root + '/src/b.ts')).toThrow('source directory depth ceiling');
  expect(() => setup({ maximumNodes: 1 })).toThrow('source node ceiling');
});

test('getDirectories returns installed sys immediate basenames including directory aliases', () => {
  const f = fromPaths(
    { 'src/a.ts': 'a', 'src/nested/b.ts': 'b', 'other/c.ts': 'c' },
    { alias: 'src' },
  );
  fs.rmSync(f.sourceRepository + '/.git', { recursive: true });
  expect(ts.sys.getDirectories(f.sourceRepository)).toEqual(['alias', 'other', 'src']);
  expect(f.source.getDirectories(root)).toEqual(['alias', 'node_modules', 'other', 'src']);
  expect(f.source.getDirectories(root + '/alias')).toEqual(['nested']);
  expect(f.source.getDirectories(root + '/missing')).toEqual([]);
});

test('readDirectory matches installed sys extensions includes excludes depth and ordering', () => {
  const f = fromPaths(
    {
      'src/a.ts': 'a',
      'src/nested/b.ts': 'b',
      'src/.hidden.ts': 'h',
      'src/c.js': 'c',
      'other/d.ts': 'd',
      'z.ts': 'z',
    },
    { alias: 'src' },
  );
  fs.rmSync(f.sourceRepository + '/.git', { recursive: true });
  const vectors: [
    readonly string[] | undefined,
    readonly string[] | undefined,
    readonly string[] | undefined,
    number | undefined,
  ][] = [
    [undefined, undefined, undefined, undefined],
    [['.ts'], undefined, ['**/*'], undefined],
    [['.ts'], ['**/nested/**'], ['src/**/*'], undefined],
    [['.js', '.ts'], undefined, ['src/**/*', 'other/**/*'], 1],
    [['.ts'], undefined, ['other/**/*', 'src/**/*'], 2],
    [['.ts'], undefined, [], undefined],
    [['.ts'], ['**/.*'], ['**/*'], 3],
  ];
  for (const [extensions, exclude, include, depth] of vectors) {
    const expected = ts.sys
      .readDirectory(f.sourceRepository, extensions, exclude, include, depth)
      .map((path) => path.replace(f.sourceRepository, root));
    const actual = f.source
      .readDirectory(root, extensions, exclude, include, depth)
      .filter((path) => !path.includes('/node_modules/'));
    expect(actual).toEqual(expected);
  }
  expect(f.source.readDirectory(root + '/missing')).toEqual([]);
  expect(f.source.readDirectory(root + '/z.ts')).toEqual([]);
});

test('enumeration patterns entries and path outputs have finite explicit budgets', () => {
  const patterns = setup({ maximumPatterns: 1 });
  expect(() => patterns.source.readDirectory(root, ['.ts'], [], ['**/*'])).toThrow(
    'source pattern count ceiling',
  );
  const bytes = setup({ maximumPatternBytes: 2 });
  expect(() => bytes.source.readDirectory(root, ['.ts'])).toThrow('source pattern byte ceiling');
  const entries = setup({ maximumEnumeratedEntries: 1 });
  expect(() => entries.source.getDirectories(root)).toThrow('source enumeration ceiling');
  const output = setup({ maximumReturnedPathBytes: 1 });
  expect(() => output.source.readDirectory(root)).toThrow('source returned path ceiling');
  const realpath = setup({ maximumReturnedPathBytes: 1 });
  expect(() => realpath.source.realpath(root)).toThrow('source returned path ceiling');
  const f = setup();
  expect(() =>
    f.source.readDirectory(root, undefined, undefined, ['../../outside/**/*']),
  ).toThrow();
  expect(() => f.source.readDirectory(root, undefined, undefined, undefined, 0)).toThrow(
    'source enumeration depth',
  );
});

test('all direct methods survive removed roots and intercepted ambient ports', () => {
  const f = setup();
  for (const path of [f.sourceRepository, f.storeBase, f.runtimeRoot])
    fs.rmSync(path, { recursive: true });
  const traps = [
    spyOn(fs, 'readFileSync'),
    spyOn(fs, 'openSync'),
    spyOn(fs, 'readdirSync'),
    spyOn(fs, 'statSync'),
    spyOn(fs, 'lstatSync'),
    spyOn(fs, 'realpathSync'),
    spyOn(Bun, 'spawnSync'),
    spyOn(process, 'cwd'),
    spyOn(ts.sys, 'readFile'),
    spyOn(ts.sys, 'readDirectory'),
    spyOn(ts.sys, 'getDirectories'),
    spyOn(ts.sys, 'realpath'),
  ];
  const original = process.env['GIT_OBJECT_DIRECTORY'];
  try {
    for (const trap of traps)
      trap.mockImplementation(() => {
        throw new Error('ambient forbidden');
      });
    process.env['GIT_OBJECT_DIRECTORY'] = '/forbidden';
    for (const method of [
      () => fs.readFileSync('x'),
      () => fs.openSync('x', 'r'),
      () => fs.readdirSync('x'),
      () => fs.statSync('x'),
      () => fs.lstatSync('x'),
      () => fs.realpathSync('x'),
      () => ts.sys.getDirectories('x'),
      () => {
        if (ts.sys.realpath === undefined) throw new Error('test realpath absent');
        return ts.sys.realpath('x');
      },
      () => ts.sys.readFile('x'),
      () => ts.sys.readDirectory('x'),
      () => Bun.spawnSync(['git']),
      () => process.cwd(),
    ])
      expect(method).toThrow('ambient forbidden');
    expect(f.source.getCurrentDirectory()).toBe(root);
    expect(f.source.readFile(root + '/link')).toBe('export {};');
    expect(f.source.readFile(root + '/node_modules/pkg/index.d.ts')).toBe('x');
    expect(f.source.pathKind(root + '/src')).toBe('directory');
    expect(f.source.realpath(root + '/link')).toBe(root + '/a.ts');
    expect(f.source.getDirectories(root)).toEqual(['node_modules', 'src']);
    expect(f.source.readDirectory(root, ['.ts'], ['node_modules'], ['**/*'])).toEqual([
      root + '/a.ts',
      root + '/src/b.ts',
    ]);
    expect(traps.reduce((count, trap) => count + trap.mock.calls.length, 0)).toBe(12);
  } finally {
    for (const trap of traps) trap.mockRestore();
    if (original === undefined) delete process.env['GIT_OBJECT_DIRECTORY'];
    else process.env['GIT_OBJECT_DIRECTORY'] = original;
  }
});

test('byte reserve precedes the candidate allocation boundary', () => {
  const f = setup({ maximumReadBytes: 9 });
  const trap = spyOn(Uint8Array, 'from').mockImplementation(() => {
    throw new Error('copy forbidden');
  });
  try {
    expect(() => f.source.readFile(root + '/a.ts')).toThrow('source read byte ceiling');
    expect(trap).not.toHaveBeenCalled();
  } finally {
    trap.mockRestore();
  }
});

test.each([
  'snapshotIdentity',
  'classificationPolicyIdentity',
  'runtimeClosureIdentity',
  'resolutionPolicyIdentity',
] as const)('source joins independent namespace identity field %s', (key) => {
  const f = setup();
  const proof = namespaceModule.readRetainedNamespaceProvenance(f.namespace);
  const trap = spyOn(namespaceModule, 'readRetainedNamespaceProvenance').mockReturnValue({
    ...proof,
    [key]: 'f'.repeat(64),
  });
  try {
    expect(() =>
      createRetainedTypeScriptSource(f.namespace, f.candidate, f.runtime, limits),
    ).toThrow('identity differs');
  } finally {
    trap.mockRestore();
  }
});

test('source snapshots limit getters once', () => {
  const f = setup();
  let calls = 0;
  const captured = {
    ...limits,
    get maximumReads() {
      calls += 1;
      return calls === 1 ? 1 : 0;
    },
  };
  const source = createRetainedTypeScriptSource(f.namespace, f.candidate, f.runtime, captured);
  expect(source.readFile(root + '/a.ts')).toBe('export {};');
  expect(calls).toBe(1);
});

test('candidate link expansion cannot mount runtime through a root alias', () => {
  const f = fromPaths(
    { 'dir/a.ts': 'a' },
    { 'aliases/link': '../dir', rootAlias: 'aliases/link/..' },
  );
  expect(f.source.pathKind(root + '/rootAlias')).toBe('directory');
  expect(() => f.source.readFile(root + '/rootAlias/node_modules/pkg/index.d.ts')).toThrow(
    'symlink target invalid',
  );
});

test('source query counts UTF8 bytes and repeated output bytes', () => {
  const f = setup({ maximumPathBytes: root.length + 3 });
  expect(() => f.source.pathKind(root + '/éé')).toThrow('source path ceiling');
  const output = setup({ maximumReturnedPathBytes: root.length });
  expect(output.source.realpath(root)).toBe(root);
  expect(() => output.source.realpath(root)).toThrow('source returned path ceiling');
});

test.each(['arity', 'version'])(
  'matcher boundary %s negative runs in an isolated module registry',
  (shape) => {
    const invocation = Bun.spawnSync(
      [
        process.execPath,
        '--smol',
        'test',
        './apps/twilight-structure/twilight-dash/cli/src/activation/review-typescript-matcher.test.fixture.ts',
      ],
      {
        cwd: new URL('../../../../../..', import.meta.url).pathname,
        env: { ...process.env, RETAINED_MATCHER_SHAPE: shape },
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 20000,
      },
    );
    expect(invocation.exitCode).toBe(0);
    expect(invocation.stderr.toString()).toContain('1 pass');
  },
);

test.each(['', '/outside', 'nul\0target', '\\target'])(
  'source rejects broken owned link decoder input %j',
  (target) => {
    const f = setup();
    const bytes = Buffer.from(target);
    const trap = spyOn(Uint8Array, 'from').mockImplementation(() => bytes);
    try {
      expect(() => f.source.pathKind(root + '/link')).toThrow('symlink target invalid');
    } finally {
      trap.mockRestore();
    }
  },
);

test('source rejects malformed owned link UTF8 before target expansion', () => {
  const f = setup();
  const bytes = Uint8Array.from([255]);
  const trap = spyOn(Uint8Array, 'from').mockImplementation(() => bytes);
  try {
    expect(() => f.source.pathKind(root + '/link')).toThrow();
  } finally {
    trap.mockRestore();
  }
});

test('lexical outside query refuses before a selected link can allocate', () => {
  const f = setup();
  const trap = spyOn(Uint8Array, 'from').mockImplementation(() => {
    throw new Error('copy forbidden');
  });
  try {
    expect(() => f.source.readFile(root + '/link/../../outside')).toThrow(
      'source path escapes candidate',
    );
    expect(trap).not.toHaveBeenCalled();
  } finally {
    trap.mockRestore();
  }
});

test('pattern byte budget counts separately fitting lifetime calls', () => {
  const f = setup({ maximumPatternBytes: 3 });
  f.source.readDirectory(root, ['.t']);
  expect(() => f.source.readDirectory(root, ['.t'])).toThrow('source pattern byte ceiling');
});

test('candidate link target policy rejects missing dependency and git namespaces', () => {
  const f = fixture(
    'sha1',
    ['parser.js'],
    { 'a.ts': 'a' },
    { runtime: 'node_modules/missing', git: '.git/config' },
  );
  const namespace = createRetainedNamespace(f.candidate, f.runtime, namespaceLimits);
  const source = createRetainedTypeScriptSource(namespace, f.candidate, f.runtime, limits);
  expect(() => source.pathKind(root + '/runtime')).toThrow('symlink target invalid');
  expect(() => source.pathKind(root + '/git')).toThrow('symlink target invalid');
});

test('enumeration root walks file ancestors and alias parents before matcher normalization', () => {
  const f = fromPaths(
    { plain: 'x', 'dir/a.ts': 'a', 'dir/nested/b.ts': 'b', 'z.ts': 'z' },
    { alias: 'dir/nested' },
  );
  expect(() => f.source.readDirectory(root + '/plain/../dir')).toThrow('not a directory');
  expect(f.source.readDirectory(root + '/alias/..', ['.ts'])).toEqual([
    root + '/dir/a.ts',
    root + '/dir/nested/b.ts',
  ]);
});

test('directory basename listing admits trailing slash alias roots', () => {
  const f = fromPaths({ 'src/nested/a.ts': 'a' }, { alias: 'src' });
  fs.rmSync(f.sourceRepository + '/.git', { recursive: true });
  expect(f.source.getDirectories(root + '/')).toEqual(['alias', 'node_modules', 'src']);
  expect(f.source.getDirectories(root + '/alias/')).toEqual(
    ts.sys.getDirectories(f.sourceRepository + '/alias/'),
  );
});

test('cwd shares the lifetime returned-path budget', () => {
  const f = setup({ maximumReturnedPathBytes: root.length });
  expect(f.source.getCurrentDirectory()).toBe(root);
  expect(() => f.source.getCurrentDirectory()).toThrow('source returned path ceiling');
});

test('missing enumeration ancestor cannot normalize into a selected directory', () => {
  const f = setup();
  expect(f.source.readDirectory(root + '/missing/../src')).toEqual([]);
});

test('query codeunit bound precedes UTF8 scanning', () => {
  const f = setup({ maximumPathBytes: root.length });
  const trap = spyOn(Buffer, 'byteLength').mockImplementation(() => {
    throw new Error('scan forbidden');
  });
  try {
    expect(() => f.source.pathKind(root + '/too-long')).toThrow('source path ceiling');
    expect(trap).not.toHaveBeenCalled();
  } finally {
    trap.mockRestore();
  }
});

test.each(['nul\0pattern', '\\pattern', '\uD800'])(
  'malformed enumeration pattern refuses %j',
  (pattern) => {
    const f = setup();
    expect(() => f.source.readDirectory(root, undefined, undefined, [pattern])).toThrow(
      'source pattern malformed',
    );
  },
);

test('enumeration child UTF8 bytes are bounded before path construction', () => {
  const f = fixture('sha1', ['parser.js'], { 'é.ts': 'a' }, {});
  const namespace = createRetainedNamespace(f.candidate, f.runtime, namespaceLimits);
  const source = createRetainedTypeScriptSource(namespace, f.candidate, f.runtime, {
    ...limits,
    maximumPathBytes: root.length + 5,
  });
  expect(() => source.getDirectories(root)).toThrow('source path ceiling');
});

test.each(['include', 'exclude'] as const)(
  'literal %s prefix admits owned aliases and refuses file ancestors',
  (kind) => {
    const f = fromPaths(
      { plain: 'x', 'dir/a.ts': 'a', 'dir/nested/b.ts': 'b' },
      { alias: 'dir/nested' },
    );
    const read = (pattern: string) =>
      kind === 'include'
        ? f.source.readDirectory(root, ['.ts'], undefined, [pattern])
        : f.source.readDirectory(root, ['.ts'], [pattern], ['**/*']);
    expect(() => read('plain/child/**/*')).toThrow('not a directory');
    expect(() => read('plain/../dir/**/*')).toThrow('pattern dot component');
    expect(() => read('alias/../**/*')).toThrow('pattern dot component');
    if (kind === 'include') expect(read('alias/**/*')).toEqual([root + '/alias/b.ts']);
  },
);

test('missing literal prefixes cannot normalize into selected includes or excludes', () => {
  const f = setup();
  expect(f.source.readDirectory(root, ['.ts'], undefined, ['missing/src/**/*'])).toEqual([]);
  expect(f.source.readDirectory(root, ['.ts'], ['missing/src/**/*'], ['src/**/*'])).toEqual([
    root + '/src/b.ts',
  ]);
});

test('root and prefix canonicalization retain candidate alias provenance', () => {
  const f = fromPaths(
    { 'dir/a.ts': 'a' },
    { 'aliases/link': '../dir', rootAlias: 'aliases/link/..' },
  );
  expect(() => f.source.readDirectory(root + '/rootAlias/.')).toThrow('symlink target invalid');
  expect(() => f.source.readDirectory(root, ['.ts'], undefined, ['rootAlias/**/*'])).toThrow(
    'symlink target invalid',
  );
  expect(() => f.source.getDirectories(root + '/rootAlias')).toThrow('symlink target invalid');
});

test('missing includes preserve valid matches and ordering without widening empty includes', () => {
  const f = setup();
  expect(f.source.readDirectory(root, ['.ts'], undefined, ['missing/**/*.ts'])).toEqual([]);
  expect(f.source.readDirectory(root, ['.ts'], undefined, ['missing/**/*.ts', 'src/**/*'])).toEqual(
    [root + '/src/b.ts'],
  );
});

test('exclude coordinates preserve ordinary lexical alias paths', () => {
  const f = fromPaths({ 'src/public.ts': 'p', 'src/secret.ts': 's' }, { alias: 'src' });
  expect(f.source.readDirectory(root, ['.ts'], ['alias/secret.ts'], ['alias/**/*'])).toEqual([
    root + '/alias/public.ts',
  ]);
  expect(() =>
    f.source.readDirectory(root, ['.ts'], ['alias/./secret.ts'], ['alias/**/*']),
  ).toThrow('pattern dot component');
});

test('pattern dot components and later outside patterns refuse before link reads', () => {
  const f = setup();
  const trap = spyOn(Uint8Array, 'from').mockImplementation(() => {
    throw new Error('copy forbidden');
  });
  try {
    expect(() =>
      f.source.readDirectory(root, ['.ts'], undefined, ['link', 'a*/../src/**/*']),
    ).toThrow('source pattern dot component');
    expect(() =>
      f.source.readDirectory(root, ['.ts'], undefined, ['link', '/outside/**/*']),
    ).toThrow('source path outside or malformed');
    expect(trap).not.toHaveBeenCalled();
  } finally {
    trap.mockRestore();
  }
});

test('directory basenames use installed sys Unicode string order', () => {
  const f = fromPaths({ '\uE000/a.ts': 'a', '\u{10000}/b.ts': 'b' });
  fs.rmSync(f.sourceRepository + '/.git', { recursive: true });
  expect(ts.sys.getDirectories(f.sourceRepository)).toEqual(['\u{10000}', '\uE000']);
  expect(f.source.getDirectories(root)).toEqual(['node_modules', '\u{10000}', '\uE000']);
});

test('drive-rooted matcher patterns refuse before literal link reads', () => {
  const f = setup();
  const trap = spyOn(Uint8Array, 'from').mockImplementation(() => {
    throw new Error('copy forbidden');
  });
  try {
    expect(() =>
      f.source.readDirectory(root, ['.ts'], undefined, ['link', 'C:/outside/**/*']),
    ).toThrow('source pattern outside');
    expect(trap).not.toHaveBeenCalled();
  } finally {
    trap.mockRestore();
  }
});

test.each([
  [{ 'dir/a.ts': 'x' }, { 'dir/link': 'a.ts' }, '/dir/link', 8],
  [{ 'dir/a.ts': 'x' }, { link: 'dir' }, '/link/a.ts', 8],
  [{ 'parent/target/a.ts': 'x' }, { 'parent/link': 'target' }, '/parent/link/a.ts', 18],
] as const)(
  'expanded aggregate includes resolved target remaining and separators %j',
  (files, links, path, bytes) => {
    const over = fromPaths(files, links, { maximumExpandedPathBytes: bytes - 1 });
    expect(() => over.source.pathKind(root + path)).toThrow('source expanded path ceiling');
    const exact = fromPaths(files, links, { maximumExpandedPathBytes: bytes });
    expect(exact.source.pathKind(root + path)).toBe('file');
  },
);

test.each(['nul\0pattern', '\\pattern', '\uD800'])(
  'pattern syntax admission precedes link copies %j',
  (pattern) => {
    const f = setup();
    const trap = spyOn(Uint8Array, 'from').mockImplementation(() => {
      throw new Error('copy forbidden');
    });
    try {
      expect(() => f.source.readDirectory(root, ['.ts'], undefined, ['link', pattern])).toThrow(
        'source pattern malformed',
      );
      expect(trap).not.toHaveBeenCalled();
    } finally {
      trap.mockRestore();
    }
  },
);

test.each([0, -1, 1.5, NaN, Infinity, 31])(
  'supplied enumeration depth refuses before link copies %j',
  (depth) => {
    const f = setup();
    const trap = spyOn(Uint8Array, 'from').mockImplementation(() => {
      throw new Error('copy forbidden');
    });
    try {
      expect(() => f.source.readDirectory(root, ['.ts'], undefined, ['link'], depth)).toThrow(
        'source enumeration depth invalid',
      );
      expect(trap).not.toHaveBeenCalled();
    } finally {
      trap.mockRestore();
    }
  },
);

test('captured includes remain missing-only when caller getter truncates array', () => {
  const f = fromPaths({ 'exists.ts': 'x' });
  const include = ['missing/**/*.ts'];
  Object.defineProperty(include, 0, {
    get() {
      include.length = 0;
      return 'missing/**/*.ts';
    },
  });
  expect(f.source.readDirectory(root, ['.ts'], undefined, include)).toEqual([]);
});

test('captured extensions ignore caller getter growth beyond admitted count', () => {
  const f = fromPaths({ 'src/exists.ts': 'x', 'src/exists.js': 'x' }, {}, { maximumPatterns: 1 });
  const extensions = ['.ts'];
  Object.defineProperty(extensions, 0, {
    get() {
      extensions.push('.js');
      return '.ts';
    },
  });
  expect(f.source.readDirectory(root + '/src', extensions)).toEqual([root + '/src/exists.ts']);
});

test('captured patterns refuse a missing indexed entry after caller getter truncation', () => {
  const f = setup();
  const include = ['missing/**/*.ts', 'other/**/*.ts'];
  Object.defineProperty(include, 0, {
    get() {
      include.length = 1;
      return 'missing/**/*.ts';
    },
  });
  expect(() => f.source.readDirectory(root, undefined, undefined, include)).toThrow(
    'source pattern missing',
  );
});

test('captured pattern arrays refuse noninteger proxy lengths before any link copies', () => {
  const f = setup();
  const copy = spyOn(Uint8Array, 'from').mockImplementation(() => {
    throw new Error('copy reached');
  });
  try {
    for (const count of [NaN, undefined, 1.5, -1, Infinity]) {
      const patterns = new Proxy(['**/*'], {
        get(target, name, receiver) {
          if (name === 'length') return count;
          if (name === '0') throw new Error('indexed pattern reached');
          const selected: unknown = Reflect.get(target, name, receiver);
          return selected;
        },
      });
      for (const position of ['extensions', 'exclude', 'include']) {
        expect(() =>
          f.source.readDirectory(
            root,
            position === 'extensions' ? patterns : ['.ts'],
            position === 'exclude' ? patterns : undefined,
            position === 'include' ? patterns : undefined,
          ),
        ).toThrow('source pattern count invalid');
      }
    }
    expect(copy).not.toHaveBeenCalled();
  } finally {
    copy.mockRestore();
  }
});

test('byte census records raw candidate package BOM and probe symlink acquisitions only', () => {
  const f = fixture(
    'sha1',
    undefined,
    {
      'a.ts': '\uFEFFexport {};',
      'package.json': '{"type":"module"}',
      'unused.ts': 'unused',
    },
    { z: 'a.ts', alias: 'a.ts' },
  );
  const namespace = createRetainedNamespace(f.candidate, f.runtime, namespaceLimits);
  const source = createRetainedTypeScriptSource(namespace, f.candidate, f.runtime, limits);
  expect(source.pathKind(`${root}/unused.ts`)).toBe('file');
  expect(source.readFile(`${root}/absent`)).toBeUndefined();
  expect(source.pathKind(`${root}/z`)).toBe('file');
  expect(source.readFile(`${root}/alias`)).toBe('export {};');
  expect(source.readFile(`${root}/a.ts`)).toBe('export {};');
  expect(source.readFile(`${root}/package.json`)).toBe('{"type":"module"}');
  expect(source.readFile(`${root}/node_modules/pkg/index.d.ts`)).toBe('x');
  const census = sealRetainedTypeScriptReads(source);
  expect(census).toEqual({
    schemaVersion: 1,
    kind: 'retained-typescript-byte-reads',
    entries: [
      {
        namespace: 'runtime',
        path: 'node_modules/pkg/index.d.ts',
        revision: null,
        identity: hashBytes('x'),
        byteLength: 1,
      },
      {
        namespace: 'candidate',
        path: 'a.ts',
        revision: null,
        identity: hashBytes('\uFEFFexport {};'),
        byteLength: 13,
      },
      {
        namespace: 'candidate',
        path: 'package.json',
        revision: null,
        identity: hashBytes('{"type":"module"}'),
        byteLength: 17,
      },
      {
        namespace: 'candidate',
        path: 'alias',
        revision: null,
        identity: hashBytes('a.ts'),
        byteLength: 4,
      },
      {
        namespace: 'candidate',
        path: 'z',
        revision: null,
        identity: hashBytes('a.ts'),
        byteLength: 4,
      },
    ],
  });
  expect(Object.isFrozen(census)).toBe(true);
  expect(Object.isFrozen(census.entries)).toBe(true);
  for (const entry of census.entries) expect(Object.isFrozen(entry)).toBe(true);
  expect(sealRetainedTypeScriptReads(source)).toBe(census);
  for (const invoke of [
    () => source.getCurrentDirectory(),
    () => source.pathKind(root),
    () => source.readFile(`${root}/a.ts`),
    () => source.getDirectories(root),
    () => source.readDirectory(root),
    () => source.realpath(`${root}/a.ts`),
  ])
    expect(invoke).toThrow('sealed');
  const patterns = new Proxy(['*.ts'], {
    get() {
      throw new Error('forbidden pattern getter');
    },
  });
  expect(() => source.readDirectory(root, undefined, undefined, patterns)).toThrow('sealed');
  const foreign = new Proxy(
    { ...source },
    {
      get() {
        throw new Error('foreign accessor touched');
      },
    },
  );
  expect(() => sealRetainedTypeScriptReads(foreign)).toThrow('owned retained TypeScript');
});

test('byte census exact ceilings precede owner copies and repeated tuples do not grow', () => {
  const f = setup();
  f.source.readFile(`${root}/a.ts`);
  const bytes = Buffer.byteLength(serializeCanonical(sealRetainedTypeScriptReads(f.source)));
  const exact = createRetainedTypeScriptSource(f.namespace, f.candidate, f.runtime, {
    ...limits,
    maximumReadEntries: 1,
    maximumReadLedgerBytes: bytes,
  });
  exact.readFile(`${root}/a.ts`);
  exact.readFile(`${root}/a.ts`);
  const copy = spyOn(f.candidate, 'read').mockImplementation(() => {
    throw new Error('copy sentinel');
  });
  try {
    expect(() => exact.readFile(`${root}/src/b.ts`)).toThrow('read entry ceiling');
    const short = createRetainedTypeScriptSource(f.namespace, f.candidate, f.runtime, {
      ...limits,
      maximumReadLedgerBytes: bytes - 1,
    });
    expect(() => short.readFile(`${root}/a.ts`)).toThrow('read ledger byte ceiling');
    expect(copy).not.toHaveBeenCalled();
  } finally {
    copy.mockRestore();
  }
  expect(Buffer.byteLength(serializeCanonical(sealRetainedTypeScriptReads(exact)))).toBe(bytes);
  const bounded = createRetainedTypeScriptSource(f.namespace, f.candidate, f.runtime, {
    ...limits,
    maximumReads: 1,
  });
  bounded.readFile(`${root}/a.ts`);
  expect(() => bounded.readFile(`${root}/a.ts`)).toThrow('read ceiling');
});

test('byte census empty wrapper and safe explicit limits reject before copies', () => {
  const f = setup();
  const empty = sealRetainedTypeScriptReads(f.source);
  expect(empty.entries).toEqual([]);
  const bytes = Buffer.byteLength(serializeCanonical(empty));
  expect(() =>
    createRetainedTypeScriptSource(f.namespace, f.candidate, f.runtime, {
      ...limits,
      maximumReadLedgerBytes: bytes - 1,
    }),
  ).toThrow('read ledger byte ceiling');
  const source = createRetainedTypeScriptSource(f.namespace, f.candidate, f.runtime, {
    ...limits,
    maximumReadLedgerBytes: bytes,
  });
  expect(sealRetainedTypeScriptReads(source)).toEqual(empty);
  for (const field of ['maximumReadEntries', 'maximumReadLedgerBytes'])
    for (const ceiling of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined])
      expect(() =>
        createRetainedTypeScriptSource(f.namespace, f.candidate, f.runtime, {
          ...limits,
          [field]: ceiling,
        }),
      ).toThrow('positive safe integer');
});

test('byte census failed owner copy contributes no tuple', () => {
  const f = setup();
  const copy = spyOn(f.candidate, 'read').mockImplementation(() => {
    throw new Error('copy failure');
  });
  try {
    expect(() => f.source.readFile(`${root}/a.ts`)).toThrow('copy failure');
  } finally {
    copy.mockRestore();
  }
  expect(sealRetainedTypeScriptReads(f.source).entries).toEqual([]);
});

test('byte census runtime ledger shortage precedes runtime copy and rereads charge bytes', () => {
  const f = setup();
  const path = `${root}/node_modules/pkg/index.d.ts`;
  f.source.readFile(path);
  const bytes = Buffer.byteLength(serializeCanonical(sealRetainedTypeScriptReads(f.source)));
  const source = createRetainedTypeScriptSource(f.namespace, f.candidate, f.runtime, {
    ...limits,
    maximumReadLedgerBytes: bytes - 1,
  });
  const copy = spyOn(f.runtime, 'readFile').mockImplementation(() => {
    throw new Error('runtime copy sentinel');
  });
  try {
    expect(() => source.readFile(path)).toThrow('read ledger byte ceiling');
    expect(copy).not.toHaveBeenCalled();
  } finally {
    copy.mockRestore();
  }
  const bounded = createRetainedTypeScriptSource(f.namespace, f.candidate, f.runtime, {
    ...limits,
    maximumReadBytes: 1,
  });
  bounded.readFile(path);
  expect(() => bounded.readFile(path)).toThrow('read byte ceiling');
});

test('byte census two entry comma contributes to exact byte ceiling', () => {
  const f = setup();
  f.source.readFile(`${root}/a.ts`);
  f.source.readFile(`${root}/src/b.ts`);
  const bytes = Buffer.byteLength(serializeCanonical(sealRetainedTypeScriptReads(f.source)));
  const exact = createRetainedTypeScriptSource(f.namespace, f.candidate, f.runtime, {
    ...limits,
    maximumReadLedgerBytes: bytes,
  });
  exact.readFile(`${root}/a.ts`);
  exact.readFile(`${root}/src/b.ts`);
  expect(Buffer.byteLength(serializeCanonical(sealRetainedTypeScriptReads(exact)))).toBe(bytes);
  const short = createRetainedTypeScriptSource(f.namespace, f.candidate, f.runtime, {
    ...limits,
    maximumReadLedgerBytes: bytes - 1,
  });
  short.readFile(`${root}/a.ts`);
  const copy = spyOn(f.candidate, 'read').mockImplementation(() => {
    throw new Error('second copy sentinel');
  });
  try {
    expect(() => short.readFile(`${root}/src/b.ts`)).toThrow('read ledger byte ceiling');
    expect(copy).not.toHaveBeenCalled();
  } finally {
    copy.mockRestore();
  }
});

test('byte census UTF8 order differs from UTF16 and acquisition order', () => {
  const f = fixture('sha1', undefined, { '\uE000.ts': 'same', '\u{10000}.ts': 'same' }, {});
  const namespace = createRetainedNamespace(f.candidate, f.runtime, namespaceLimits);
  const source = createRetainedTypeScriptSource(namespace, f.candidate, f.runtime, limits);
  source.readFile(`${root}/\u{10000}.ts`);
  source.readFile(`${root}/\uE000.ts`);
  expect(sealRetainedTypeScriptReads(source).entries.map((entry) => entry.path)).toEqual([
    '\uE000.ts',
    '\u{10000}.ts',
  ]);
});

test('byte census enumeration records link acquisitions without file metadata reads', () => {
  const f = setup();
  expect(f.source.readDirectory(root, ['.ts'])).toEqual([
    `${root}/a.ts`,
    `${root}/node_modules/pkg/index.d.ts`,
    `${root}/src/b.ts`,
  ]);
  expect(sealRetainedTypeScriptReads(f.source).entries).toEqual([
    {
      namespace: 'candidate',
      path: 'link',
      revision: null,
      identity: hashBytes('a.ts'),
      byteLength: 4,
    },
  ]);
});
