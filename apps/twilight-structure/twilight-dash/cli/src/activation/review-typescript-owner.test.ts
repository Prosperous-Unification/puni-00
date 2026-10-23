import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as judge from '@twilight-burokrat/judge';
import { serializeCanonical } from '@twilight-burokrat/judge';
import { expect, spyOn, test } from 'bun:test';

import { createRetainedNamespace, readRetainedNamespaceProvenance } from './review-namespace';
import * as extraction from './review-typescript';
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

function setup() {
  const metadata = readFileSync(
    join(import.meta.dir, '../../../../../../node_modules/typescript/package.json'),
    'utf8',
  );
  const captured = fixture(
    'sha1',
    ['node_modules/typescript/package.json', 'parser.js'],
    {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { noLib: true, types: [], strict: true },
        files: ['globals.d.ts', 'index.ts'],
      }),
      'globals.d.ts': globals,
      'index.ts': 'export const value: number = 1;',
    },
    {},
    { 'node_modules/typescript/package.json': metadata, 'parser.js': 'parser' },
  );
  return {
    ...captured,
    namespace: createRetainedNamespace(captured.candidate, captured.runtime, {
      maximumEntries: 100,
      maximumNodes: 100,
      maximumPathBytes: 2048,
      maximumTotalPathBytes: 20000,
    }),
    request: { configPaths: ['tsconfig.json'], publicEntrypoints: ['index.ts'] },
    sourceLimits: { ...sourceLimits },
    compilerLimits: { ...compilerLimits },
    requestLimits: { ...requestLimits },
  };
}

test('exact extraction owner rejects impostors without reading their properties', () => {
  const f = setup();
  const owned = extraction.extractRetainedTypeScriptRelationships(f);
  const binding = extraction.readRetainedTypeScriptExtractionProvenance(owned);
  expect(extraction.readRetainedTypeScriptExtractionProvenance(owned)).toBe(binding);
  expect(binding).toEqual({
    request: f.request,
    provenance: readRetainedNamespaceProvenance(f.namespace),
  });
  const poison = new Proxy(owned, {
    get() {
      throw new Error('getter reached');
    },
    getPrototypeOf() {
      throw new Error('prototype reached');
    },
  });
  const getter = Object.defineProperty({}, 'provenance', {
    get() {
      throw new Error('getter reached');
    },
  });
  for (const foreign of [
    null,
    undefined,
    false,
    1,
    'x',
    {},
    { ...owned },
    JSON.parse(JSON.stringify(owned)),
    Object.create(owned),
    poison,
    getter,
  ])
    expect(() => extraction.readRetainedTypeScriptExtractionProvenance(foreign)).toThrow(
      'owned retained TypeScript extraction required',
    );
});

test('exact extraction snapshots freeze before callbacks while caller inputs stay mutable', () => {
  const f = setup();
  const create = sources.createRetainedTypeScriptSource;
  const candidateFrozen = Object.isFrozen(f.candidate);
  const runtimeFrozen = Object.isFrozen(f.runtime);
  const compile = judge.extractTypeScriptRelationshipsFromSource;
  const compiler = spyOn(judge, 'extractTypeScriptRelationshipsFromSource').mockImplementation(
    (...args) => {
      expect(Object.isFrozen(args[1])).toBe(true);
      expect(Object.isFrozen(args[1].configPaths)).toBe(true);
      expect(Object.isFrozen(args[1].publicEntrypoints)).toBe(true);
      return compile(...args);
    },
  );
  let callbacks = 0;
  const admission = spyOn(sources, 'createRetainedTypeScriptSource').mockImplementation(
    (...args) => {
      callbacks++;
      f.request.configPaths[0] = 'missing.json';
      f.request.publicEntrypoints.push('missing.ts');
      return create(...args);
    },
  );
  try {
    const owned = extraction.extractRetainedTypeScriptRelationships(f);
    const binding = extraction.readRetainedTypeScriptExtractionProvenance(owned);
    expect(callbacks).toBe(1);
    expect(binding.request).toEqual({
      configPaths: ['tsconfig.json'],
      publicEntrypoints: ['index.ts'],
    });
    expect(Object.isFrozen(binding)).toBe(true);
    expect(Object.isFrozen(binding.request)).toBe(true);
    expect(Object.isFrozen(binding.request.configPaths)).toBe(true);
    expect(Object.isFrozen(binding.request.publicEntrypoints)).toBe(true);
    expect(Object.isFrozen(binding.provenance)).toBe(true);
    expect(binding.provenance).not.toBe(owned.provenance);
    expect(Object.isFrozen(f.request)).toBe(false);
    expect(Object.isFrozen(f.candidate)).toBe(candidateFrozen);
    expect(Object.isFrozen(f.runtime)).toBe(runtimeFrozen);
  } finally {
    admission.mockRestore();
    compiler.mockRestore();
  }
});

