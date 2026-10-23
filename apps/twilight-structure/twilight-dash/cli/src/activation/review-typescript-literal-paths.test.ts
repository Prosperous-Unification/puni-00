import * as fs from 'node:fs';
import { join } from 'node:path';

import { hashBytes, serializeCanonical } from '@twilight-burokrat/judge';
import { afterEach, expect, spyOn, test } from 'bun:test';
import ts from 'typescript';

// eslint-disable-next-line @nx/enforce-module-boundaries -- This oracle observes the compiler construction boundary before retained admission.
import * as compiler from '../../../../twilight-burokrat/cli/src/relationships/typescript-compiler';
import { createRetainedNamespace } from './review-namespace';
import { extractRetainedTypeScriptRelationships } from './review-typescript';
import * as sources from './review-typescript-source';
import { fixture } from './review-typescript-source.test.fixture';

afterEach(() => {
  Bun.gc(true);
});

const globals =
  'interface Array<T> {} interface Boolean {} interface Function {} interface CallableFunction {} interface NewableFunction {} interface IArguments {} interface Number {} interface Object {} interface RegExp {} interface String {}';
function setup(
  paths?: Readonly<Record<string, readonly string[]>>,
  options: {
    format?: 'sha1' | 'sha256';
    inherited?: Readonly<Record<string, readonly string[]>>;
    baseUrl?: string;
    links?: Record<string, string>;
    typeRoots?: string[];
    fallback?: boolean;
    specifier?: string;
    budget?: boolean;
    secondPaths?: Readonly<Record<string, readonly string[]>>;
  } = {},
) {
  const metadata = fs.readFileSync(
    join(import.meta.dir, '../../../../../../node_modules/typescript/package.json'),
    'utf8',
  );
  const captured = fixture(
    options.format,
    [
      'node_modules/typescript/package.json',
      'node_modules/pkg/package.json',
      'node_modules/pkg/index.d.ts',
      'parser.js',
    ],
    {
      'tsconfig.json': JSON.stringify({
        extends: './configs/base.json',
        compilerOptions: {
          ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
          ...(paths === undefined ? {} : { paths }),
          ...(options.typeRoots === undefined ? {} : { typeRoots: options.typeRoots }),
        },
        files: ['globals.d.ts', options.fallback ? 'src/index.ts' : 'index.ts'],
      }),
      'configs/base.json': JSON.stringify({
        compilerOptions: {
          noLib: true,
          strict: true,
          ignoreDeprecations: '6.0',
          types: [],
          ...(options.inherited === undefined ? {} : { paths: options.inherited }),
        },
      }),
      ...(options.secondPaths === undefined
        ? {}
        : {
            'second.json': JSON.stringify({
              compilerOptions: {
                noLib: true,
                types: [],
                ignoreDeprecations: '6.0',
                paths: options.secondPaths,
              },
              files: ['globals.d.ts', 'index.ts'],
            }),
          }),
      'globals.d.ts': globals,
      'src/index.ts': `export { provider } from '${options.specifier ?? 'provider'}';`,
      'src/provider.ts': "export const provider: 'retained' = 'retained';",
      'index.ts': options.budget
        ? 'export const value: number = 1;'
        : "export type { Package } from 'pkg'; export const value: number = 1;",
      'types/local/index.d.ts': 'interface LocalType {}',
      'configs/types/local/index.d.ts': 'interface InheritedType {}',
    },
    options.links ?? {},
    {
      'node_modules/typescript/package.json': metadata,
      'node_modules/pkg/package.json': '{"name":"pkg","version":"1.0.0","types":"index.d.ts"}',
      'node_modules/pkg/index.d.ts': 'export interface Package { value: number }',
      'parser.js': 'parser',
    },
  );
  return {
    ...captured,
    namespace: createRetainedNamespace(captured.candidate, captured.runtime, {
      maximumEntries: 100,
      maximumNodes: 100,
      maximumPathBytes: 8192,
      maximumTotalPathBytes: 20000,
    }),
    request: {
      configPaths: ['tsconfig.json'],
      publicEntrypoints: [options.fallback ? 'src/index.ts' : 'index.ts'],
    },
    sourceLimits: {
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
    },
    compilerLimits: {
      maximumProbes: 10000,
      maximumReadBytes: 1000000,
      maximumDirectoryEntries: 10000,
      maximumObservedOutputBytes: 1000000,
      maximumOutputBytes: 1000000,
    },
    requestLimits: {
      maximumConfigPaths: 10,
      maximumPublicEntrypoints: 10,
      maximumPathBytes: 1024,
      maximumTotalPathBytes: 10000,
      maximumOutputBytes: 1000000,
    },
  };
}

