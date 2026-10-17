import * as fs from 'node:fs';
import { join } from 'node:path';

import { hashBytes, serializeCanonical } from '@twilight-burokrat/judge';
import { expect, spyOn, test } from 'bun:test';
import ts from 'typescript';

// eslint-disable-next-line @nx/enforce-module-boundaries -- Parity requires the preserved legacy producer as its independent oracle; it is intentionally absent from the production facade.
import { extractTypeScriptRelationships } from '../../../../twilight-burokrat/cli/src/relationships/typescript';
import { createRetainedNamespace, readRetainedNamespaceProvenance } from './review-namespace';
import { extractRetainedTypeScriptRelationships } from './review-typescript';
import * as sources from './review-typescript-source';
import { fixture } from './review-typescript-source.test.fixture';

const sourceLimits = {
  maximumNodes: 100,
  maximumProbes: 10000,
  maximumSteps: 100000,
  maximumReads: 1000,
  maximumReadBytes: 1000000,
  maximumReadEntries: 1000,
  maximumReadLedgerBytes: 1000000,
  maximumPathBytes: 2048,
  maximumTargetBytes: 1024,
  maximumExpandedPathBytes: 4096,
  maximumLinkExpansions: 20,
  maximumDirectoryDepth: 30,
  maximumPatterns: 1000,
  maximumPatternBytes: 100000,
  maximumEnumeratedEntries: 10000,
  maximumReturnedPathBytes: 1000000,
};
const compilerLimits = {
  maximumProbes: 10000,
  maximumReadBytes: 1000000,
  maximumDirectoryEntries: 10000,
  maximumObservedOutputBytes: 1000000,
  maximumOutputBytes: 1000000,
};
const requestLimits = {
  maximumConfigPaths: 10,
  maximumPublicEntrypoints: 10,
  maximumPathBytes: 1024,
  maximumTotalPathBytes: 10000,
  maximumOutputBytes: 1000000,
};
const globals = [
  'CallableFunction',
  'NewableFunction',
  'Array<T>',
  'Boolean',
  'Function',
  'IArguments',
  'Number',
  'Object',
  'RegExp',
  'String',
]
  .map((name) => `interface ${name} {}`)
  .join('\n');