test('exact extraction deeply freezes envelope without changing enumerable canonical bytes', () => {
  const freeze = Object.freeze;
  let before: string | undefined;
  const freezing = spyOn(Object, 'freeze').mockImplementation(<T>(value: T): Readonly<T> => {
    if (
      typeof value === 'object' &&
      value !== null &&
      'relationships' in value &&
      'byteReads' in value
    )
      before = serializeCanonical(value);
    return freeze(value);
  });
  let owned: extraction.RetainedTypeScriptExtraction;
  try {
    owned = extraction.extractRetainedTypeScriptRelationships(setup());
  } finally {
    freezing.mockRestore();
  }
  if (before === undefined) throw new Error('pre-freeze envelope not observed');
  expect(before).toBe(serializeCanonical(owned));
  expect(Object.getOwnPropertySymbols(owned)).toHaveLength(0);
  expect(Object.keys(owned).sort()).toEqual([
    'byteReads',
    'extractor',
    'provenance',
    'relationships',
    'runtimeTrust',
  ]);
  const pending: unknown[] = [owned];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value !== 'object' || value === null) continue;
    expect(Object.isFrozen(value)).toBe(true);
    expect(() => Object.defineProperty(value, 'injected', { value: true })).toThrow();
    const children: unknown[] = Object.values(value);
    pending.push(...children);
  }
  expect(serializeCanonical(owned)).toBe(before);
  expect(owned.runtimeTrust).toBe('unverified');
});

test('exact extraction registers only after compiler cap and freeze succeed', () => {
  const f = setup();
  const owned = extraction.extractRetainedTypeScriptRelationships(f);
  const exact = Buffer.byteLength(serializeCanonical(owned));
  expect(
    extraction.extractRetainedTypeScriptRelationships({
      ...f,
      requestLimits: { ...f.requestLimits, maximumOutputBytes: exact },
    }),
  ).toEqual(owned);
  const registered: object[] = [];
  // eslint-disable-next-line @typescript-eslint/unbound-method -- The spy forwards its dynamic WeakMap receiver with call below.
  const original = WeakMap.prototype.set;
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
    return original.call(this, key, value);
  });
  const freeze = Object.freeze;
  try {
    expect(() =>
      extraction.extractRetainedTypeScriptRelationships({
        ...f,
        request: { ...f.request, configPaths: ['missing.json'] },
      }),
    ).toThrow();
    expect(() =>
      extraction.extractRetainedTypeScriptRelationships({
        ...f,
        requestLimits: { ...f.requestLimits, maximumOutputBytes: exact - 1 },
      }),
    ).toThrow('output ceiling');
    const freezing = spyOn(Object, 'freeze').mockImplementation(<T>(value: T): Readonly<T> => {
      if (
        typeof value === 'object' &&
        value !== null &&
        'relationships' in value &&
        'byteReads' in value
      )
        throw new Error('injected envelope freeze failure');
      return freeze(value);
    });
    try {
      expect(() => extraction.extractRetainedTypeScriptRelationships(f)).toThrow(
        'injected envelope freeze failure',
      );
    } finally {
      freezing.mockRestore();
    }
    for (const attempted of registered)
      expect(() => extraction.readRetainedTypeScriptExtractionProvenance(attempted)).toThrow(
        'owned retained TypeScript extraction required',
      );
    expect(registered).toHaveLength(0);
  } finally {
    registration.mockRestore();
  }
});

/** Compile-only witnesses: the function is deliberately never invoked. */
export function proveExtractionTypes(owned: extraction.RetainedTypeScriptExtraction) {
  // @ts-expect-error The successful extraction has an opaque private brand.
  const reconstructed: extraction.RetainedTypeScriptExtraction = {
    runtimeTrust: owned.runtimeTrust,
    provenance: owned.provenance,
    byteReads: owned.byteReads,
    extractor: owned.extractor,
    relationships: owned.relationships,
  };
  // @ts-expect-error Envelope fields are readonly.
  owned.runtimeTrust = 'unverified';
  // @ts-expect-error Relationship arrays are deeply readonly.
  owned.relationships.publicDeclarations.length = 0;
  // @ts-expect-error Census arrays are deeply readonly.
  owned.byteReads.entries.length = 0;
  const binding = extraction.readRetainedTypeScriptExtractionProvenance(owned);
  // @ts-expect-error Private request snapshots are deeply readonly.
  binding.request.configPaths.length = 0;
  return reconstructed;
}