for (const [label, paths, inherited, links] of [
  ['absolute outside', { unused: ['/outside/types'] }, undefined, {}],
  ['relative outside', { unused: ['../outside/types'] }, undefined, {}],
  ['inherited outside', undefined, { unused: ['../../outside/types'] }, {}],
  ['wildcard key fixed outside', { '@unused/*': ['/outside/types'] }, undefined, {}],
  [
    'ancestor escape',
    { unused: ['./escape/types'] },
    undefined,
    { 'aliases/link': '../types', escape: 'aliases/link/../../types' },
  ],
  [
    'absent descendant escape',
    { unused: ['./escape/missing/deep'] },
    undefined,
    { 'aliases/link': '../types', escape: 'aliases/link/../../types' },
  ],
] as const)
  test(`retained literal paths refuses ${label} before host and owner`, () => {
    const captured = setup(paths === undefined ? undefined : { ...paths }, {
      inherited: inherited === undefined ? undefined : { ...inherited },
      links: { ...links },
    });
    const registered: object[] = [];
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Forward the dynamic WeakMap receiver below.
    const register = WeakMap.prototype.set;
    const registration = spyOn(WeakMap.prototype, 'set').mockImplementation(function (
      this: WeakMap<WeakKey, unknown>,
      key,
      value,
    ) {
      if (
        typeof key === 'object' &&
        typeof value === 'object' &&
        value !== null &&
        'request' in value &&
        'provenance' in value
      )
        registered.push(key);
      return register.call(this, key, value);
    });
    const seal = spyOn(sources, 'sealRetainedTypeScriptReads');
    const createHost = compiler.createCompilerHost;
    let hostCreations = 0;
    const host = spyOn(compiler, 'createCompilerHost').mockImplementation(
      (...args: Parameters<typeof compiler.createCompilerHost>) => {
        hostCreations++;
        return createHost(...args);
      },
    );
    try {
      expect(() => extractRetainedTypeScriptRelationships(captured)).toThrow(/outside|escape/);
      expect(hostCreations).toBe(0);
      expect(seal).not.toHaveBeenCalled();
      expect(registered).toHaveLength(0);
    } finally {
      host.mockRestore();
      seal.mockRestore();
      registration.mockRestore();
    }
  });

for (const [label, paths, inherited, links] of [
  ['inside missing', { unused: ['./missing/types'] }, undefined, {}],
  ['inside linked', { unused: ['./alias'] }, undefined, { alias: 'types' }],
  ['discarded outside', { local: ['./types'] }, { discarded: ['/outside'] }, {}],
  ['empty replacement', {}, { discarded: ['/outside'] }, {}],
  ['wildcard substitution untouched', { '@unused/*': ['/outside/*'] }, undefined, {}],
] as const)
  test(`retained literal paths admits ${label}`, () => {
    const extracted = extractRetainedTypeScriptRelationships(
      setup(
        { ...paths },
        { inherited: inherited === undefined ? undefined : { ...inherited }, links: { ...links } },
      ),
    );
    expect(extracted.runtimeTrust).toBe('unverified');
    expect(extracted.relationships.publicDeclarations).toHaveLength(1);
    for (const [path, target] of Object.entries(links))
      expect(extracted.byteReads.entries.find((entry) => entry.path === path)).toEqual({
        namespace: 'candidate',
        path,
        revision: null,
        identity: hashBytes(Buffer.from(target)),
        byteLength: Buffer.byteLength(target),
      });
  });