function setup(
  format: 'sha1' | 'sha256' = 'sha1',
  config = '{}',
  entry = "export { value } from './provider'; export type { PackageType } from 'pkg';",
  provider = 'export const value: number = 1;',
  libraries?: Record<string, string>,
) {
  const metadata = fs.readFileSync(
    join(import.meta.dir, '../../../../../../node_modules/typescript/package.json'),
    'utf8',
  );
  const content = {
    ...(libraries === undefined
      ? {}
      : {
          'node_modules/typescript/lib/lib.unreferenced.d.ts': 'interface UnreferencedLibrary {}',
          ...libraries,
        }),
    'node_modules/typescript/package.json': metadata,
    'node_modules/pkg/package.json': JSON.stringify({
      name: 'pkg',
      version: '1.0.0',
      types: 'index.d.ts',
    }),
    'node_modules/pkg/index.d.ts': 'export interface PackageType { title: string }',
    'parser.js': 'parser',
    'node_modules/unused/index.d.ts': 'export interface Unused {}',
  };
  const f = fixture(
    format,
    Object.keys(content),
    {
      'tsconfig.json': JSON.stringify({
        extends: './base.json',
        include: libraries === undefined ? ['src/**/*.ts', 'globals.d.ts'] : ['src/**/*.ts'],
        ...JSON.parse(config),
      }),
      'base.json': JSON.stringify({
        compilerOptions: {
          ...(libraries === undefined ? { noLib: true } : { lib: ['es5'] }),
          types: [],
          strict: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          baseUrl: '.',
          ignoreDeprecations: '6.0',
          paths: { '@local/*': ['src/*'] },
        },
      }),
      ...(libraries === undefined ? { 'globals.d.ts': globals } : {}),
      'src/index.ts': entry,
      'src/provider.ts': provider,
      'src/consumer.ts': "import { value } from '@local/provider'; export const copy = value;",
      '\ufffd.ts': 'export {};',
    },
    {},
    content,
    libraries === undefined ? 10000 : 1000000,
  );
  const namespace = createRetainedNamespace(f.candidate, f.runtime, {
    maximumEntries: 100,
    maximumNodes: 100,
    maximumPathBytes: 2048,
    maximumTotalPathBytes: 20000,
  });
  return {
    ...f,
    namespace,
    request: { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/index.ts'] },
    sourceLimits: { ...sourceLimits },
    compilerLimits: { ...compilerLimits },
    requestLimits: { ...requestLimits },
  };
}
for (const format of ['sha1', 'sha256'] as const)
  for (const mode of ['noLib', 'ES5'] as const)
    test(`retained compiler ${mode} ${format} matches legacy after all capture roots disappear`, () => {
      const libraries = mode === 'ES5' ? readLibraries() : undefined;
      const entry =
        mode === 'ES5'
          ? "export { value } from './provider'; export type { PackageType } from 'pkg'; export const names: ReadonlyArray<string> = ['es5'].map((name) => name.toUpperCase()); export const epoch: Date = new Date(0);"
          : undefined;
      const f = setup(format, '{}', entry, undefined, libraries);
      // The legacy recipe needs old's matching metadata even with noLib. Both paths use identical compiler identity bytes.
      fs.mkdirSync(join(f.runtimeRoot, 'node_modules/@typescript/old/lib'), { recursive: true });
      fs.writeFileSync(
        join(f.runtimeRoot, 'node_modules/@typescript/old/package.json'),
        fs.readFileSync(
          join(import.meta.dir, '../../../../../../node_modules/@typescript/old/package.json'),
          'utf8',
        ),
      );
      for (const [path, text] of Object.entries(libraries ?? {}))
        fs.writeFileSync(
          join(f.runtimeRoot, path.replace('/typescript/', '/@typescript/old/')),
          text,
        );
      const legacy = extractTypeScriptRelationships(
        f.sourceRepository,
        f.request,
        join(f.runtimeRoot, 'node_modules'),
      );
      expect(legacy.relationships.imports.length).toBe(3);
      for (const root of [f.sourceRepository, f.storeBase, f.runtimeRoot])
        fs.rmSync(root, { recursive: true });
      const originalEnvironment = process.env;
      process.env = new Proxy(originalEnvironment, {
        get() {
          throw new Error('forbidden ambient route');
        },
      });
      const traps = [
        spyOn(fs, 'openSync'),
        spyOn(fs, 'lstatSync'),
        spyOn(fs, 'realpathSync'),
        spyOn(ts.sys, 'directoryExists'),
        spyOn(ts.sys, 'getDirectories'),
        spyOn(ts.sys, 'realpath'),
        spyOn(fs, 'readFileSync'),
        spyOn(fs, 'statSync'),
        spyOn(fs, 'readdirSync'),
        spyOn(Bun, 'spawnSync'),
        spyOn(process, 'cwd'),
        spyOn(ts.sys, 'readFile'),
        spyOn(ts.sys, 'fileExists'),
        spyOn(ts.sys, 'readDirectory'),
        spyOn(ts.sys, 'getCurrentDirectory'),
      ];
      for (const trap of traps)
        trap.mockImplementation(
          Object.assign(
            () => {
              throw new Error('forbidden ambient route');
            },
            {
              native: () => {
                throw new Error('forbidden ambient route');
              },
            },
          ),
        );
      try {
        for (const invoke of [
          () => fs.openSync('x', 'r'),
          () => fs.lstatSync('x'),
          () => fs.realpathSync('x'),
          () => ts.sys.directoryExists('x'),
          () => ts.sys.getDirectories('x'),
          () => ts.sys.realpath?.('x'),
          () => fs.readFileSync('x'),
          () => fs.statSync('x'),
          () => fs.readdirSync('x'),
          () => Bun.spawnSync(['git']),
          () => process.cwd(),
          () => ts.sys.readFile('x'),
          () => ts.sys.fileExists('x'),
          () => ts.sys.readDirectory('x'),
          () => ts.sys.getCurrentDirectory(),
          () => process.env['PATH'],
        ])
          expect(invoke).toThrow('forbidden ambient route');
        for (const trap of traps) trap.mockClear();
        const extracted = extractRetainedTypeScriptRelationships(f);
        expect(extracted.runtimeTrust).toBe('unverified');
        expect(extracted.provenance.runtimeTrust).toBe('unverified');
        expect(extracted.provenance).toEqual(readRetainedNamespaceProvenance(f.namespace));
        expect(extracted.extractor).toEqual(legacy.extractor);
        expect(extracted.relationships).toEqual(legacy.relationships);
        if (libraries !== undefined) {
          expectLibraries(extracted, libraries);
          expect(
            extracted.relationships.publicDeclarations[0]?.declarations.some((declaration) =>
              declaration.text.includes('ReadonlyArray<string>'),
            ),
          ).toBe(true);
          expect(
            extracted.relationships.publicDeclarations[0]?.declarations.some((declaration) =>
              declaration.text.includes('Date'),
            ),
          ).toBe(true);
        }
        for (const trap of traps) expect(trap).not.toHaveBeenCalled();
      } finally {
        process.env = originalEnvironment;
        for (const trap of traps) trap.mockRestore();
      }
    });

test('retained compiler rejects malformed or noncandidate requests before retained reads', () => {
  const f = setup();
  const read = spyOn(f.candidate, 'read');
  const admission = spyOn(sources, 'createRetainedTypeScriptSource');
  try {
    for (const path of [
      '',
      '../tsconfig.json',
      './tsconfig.json',
      'node_modules/x.json',
      '.git/x',
      'C:tsconfig.json',
      '\ud800.ts',
      'a\0.ts',
      'a//b',
      'a\\b',
    ]) {
      expect(() =>
        extractRetainedTypeScriptRelationships({
          ...f,
          request: { ...f.request, configPaths: [path] },
        }),
      ).toThrow();
    }
    for (const request of [
      { configPaths: [], publicEntrypoints: ['src/index.ts'] },
      { configPaths: ['tsconfig.json'], publicEntrypoints: [] },
      { configPaths: ['tsconfig.json', 'tsconfig.json'], publicEntrypoints: ['src/index.ts'] },
      { configPaths: ['tsconfig.json'], publicEntrypoints: ['src/index.ts', 'src/index.ts'] },
    ])
      expect(() => extractRetainedTypeScriptRelationships({ ...f, request })).toThrow('request');
    expect(read).not.toHaveBeenCalled();
    expect(admission).not.toHaveBeenCalled();
  } finally {
    admission.mockRestore();
    read.mockRestore();
  }
});

test('retained compiler bounds and captures fixed request lengths before indexed getters', () => {
  const f = setup();
  const paths = ['tsconfig.json'];
  Object.defineProperty(paths, 0, {
    get() {
      paths.push('missing.json');
      return 'tsconfig.json';
    },
  });
  expect(
    extractRetainedTypeScriptRelationships({ ...f, request: { ...f.request, configPaths: paths } })
      .relationships.publicDeclarations.length,
  ).toBe(1);
  const poison = new Proxy(['tsconfig.json', 'base.json'], {
    get(target, key, receiver) {
      if (key === '0') throw new Error('path copied before count bound');
      const selected: unknown = Reflect.get(target, key, receiver);
      return selected;
    },
  });
  expect(() =>
    extractRetainedTypeScriptRelationships({
      ...f,
      request: { ...f.request, configPaths: poison },
      requestLimits: { ...requestLimits, maximumConfigPaths: 1 },
    }),
  ).toThrow('request count');
  for (const requestLimits of [
    { ...f.requestLimits, maximumPathBytes: 1 },
    { ...f.requestLimits, maximumTotalPathBytes: 20 },
  ])
    expect(() => extractRetainedTypeScriptRelationships({ ...f, requestLimits })).toThrow(
      'request path',
    );
});

test('retained compiler snapshots limits and refuses final envelope one byte below exact', () => {
  const f = setup();
  const extracted = extractRetainedTypeScriptRelationships(f);
  const exact = Buffer.byteLength(serializeCanonical(extracted));
  expect(
    extractRetainedTypeScriptRelationships({
      ...f,
      requestLimits: { ...requestLimits, maximumOutputBytes: exact },
    }),
  ).toEqual(extracted);
  expect(() =>
    extractRetainedTypeScriptRelationships({
      ...f,
      requestLimits: { ...requestLimits, maximumOutputBytes: exact - 1 },
    }),
  ).toThrow('retained TypeScript output');
  for (const group of ['requestLimits', 'sourceLimits', 'compilerLimits'] as const)
    for (const name of Object.keys(f[group])) {
      expect(() =>
        extractRetainedTypeScriptRelationships({
          ...f,
          [group]: { ...f[group], [name]: Infinity },
        }),
      ).toThrow('limit');
    }
});

for (const [name, config, entry, error] of [
  ['bad config', '{"compilerOptions":{"target":"wrong"}}', 'export {};', 'config malformed'],
  ['diagnostics', '{}', 'export const value: MissingType = 1;', 'compiler failed'],
  ['selected missing', '{}', "export { missing } from './absent';", 'unresolved'],
  ['selected escape', '{}', "export { missing } from '../../../outside';", 'unresolved'],
] as const)
  test(`retained compiler refuses ${name}`, () => {
    const f = setup('sha1', config, entry);
    const traps = [spyOn(fs, 'readFileSync'), spyOn(ts.sys, 'readFile'), spyOn(Bun, 'spawnSync')];
    for (const trap of traps)
      trap.mockImplementation(() => {
        throw new Error('negative ambient route');
      });
    try {
      expect(() => extractRetainedTypeScriptRelationships(f)).toThrow(error);
      for (const trap of traps) expect(trap).not.toHaveBeenCalled();
    } finally {
      for (const trap of traps) trap.mockRestore();
    }
  });

test('retained compiler captures request and all ceilings before source callbacks mutate caller objects', () => {
  const f = setup();
  f.requestLimits.maximumOutputBytes = 1;
  const create = sources.createRetainedTypeScriptSource;
  const trap = spyOn(sources, 'createRetainedTypeScriptSource').mockImplementation((...args) => {
    f.request.configPaths[0] = 'missing.json';
    f.request.publicEntrypoints[0] = 'missing.ts';
    f.requestLimits.maximumOutputBytes = Infinity;
    f.compilerLimits.maximumOutputBytes = 0;
    f.sourceLimits.maximumReads = 0;
    return create(...args);
  });
  try {
    expect(() =>
      extractRetainedTypeScriptRelationships({
        ...f,
        requestLimits: f.requestLimits,
      }),
    ).toThrow('retained TypeScript output');
  } finally {
    trap.mockRestore();
  }
});

test('retained compiler snapshots each path and limit getter once and refuses sparse entries', () => {
  const f = setup();
  let calls = 0;
  Object.defineProperty(f.compilerLimits, 'maximumProbes', {
    get() {
      calls += 1;
      return calls === 1 ? 10000 : 0;
    },
  });
  expect(extractRetainedTypeScriptRelationships(f).relationships.publicDeclarations.length).toBe(1);
  expect(calls).toBe(1);
  const sparse = new Array<string>(1);
  expect(() =>
    extractRetainedTypeScriptRelationships({
      ...f,
      request: { ...f.request, configPaths: sparse },
    }),
  ).toThrow('request path missing');
});

test('retained compiler refuses missing selected config and public entrypoint', () => {
  const f = setup();
  expect(() =>
    extractRetainedTypeScriptRelationships({
      ...f,
      request: { ...f.request, configPaths: ['missing.json'] },
    }),
  ).toThrow('config absent');
  expect(() =>
    extractRetainedTypeScriptRelationships({
      ...f,
      request: { ...f.request, publicEntrypoints: ['missing.ts'] },
    }),
  ).toThrow('entrypoint');
});

test('retained compiler rejects absent package metadata and foreign owners', () => {
  const f = setup();
  for (const key of ['namespace', 'candidate', 'runtime'] as const)
    expect(() => extractRetainedTypeScriptRelationships({ ...f, [key]: { ...f[key] } })).toThrow(
      'owned',
    );
  const absent = fixture(
    'sha1',
    ['parser.js'],
    { 'tsconfig.json': '{}', 'index.ts': 'export {};' },
    {},
  );
  const namespace = createRetainedNamespace(absent.candidate, absent.runtime, {
    maximumEntries: 100,
    maximumNodes: 100,
    maximumPathBytes: 2048,
    maximumTotalPathBytes: 20000,
  });
  expect(() => extractRetainedTypeScriptRelationships({ ...f, ...absent, namespace })).toThrow(
    'compiler identity is unreadable',
  );
});

test('retained compiler refuses array impostors before source admission', () => {
  const f = setup();
  const trap = spyOn(sources, 'createRetainedTypeScriptSource').mockImplementation(() => {
    throw new Error('source admission reached');
  });
  try {
    for (const key of ['configPaths', 'publicEntrypoints'] as const) {
      expect(() =>
        extractRetainedTypeScriptRelationships({
          ...f,
          request: { ...f.request, [key]: { length: 1.5, 0: 'tsconfig.json' } },
        }),
      ).toThrow('request arrays');
    }
    expect(trap).not.toHaveBeenCalled();
  } finally {
    trap.mockRestore();
  }
});

test('retained compiler validates every limit field before source admission', () => {
  const f = setup();
  const trap = spyOn(sources, 'createRetainedTypeScriptSource').mockImplementation(() => {
    throw new Error('source admission reached');
  });
  try {
    for (const group of ['requestLimits', 'sourceLimits', 'compilerLimits'] as const)
      for (const name of Object.keys(f[group]))
        for (const ceiling of [undefined, NaN, Infinity, -1, 1.5]) {
          expect(() =>
            extractRetainedTypeScriptRelationships({
              ...f,
              [group]: { ...f[group], [name]: ceiling },
            }),
          ).toThrow('limit');
        }
    expect(trap).not.toHaveBeenCalled();
  } finally {
    trap.mockRestore();
  }
});

test('retained compiler bounds UTF8 paths and public count before admission', () => {
  const f = setup();
  const trap = spyOn(sources, 'createRetainedTypeScriptSource').mockImplementation(() => {
    throw new Error('source admission reached');
  });
  try {
    expect(() =>
      extractRetainedTypeScriptRelationships({
        ...f,
        request: { ...f.request, configPaths: ['é'.repeat(8)] },
        requestLimits: { ...requestLimits, maximumPathBytes: 15 },
      }),
    ).toThrow('request path byte');
    expect(() =>
      extractRetainedTypeScriptRelationships({
        ...f,
        request: { ...f.request, publicEntrypoints: ['a.ts', 'b.ts'] },
        requestLimits: { ...requestLimits, maximumPublicEntrypoints: 1 },
      }),
    ).toThrow('request count');
    expect(trap).not.toHaveBeenCalled();
  } finally {
    trap.mockRestore();
  }
});

test('retained compiler bounds path codeunits before UTF8 encoding', () => {
  const f = setup();
  const trap = spyOn(Buffer, 'byteLength').mockImplementation(() => {
    throw new Error('encoding reached');
  });
  try {
    expect(() =>
      extractRetainedTypeScriptRelationships({
        ...f,
        request: { ...f.request, configPaths: ['a'.repeat(16)] },
        requestLimits: { ...requestLimits, maximumPathBytes: 15 },
      }),
    ).toThrow('request path ceiling');
    expect(trap).not.toHaveBeenCalled();
  } finally {
    trap.mockRestore();
  }
});

test('retained compiler enforces mounted source and compiler budgets', () => {
  const f = setup();
  for (const name of Object.keys(f.sourceLimits))
    expect(() =>
      extractRetainedTypeScriptRelationships({
        ...f,
        sourceLimits: { ...f.sourceLimits, [name]: 0 },
      }),
    ).toThrow('limit');
  expect(() =>
    extractRetainedTypeScriptRelationships({
      ...f,
      sourceLimits: { ...f.sourceLimits, maximumReads: 1 },
    }),
  ).toThrow('source read ceiling');
  expect(() =>
    extractRetainedTypeScriptRelationships({
      ...f,
      sourceLimits: { ...f.sourceLimits, maximumReadBytes: 1 },
    }),
  ).toThrow('compiler identity is unreadable');
  for (const [name, message] of [
    ['maximumProbes', 'compiler identity is unreadable'],
    ['maximumReadBytes', 'compiler identity is unreadable'],
    ['maximumDirectoryEntries', 'directory entry'],
    ['maximumObservedOutputBytes', 'observed output'],
    ['maximumOutputBytes', 'output byte'],
  ] as const)
    expect(() =>
      extractRetainedTypeScriptRelationships({
        ...f,
        compilerLimits: { ...f.compilerLimits, [name]: 0 },
      }),
    ).toThrow(message);
});

test('retained compiler validates captured proxy array lengths before indexed reads', () => {
  const f = setup();
  const trap = spyOn(sources, 'createRetainedTypeScriptSource').mockImplementation(() => {
    throw new Error('source admission reached');
  });
  try {
    for (const key of ['configPaths', 'publicEntrypoints'] as const)
      for (const count of [NaN, undefined, 1.5]) {
        const paths = new Proxy(f.request[key], {
          get(target, name, receiver) {
            if (name === 'length') return count;
            if (name === '0') throw new Error('path copied before count validation');
            const selected: unknown = Reflect.get(target, name, receiver);
            return selected;
          },
        });
        expect(() =>
          extractRetainedTypeScriptRelationships({ ...f, request: { ...f.request, [key]: paths } }),
        ).toThrow('request count');
      }
    expect(trap).not.toHaveBeenCalled();
  } finally {
    trap.mockRestore();
  }
});

test('changed owned provider changes its public declaration selector identity', () => {
  const first = setup();
  const before = extractRetainedTypeScriptRelationships(first);
  const second = setup('sha1', '{}', undefined, "export const value: string = 'changed';");
  const after = extractRetainedTypeScriptRelationships(second);
  expect(before.extractor).toEqual(after.extractor);
  expect(before.relationships.imports).toEqual(after.relationships.imports);
  expect(before.relationships.publicDeclarations[0]?.identity).not.toBe(
    after.relationships.publicDeclarations[0]?.identity,
  );
  expect(
    after.relationships.publicDeclarations[0]?.declarations.some((declaration) =>
      declaration.text.includes('value: string'),
    ),
  ).toBe(true);
});

test('retained compiler byte census seals only after successful extraction', () => {
  const f = setup();
  const create = sources.createRetainedTypeScriptSource;
  let captured: ReturnType<typeof create> | undefined;
  const admission = spyOn(sources, 'createRetainedTypeScriptSource').mockImplementation(
    (...args) => {
      captured = create(...args);
      return captured;
    },
  );
  try {
    const envelope = extractRetainedTypeScriptRelationships(f);
    expect(envelope.byteReads.entries).toContainEqual({
      namespace: 'candidate',
      path: 'tsconfig.json',
      revision: null,
      identity: hashBytes(
        JSON.stringify({ extends: './base.json', include: ['src/**/*.ts', 'globals.d.ts'] }),
      ),
      byteLength: 66,
    });
    expect(envelope.byteReads.entries.some((entry) => entry.path === 'parser.js')).toBe(false);
    expect(
      envelope.byteReads.entries.some((entry) => entry.path === 'node_modules/unused/index.d.ts'),
    ).toBe(false);
    expect(
      envelope.byteReads.entries.some((entry) => entry.path === 'node_modules/pkg/package.json'),
    ).toBe(true);
    if (captured === undefined) throw new Error('source absent');
    expect(sources.sealRetainedTypeScriptReads(captured)).toBe(envelope.byteReads);
    expect(() => captured?.readFile('/__puni_review__/candidate/tsconfig.json')).toThrow('sealed');
    expect(() =>
      extractRetainedTypeScriptRelationships({
        ...f,
        request: { ...f.request, configPaths: ['missing.json'] },
      }),
    ).toThrow();
    expect(captured.readFile('/__puni_review__/candidate/tsconfig.json')).toBeDefined();
  } finally {
    admission.mockRestore();
  }
});

const libraryNames = ['lib.es5.d.ts', 'lib.decorators.d.ts', 'lib.decorators.legacy.d.ts'] as const;
function readLibraries() {
  return Object.fromEntries(
    libraryNames.map((name) => {
      const bytes = fs.readFileSync(
        join(import.meta.dir, '../../../../../../node_modules/@typescript/old/lib', name),
      );
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      expect(Buffer.from(text)).toEqual(bytes);
      expect([...text.matchAll(/<reference lib="([^"]+)"/g)].map((match) => match[1])).toEqual(
        name === 'lib.es5.d.ts' ? ['decorators', 'decorators.legacy'] : [],
      );
      return [`node_modules/typescript/lib/${name}`, text];
    }),
  );
}
function expectLibraries(
  extracted: ReturnType<typeof extractRetainedTypeScriptRelationships>,
  libraries: Record<string, string>,
) {
  // Proof: library entry suppression/raw identity substitution/bypassed retained reads fail the exact library tuple assertion.
  expect(extracted.byteReads.entries.filter((entry) => entry.path.includes('/lib/'))).toEqual(
    Object.entries(libraries)
      .map(([path, text]) => ({
        namespace: 'runtime' as const,
        path,
        revision: null,
        identity: hashBytes(text),
        byteLength: Buffer.byteLength(text),
      }))
      .sort((a, b) =>
        Buffer.compare(Buffer.from(serializeCanonical(a)), Buffer.from(serializeCanonical(b))),
      ),
  );
}

for (const format of ['sha1', 'sha256'] as const)
  test(`retained ES5 compiler ${format} records exact pinned library bytes`, () => {
    const libraries = readLibraries();
    expect(
      Object.values(libraries).reduce((count, text) => count + Buffer.byteLength(text), 0),
    ).toBe(233412);
    const f = setup(format, '{}', undefined, undefined, libraries);
    const extracted = extractRetainedTypeScriptRelationships(f);
    expectLibraries(extracted, libraries);
    expect(extracted.byteReads.entries.some((entry) => entry.path === 'globals.d.ts')).toBe(false);
    expect(extracted.relationships.publicDeclarations[0]?.declarations.length).toBeGreaterThan(0);
  });

test('retained ES5 compiler exposes real standard library types', () => {
  const f = setup(
    'sha1',
    '{}',
    "export const names: ReadonlyArray<string> = ['es5']; export const epoch: Date = new Date(0);",
    undefined,
    readLibraries(),
  );
  const extracted = extractRetainedTypeScriptRelationships(f);
  expect(
    extracted.relationships.publicDeclarations[0]?.declarations.some((declaration) =>
      declaration.text.includes('ReadonlyArray<string>'),
    ),
  ).toBe(true);
  expect(
    extracted.relationships.publicDeclarations[0]?.declarations.some((declaration) =>
      declaration.text.includes('Date'),
    ),
  ).toBe(true);
});

test('retained ES5 compiler refuses each absent required library without ambient fallback', () => {
  for (const name of libraryNames) {
    const libraries = Object.fromEntries(
      Object.entries(readLibraries()).filter(
        ([path]) => path !== `node_modules/typescript/lib/${name}`,
      ),
    );
    const f = setup('sha1', '{}', undefined, undefined, libraries);
    const traps = [spyOn(fs, 'readFileSync'), spyOn(ts.sys, 'readFile')];
    for (const trap of traps)
      trap.mockImplementation(() => {
        throw new Error('forbidden library fallback');
      });
    try {
      expect(() => extractRetainedTypeScriptRelationships(f)).toThrow('compiler failed');
      for (const trap of traps) expect(trap).not.toHaveBeenCalled();
    } finally {
      for (const trap of traps) trap.mockRestore();
    }
  }
});

test('retained ES5 compiler ignores physical library mutation after capture', () => {
  const libraries = readLibraries();
  const f = setup('sha1', '{}', undefined, undefined, libraries);
  const before = extractRetainedTypeScriptRelationships(f);
  for (const path of Object.keys(libraries))
    fs.writeFileSync(join(f.runtimeRoot, path), 'broken physical library');
  const after = extractRetainedTypeScriptRelationships(f);
  expect(after).toEqual(before);
  expectLibraries(after, libraries);
});

test('retained ES5 compiler observes changed valid library bytes without relationship changes', () => {
  const libraries = readLibraries();
  const before = extractRetainedTypeScriptRelationships(
    setup('sha1', '{}', undefined, undefined, libraries),
  );
  const path = 'node_modules/typescript/lib/lib.es5.d.ts';
  const changed = {
    ...libraries,
    [path]: libraries[path] + '\n// retained byte identity change\n',
  };
  const after = extractRetainedTypeScriptRelationships(
    setup('sha1', '{}', undefined, undefined, changed),
  );
  expect(after.extractor).toEqual(before.extractor);
  expect(after.relationships).toEqual(before.relationships);
  expectLibraries(after, changed);
  expect(after.byteReads.entries.find((entry) => entry.path === path)?.identity).not.toBe(
    before.byteReads.entries.find((entry) => entry.path === path)?.identity,
  );
});

test('retained ES5 compiler includes library observations in read and envelope budgets', () => {
  const libraries = readLibraries();
  const f = setup('sha1', '{}', undefined, undefined, libraries);
  let acquiredBytes = 0;
  const candidateRead = f.candidate.read.bind(f.candidate);
  const runtimeRead = f.runtime.readFile.bind(f.runtime);
  const reads = [
    spyOn(f.candidate, 'read').mockImplementation((...args) => {
      const bytes = candidateRead(...args);
      acquiredBytes += bytes.byteLength;
      return bytes;
    }),
    spyOn(f.runtime, 'readFile').mockImplementation((...args) => {
      const bytes = runtimeRead(...args);
      acquiredBytes += bytes.byteLength;
      return bytes;
    }),
  ];
  let extracted: ReturnType<typeof extractRetainedTypeScriptRelationships>;
  try {
    extracted = extractRetainedTypeScriptRelationships(f);
  } finally {
    for (const read of reads) read.mockRestore();
  }
  expect(acquiredBytes).toBeGreaterThanOrEqual(233412);
  const envelopeBytes = Buffer.byteLength(serializeCanonical(extracted));
  const ledgerBytes = Buffer.byteLength(serializeCanonical(extracted.byteReads));
  const entryCount = extracted.byteReads.entries.length;
  for (const [name, exact] of [
    ['maximumReadBytes', acquiredBytes],
    ['maximumReadLedgerBytes', ledgerBytes],
    ['maximumReadEntries', entryCount],
  ] as const) {
    const exactFixture = setup('sha1', '{}', undefined, undefined, libraries);
    const exactExtraction = extractRetainedTypeScriptRelationships({
      ...exactFixture,
      sourceLimits: { ...exactFixture.sourceLimits, [name]: exact },
    });
    expect(exactExtraction.byteReads).toEqual(extracted.byteReads);
    expect(exactExtraction.relationships).toEqual(extracted.relationships);
    Bun.gc(true);
    const shortFixture = setup('sha1', '{}', undefined, undefined, libraries);
    expect(() =>
      extractRetainedTypeScriptRelationships({
        ...shortFixture,
        sourceLimits: { ...shortFixture.sourceLimits, [name]: exact - 1 },
      }),
    ).toThrow('source read');
    Bun.gc(true);
  }
  const compilerExact = setup('sha1', '{}', undefined, undefined, libraries);
  expect(
    extractRetainedTypeScriptRelationships({
      ...compilerExact,
      compilerLimits: { ...compilerExact.compilerLimits, maximumReadBytes: acquiredBytes },
    }).byteReads,
  ).toEqual(extracted.byteReads);
  Bun.gc(true);
  const compilerShort = setup('sha1', '{}', undefined, undefined, libraries);
  expect(() =>
    extractRetainedTypeScriptRelationships({
      ...compilerShort,
      compilerLimits: { ...compilerShort.compilerLimits, maximumReadBytes: acquiredBytes - 1 },
    }),
  ).toThrow('read byte limit');
  Bun.gc(true);
  // Proof: omitting whole-envelope byte accounting makes the one-byte-short library envelope succeed.
  expect(
    extractRetainedTypeScriptRelationships({
      ...f,
      requestLimits: { ...f.requestLimits, maximumOutputBytes: envelopeBytes },
    }),
  ).toEqual(extracted);
  const shortEnvelopeFixture = setup('sha1', '{}', undefined, undefined, libraries);
  expect(() =>
    extractRetainedTypeScriptRelationships({
      ...shortEnvelopeFixture,
      requestLimits: { ...f.requestLimits, maximumOutputBytes: envelopeBytes - 1 },
    }),
  ).toThrow('retained TypeScript output');
});
