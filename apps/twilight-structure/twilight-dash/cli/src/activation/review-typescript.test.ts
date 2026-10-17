import * as fs from 'node:fs';
import { join } from 'node:path';

import { serializeCanonical } from '@twilight-burokrat/judge';
import { expect, spyOn, test } from 'bun:test';
import ts from 'typescript';

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
) {
  const metadata = fs.readFileSync(
    join(import.meta.dir, '../../../../../../node_modules/typescript/package.json'),
    'utf8',
  );
  const content = {
    'node_modules/typescript/package.json': metadata,
    'node_modules/pkg/package.json': JSON.stringify({
      name: 'pkg',
      version: '1.0.0',
      types: 'index.d.ts',
    }),
    'node_modules/pkg/index.d.ts': 'export interface PackageType { title: string }',
    'parser.js': 'parser',
  };
  const f = fixture(
    format,
    Object.keys(content),
    {
      'tsconfig.json': JSON.stringify({
        extends: './base.json',
        include: ['src/**/*.ts', 'globals.d.ts'],
        ...JSON.parse(config),
      }),
      'base.json': JSON.stringify({
        compilerOptions: {
          noLib: true,
          types: [],
          strict: true,
          module: 'esnext',
          moduleResolution: 'bundler',
          baseUrl: '.',
          ignoreDeprecations: '6.0',
          paths: { '@local/*': ['src/*'] },
        },
      }),
      'globals.d.ts': globals,
      'src/index.ts': entry,
      'src/provider.ts': provider,
      'src/consumer.ts': "import { value } from '@local/provider'; export const copy = value;",
      '\ufffd.ts': 'export {};',
    },
    {},
    content,
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
  test(`retained compiler ${format} matches legacy after all capture roots disappear`, () => {
    const f = setup(format);
    // The legacy recipe needs old's matching metadata even with noLib. Both paths use identical compiler identity bytes.
    fs.mkdirSync(join(f.runtimeRoot, 'node_modules/@typescript/old/lib'), { recursive: true });
    fs.writeFileSync(
      join(f.runtimeRoot, 'node_modules/@typescript/old/package.json'),
      fs.readFileSync(
        join(import.meta.dir, '../../../../../../node_modules/@typescript/old/package.json'),
        'utf8',
      ),
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