for (const [label, paths, inherited, baseUrl, specifier] of [
  [
    'exact fallback',
    { '@local/provider': ['./missing.ts', './src/provider.ts', './src/index.ts'] },
    undefined,
    undefined,
    '@local/provider',
  ],
  [
    'fixed wildcard target',
    { '@local/*': ['./src/provider.ts'] },
    undefined,
    undefined,
    '@local/provider',
  ],
  [
    'declaring origin',
    undefined,
    { '@local/provider': ['../src/provider.ts'] },
    undefined,
    '@local/provider',
  ],
  [
    'baseUrl replaces origin',
    undefined,
    { '@local/provider': ['./provider.ts'] },
    './src',
    '@local/provider',
  ],
] as const)
  test(`retained literal paths resolves ${label} with exact declarations and census`, () => {
    const captured = setup(paths === undefined ? undefined : { ...paths }, {
      inherited: inherited === undefined ? undefined : { ...inherited },
      baseUrl,
      fallback: true,
      specifier,
    });
    const extracted = extractRetainedTypeScriptRelationships(captured);
    expect(extracted.runtimeTrust).toBe('unverified');
    expect(extracted.relationships.imports).toMatchObject([
      { source: 'src/index.ts', specifier, target: 'src/provider.ts' },
    ]);
    expect(
      extracted.relationships.publicDeclarations[0]?.declarations.map(({ sourcePath, text }) => ({
        sourcePath,
        text,
      })),
    ).toEqual([
      { sourcePath: 'src/index.ts', text: `export { provider } from '${specifier}';\n` },
      { sourcePath: 'src/provider.ts', text: "export declare const provider: 'retained';\n" },
    ]);
    expect(
      extracted.byteReads.entries.map((entry) => `${entry.namespace}:${entry.path}`).sort(),
    ).toEqual(
      [
        'candidate:configs/base.json',
        'candidate:globals.d.ts',
        'candidate:src/index.ts',
        'candidate:src/provider.ts',
        'candidate:tsconfig.json',
        'runtime:node_modules/typescript/package.json',
      ].sort(),
    );
    expect(extracted.byteReads.entries.find((entry) => entry.path === 'src/provider.ts')).toEqual({
      namespace: 'candidate',
      path: 'src/provider.ts',
      revision: null,
      identity: hashBytes(Buffer.from("export const provider: 'retained' = 'retained';")),
      byteLength: Buffer.byteLength("export const provider: 'retained' = 'retained';"),
    });
  });

for (const format of ['sha1', 'sha256'] as const)
  test(`retained literal paths ${format} replays after physical roots disappear`, () => {
    const captured = setup(
      { '@local/provider': ['./alias/provider.ts'] },
      {
        format,
        fallback: true,
        specifier: '@local/provider',
        links: { alias: 'src' },
      },
    );
    const expected = extractRetainedTypeScriptRelationships(captured);
    expect(
      expected.byteReads.entries.find(
        (entry) => entry.namespace === 'candidate' && entry.path === 'alias',
      ),
    ).toEqual({
      namespace: 'candidate',
      path: 'alias',
      revision: null,
      identity: hashBytes(Buffer.from('src')),
      byteLength: 3,
    });
    fs.rmSync(captured.root, { recursive: true });
    const forbidden = (): never => {
      throw new Error('ambient literal paths lookup');
    };
    const physical = spyOn(fs, 'readFileSync').mockImplementation(forbidden);
    const original = { ...ts.sys };
    Object.assign(ts.sys, {
      readFile: forbidden,
      fileExists: forbidden,
      directoryExists: forbidden,
      getDirectories: forbidden,
      readDirectory: forbidden,
      realpath: forbidden,
      getCurrentDirectory: forbidden,
    });
    try {
      expect(() => fs.readFileSync('/ambient-canary')).toThrow('ambient literal paths lookup');
      expect(() => ts.sys.readFile('/ambient-canary')).toThrow('ambient literal paths lookup');
      expect(() => ts.sys.directoryExists('/ambient-canary')).toThrow(
        'ambient literal paths lookup',
      );
      expect(serializeCanonical(extractRetainedTypeScriptRelationships(captured))).toBe(
        serializeCanonical(expected),
      );
    } finally {
      physical.mockRestore();
      Object.assign(ts.sys, original);
    }
  });

