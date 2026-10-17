import * as fs from 'node:fs';
import { join } from 'node:path';

import { hashBytes, serializeCanonical } from '@twilight-burokrat/judge';
import { expect, spyOn, test } from 'bun:test';
import ts from 'typescript';

// eslint-disable-next-line @nx/enforce-module-boundaries -- This oracle observes the compiler construction boundary before retained admission.
import * as compiler from '../../../../twilight-burokrat/cli/src/relationships/typescript-compiler';
import { createRetainedNamespace } from './review-namespace';
import { extractRetainedTypeScriptRelationships } from './review-typescript';
import * as sources from './review-typescript-source';
import { fixture } from './review-typescript-source.test.fixture';

const globals =
  'interface Array<T> {} interface Boolean {} interface Function {} interface CallableFunction {} interface NewableFunction {} interface IArguments {} interface Number {} interface Object {} interface RegExp {} interface String {}';
function setup(
  roots?: string[],
  options: {
    format?: 'sha1' | 'sha256';
    inherited?: string[];
    links?: Record<string, string>;
    types?: string[] | null;
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
      'node_modules/@types/ambient/package.json',
      'node_modules/@types/ambient/index.d.ts',
      'parser.js',
    ],
    {
      'tsconfig.json': JSON.stringify({
        extends: './configs/base.json',
        compilerOptions: roots === undefined ? {} : { typeRoots: roots },
        files: ['globals.d.ts', 'index.ts'],
      }),
      'configs/base.json': JSON.stringify({
        compilerOptions: {
          noLib: true,
          strict: true,
          ...(options.types === null ? {} : { types: options.types ?? [] }),
          ...(options.inherited === undefined ? {} : { typeRoots: options.inherited }),
        },
      }),
      'globals.d.ts': globals,
      'index.ts':
        "export type { Package } from 'pkg'; export const value: number = 1;" +
        (options.types?.includes('*')
          ? " export const marker: AmbientMarker = { tag: 'ambient' };"
          : ''),
      'types/local/index.d.ts': 'interface LocalType {}',
      'configs/types/local/index.d.ts': 'interface InheritedType {}',
    },
    options.links ?? {},
    {
      'node_modules/typescript/package.json': metadata,
      'node_modules/pkg/package.json': '{"name":"pkg","version":"1.0.0","types":"index.d.ts"}',
      'node_modules/pkg/index.d.ts': 'export interface Package { value: number }',
      'node_modules/@types/ambient/package.json':
        '{"name":"@types/ambient","version":"1.0.0","types":"index.d.ts"}',
      'node_modules/@types/ambient/index.d.ts': 'interface AmbientMarker { tag: string }',
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
    request: { configPaths: ['tsconfig.json'], publicEntrypoints: ['index.ts'] },
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

for (const [label, roots, inherited, links] of [
  ['absolute outside', ['/outside/types'], undefined, {}],
  ['relative outside', ['../outside/types'], undefined, {}],
  ['inherited outside', undefined, ['../../outside/types'], {}],
  [
    'ancestor escape',
    ['escape/types'],
    undefined,
    { 'aliases/link': '../types', escape: 'aliases/link/../../types' },
  ],
  [
    'absent escape descendant',
    ['escape/absent/deep'],
    undefined,
    { 'aliases/link': '../types', escape: 'aliases/link/../../types' },
  ],
] as const)
  test(`retained effective typeRoots refuses ${label} before program with types empty`, () => {
    const captured = setup(roots === undefined ? undefined : [...roots], {
      inherited: inherited === undefined ? undefined : [...inherited],
      links: { ...links },
    });
    const registered: object[] = [];
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Forward the dynamic WeakMap receiver with call below.
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

for (const [label, roots, inherited, links] of [
  ['existing', ['types'], undefined, {}],
  ['missing', ['missing/types'], undefined, {}],
  ['inherited', undefined, ['./types'], {}],
  ['override discarded outside', ['types'], ['../../outside'], {}],
  ['valid candidate link', ['alias'], undefined, { alias: 'types' }],
  ['omitted ordinary probes', undefined, undefined, {}],
] as const)
  test(`retained effective typeRoots admits ${label}`, () => {
    const captured = setup(roots === undefined ? undefined : [...roots], {
      inherited: inherited === undefined ? undefined : [...inherited],
      links: { ...links },
    });
    const extracted = extractRetainedTypeScriptRelationships(captured);
    expect(extracted.runtimeTrust).toBe('unverified');
    expect(extracted.relationships.publicDeclarations).toHaveLength(1);
    expect(
      extracted.byteReads.entries.map((entry) => `${entry.namespace}:${entry.path}`).sort(),
    ).toEqual(
      [
        'candidate:configs/base.json',
        'candidate:globals.d.ts',
        'candidate:index.ts',
        'candidate:tsconfig.json',
        'runtime:node_modules/pkg/index.d.ts',
        'runtime:node_modules/pkg/package.json',
        'runtime:node_modules/typescript/package.json',
        ...Object.keys(links).map((path) => `candidate:${path}`),
      ].sort(),
    );
  });

for (const format of ['sha1', 'sha256'] as const)
  test(`retained effective typeRoots ${format} replays after physical roots disappear`, () => {
    const captured = setup(['types', 'missing/types', './types', 'alias'], {
      format,
      links: { alias: 'types' },
    });
    const expected = extractRetainedTypeScriptRelationships(captured);
    expect(
      expected.byteReads.entries.find(
        (entry) => entry.namespace === 'candidate' && entry.path === 'alias',
      ),
    ).toEqual({
      namespace: 'candidate',
      path: 'alias',
      revision: null,
      identity: hashBytes(Buffer.from('types')),
      byteLength: 5,
    });
    fs.rmSync(captured.root, { recursive: true });
    const forbidden = (): never => {
      throw new Error('ambient typeRoots lookup');
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
      expect(() => fs.readFileSync('/ambient-canary')).toThrow('ambient typeRoots lookup');
      expect(() => ts.sys.readFile('/ambient-canary')).toThrow('ambient typeRoots lookup');
      expect(() => ts.sys.directoryExists('/ambient-canary')).toThrow('ambient typeRoots lookup');
      expect(serializeCanonical(extractRetainedTypeScriptRelationships(captured))).toBe(
        serializeCanonical(expected),
      );
    } finally {
      physical.mockRestore();
      Object.assign(ts.sys, original);
    }
  });

test('retained effective typeRoots bounds long roots before source UTF8 encoding', () => {
  const captured = setup(['types/' + 'x'.repeat(3000)]);
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

for (const dimension of ['compiler', 'source', 'steps'] as const)
  test(`retained effective typeRoots charges repeated ${dimension} admission at exact fit`, () => {
    function minimum(roots: string[]): number {
      const key = dimension === 'steps' ? 'maximumSteps' : 'maximumProbes';
      function attempt(ceiling: number) {
        const captured = setup(roots);
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
    const once = minimum(['types']);
    const repeated = minimum(['types', './types', 'types']);
    if (dimension === 'steps') expect(repeated).toBeGreaterThan(once);
    else expect(repeated - once).toBe(2);
  });

test('retained omitted typeRoots wildcard types discover visible ambient declarations', () => {
  const captured = setup(undefined, { types: ['*'] });
  const extracted = extractRetainedTypeScriptRelationships(captured);
  expect(extracted.runtimeTrust).toBe('unverified');
  expect(extracted.byteReads.entries.map((entry) => entry.path)).toContain(
    'node_modules/@types/ambient/index.d.ts',
  );
  expect(
    extracted.relationships.publicDeclarations[0]?.declarations
      .map((declaration) => declaration.text)
      .join('\n'),
  ).toContain('marker: AmbientMarker');
});

test('retained omitted typeRoots and types preserve pinned no auto discovery', () => {
  const captured = setup(undefined, { types: null });
  const extracted = extractRetainedTypeScriptRelationships(captured);
  expect(extracted.runtimeTrust).toBe('unverified');
  expect(extracted.byteReads.entries.map((entry) => entry.path)).not.toContain(
    'node_modules/@types/ambient/index.d.ts',
  );
});