for (const dimension of ['compiler', 'source', 'steps'] as const)
  test(`retained literal paths charges shared ${dimension} admission at exact fit`, () => {
    function minimum(paths?: Readonly<Record<string, readonly string[]>>): number {
      const key = dimension === 'steps' ? 'maximumSteps' : 'maximumProbes';
      function attempt(ceiling: number) {
        const captured = setup(paths, { typeRoots: ['types'], budget: true });
        const limits = dimension === 'compiler' ? captured.compilerLimits : captured.sourceLimits;
        Object.assign(limits, { [key]: ceiling });
        return extractRetainedTypeScriptRelationships(captured);
      }
      let lower = 1;
      let upper = 10000;
      while (lower < upper) {
        const ceiling = Math.floor((lower + upper) / 2);
        try {
          attempt(ceiling);
          upper = ceiling;
        } catch (cause) {
          let failure = cause;
          while (failure instanceof Error && !/probe|step/.test(failure.message))
            failure = failure.cause;
          if (!(failure instanceof Error) || !/probe|step/.test(failure.message)) throw cause;
          lower = ceiling + 1;
        }
        Bun.gc(true);
      }
      expect(attempt(lower).runtimeTrust).toBe('unverified');
      expect(() => attempt(lower - 1)).toThrow(/probe|step/);
      return lower;
    }
    const once = minimum();
    const repeated = minimum({ unused: ['./types', './types'] });
    if (dimension === 'steps') expect(repeated).toBeGreaterThan(once);
    else expect(repeated - once).toBe(2);
  });

test('retained literal paths refuses second project before its host and census publication', () => {
  const captured = setup({ unused: ['./types'] }, { secondPaths: { unused: ['/outside/target'] } });
  captured.request.configPaths.push('second.json');
  const createHost = compiler.createCompilerHost;
  let hostCreations = 0;
  const host = spyOn(compiler, 'createCompilerHost').mockImplementation(
    (...args: Parameters<typeof compiler.createCompilerHost>) => {
      hostCreations++;
      return createHost(...args);
    },
  );
  const seal = spyOn(sources, 'sealRetainedTypeScriptReads');
  try {
    expect(() => extractRetainedTypeScriptRelationships(captured)).toThrow(/outside/);
    expect(hostCreations).toBe(1);
    expect(seal).not.toHaveBeenCalled();
  } finally {
    host.mockRestore();
    seal.mockRestore();
  }
});

test('retained literal paths bounds long roots before source UTF8 encoding', () => {
  const captured = setup({ unused: ['./types/' + 'x'.repeat(3000)] });
  const original = Buffer.byteLength.bind(Buffer);
  let reached = false;
  const encoding = spyOn(Buffer, 'byteLength').mockImplementation((text, ...args) => {
    if (
      typeof text === 'string' &&
      text.startsWith('/__puni_review__/candidate/types/') &&
      text.length > 2048
    ) {
      reached = true;
      throw new Error('long root encoding reached');
    }
    return original(text, ...args);
  });
  try {
    expect(() => extractRetainedTypeScriptRelationships(captured)).toThrow(
      'source path ceiling exceeded',
    );
    expect(reached).toBe(false);
  } finally {
    encoding.mockRestore();
  }
});
