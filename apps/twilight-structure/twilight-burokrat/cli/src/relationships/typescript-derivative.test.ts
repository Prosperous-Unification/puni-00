import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, spyOn, test } from 'bun:test';
import ts from 'typescript';

import { captureCompilerDerivative } from './compiler-derivative-artifact';
import {
  createLimits,
  createMembers,
  readLibrary,
} from './compiler-derivative-fixture.test-support';
import { fixture, limits, request, workspace } from './typescript.test.fixture';
import {
  extractTypeScriptRelationshipsFromSource,
  runTypeScriptExtraction,
} from './typescript-core';
import type * as DerivativeModule from './typescript-derivative';
import {
  extractDerivativeTypeScriptPrerequisite,
  readDerivativeTypeScriptBinding,
} from './typescript-derivative';
import expected from './typescript-derivative.expected.json';
import type { TypeScriptExecution } from './typescript-execution';
import { extractSerialRelationships } from './typescript-serial';

const expectObservation = (value: unknown) => expect(value);

const executionIdentity = '5c0c6d82bf82918032bdf831a69dddce02571fdacd03df5b8d1d77af076f9d8d';
const artifactIdentity = '2eff9728f5e5fbd7c53fde8571254e7865df0664c7b0a9f55eecf698778b0c62';
const artifact = () => captureCompilerDerivative(createMembers(), createLimits());
afterEach(() => {
  Bun.gc(true);
});
function canonical(value: unknown): string {
  return (
    JSON.stringify(value, (_key, field: unknown) =>
      field !== null && typeof field === 'object' && !Array.isArray(field)
        ? Object.fromEntries(
            Object.entries(field).sort(([left], [right]) =>
              left < right ? -1 : left > right ? 1 : 0,
            ),
          )
        : field,
    ) + '\n'
  );
}
const independentHash = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
const families = ['imports', 'reverseEdges', 'publicDeclarations'] as const;
for (const family of families)
  test(`derivative identity reaches ${family} before selector hashing`, () => {
    const owned = artifact();
    const extraction = extractDerivativeTypeScriptPrerequisite(
      workspace,
      request,
      fixture().source,
      limits,
      owned,
    );
    expect(extraction.relationships[family][0]?.identity).toBe(
      expected.derivative.relationships[family][0]?.identity,
    );
    expectObservation(extraction.relationships[family]).toEqual(
      expected.derivative.relationships[family],
    );
    expect(extraction.extractor).toEqual(expected.derivative.extractor);
  });
for (const family of families)
  test(`selector preimage ${family} is independently bound`, () => {
    const extraction = extractDerivativeTypeScriptPrerequisite(
      workspace,
      request,
      fixture().source,
      limits,
      artifact(),
    );
    for (const selector of extraction.relationships[family]) {
      const { identity, ...preimage } = selector;
      expect(identity).toBe(independentHash(preimage));
    }
  });
test('actual core execution pins complete provenance and bypasses wrapper package identity', () => {
  const { source } = fixture();
  const read = source.readFile;
  source.readFile = (path) => {
    if (path.endsWith('/node_modules/typescript/package.json'))
      throw new Error('wrapper identity accessed');
    return read(path);
  };
  const owned = artifact();
  const extraction = extractDerivativeTypeScriptPrerequisite(
    workspace,
    request,
    source,
    limits,
    owned,
  );
  expect(independentHash(expected.configuration)).toBe(
    '4fed7305d69eb0ce076391dc7260f4ed79d926b48db682b1b5bd45c007fd420d',
  );
  expect(independentHash(expected.provenance.artifact)).toBe(artifactIdentity);
  expect(independentHash(expected.provenance.execution)).toBe(executionIdentity);
  expect(createHash('sha256').update(expected.provenance.loaderPolicyRecipe).digest('hex')).toBe(
    expected.provenance.execution.loaderPolicyIdentity,
  );
  expectObservation(extraction.compiler.members).toEqual(expected.provenance.artifact.members);
  expect(extraction.compiler.compilerArtifactIdentity).toBe(
    independentHash(expected.provenance.artifact),
  );
  expect(extraction.compiler.compilerExecutionIdentity).toBe(
    independentHash(expected.provenance.execution),
  );
  expect(extraction.compiler.loaderPolicyIdentity).toBe(
    'd3a0a1bb071f7b6fb1b2892e45c06eaba82880a02aa108bf4c57a52be8b9a9df',
  );
  expect(extraction).toMatchObject({
    schemaVersion: 1,
    kind: 'typescript-derivative-prerequisite',
    runtimeTrust: 'unverified',
    request,
    extractor: expected.derivative.extractor,
  });
  expect(readDerivativeTypeScriptBinding(extraction, owned)).toEqual({
    request,
    compiler: extraction.compiler,
  });
});
test('selected and serial complete legacy output is unchanged and differs from derivative', () => {
  const selected = extractTypeScriptRelationshipsFromSource(
    workspace,
    request,
    fixture().source,
    limits,
    ts,
  );
  expectObservation(selected).toEqual(expected.legacy);
  expectObservation(extractSerialRelationships(workspace, request, fixture().source, ts)).toEqual(
    expected.legacy,
  );
  expect(selected.extractor).not.toEqual(expected.derivative.extractor);
});
test('explicit ES5 library uses actual derivative core and preserves semantic families', () => {
  const overrides = {
    'tsconfig.json': JSON.stringify({
      compilerOptions: { lib: ['es5'], types: [], module: 'esnext' },
      files: ['src/index.ts'],
    }),
    'node_modules/@typescript/old/lib/lib.es5.d.ts': readLibrary('lib.es5.d.ts'),
    'node_modules/@typescript/old/lib/lib.decorators.d.ts': readLibrary('lib.decorators.d.ts'),
    'node_modules/@typescript/old/lib/lib.decorators.legacy.d.ts': readLibrary(
      'lib.decorators.legacy.d.ts',
    ),
  };
  const extraction = extractDerivativeTypeScriptPrerequisite(
    workspace,
    request,
    fixture(overrides).source,
    { ...limits, maximumReadBytes: 10_000_000 },
    artifact(),
  );
  expect(
    extraction.relationships.imports.map(({ source, target }) => ({ source, target })),
  ).toEqual([{ source: 'src/index.ts', target: 'src/value.ts' }]);
  for (const family of families)
    for (const selector of extraction.relationships[family]) {
      const { identity, ...preimage } = selector;
      expect(identity).toBe(independentHash(preimage));
      expect(selector.extractor).toEqual(expected.derivative.extractor);
    }
});
test('whole envelope exact cap includes request and execution provenance', () => {
  const extraction = extractDerivativeTypeScriptPrerequisite(
    workspace,
    request,
    fixture().source,
    limits,
    artifact(),
  );
  const bytes = Buffer.byteLength(canonical(extraction));
  expect(() =>
    extractDerivativeTypeScriptPrerequisite(
      workspace,
      request,
      fixture().source,
      { ...limits, maximumOutputBytes: bytes },
      artifact(),
    ),
  ).not.toThrow();
  expect(() =>
    extractDerivativeTypeScriptPrerequisite(
      workspace,
      request,
      fixture().source,
      { ...limits, maximumOutputBytes: bytes - 1 },
      artifact(),
    ),
  ).toThrow('TypeScript derivative output byte limit exceeded');
});
test('output and every selector child are deeply frozen and privately owned', () => {
  const owned = artifact();
  const extraction = extractDerivativeTypeScriptPrerequisite(
    workspace,
    request,
    fixture().source,
    limits,
    owned,
  );
  const pending: object[] = [extraction];
  for (const value of pending) {
    expect(Object.isFrozen(value)).toBe(true);
    const children: unknown[] = Object.values(value);
    for (const child of children)
      if (child !== null && typeof child === 'object') pending.push(child);
  }
  let reads = 0;
  for (const forged of [
    {},
    { ...extraction },
    new Proxy(extraction, {
      get() {
        reads++;
        throw new Error('token property read');
      },
    }),
  ])
    expect(() => readDerivativeTypeScriptBinding(forged, owned)).toThrow(
      'owned derivative TypeScript extraction required',
    );
  expect(reads).toBe(0);
  expect(() => readDerivativeTypeScriptBinding(extraction, artifact())).toThrow(
    'owned derivative TypeScript extraction required',
  );
});
test('request and finite limits are captured once before source callbacks mutate them', () => {
  const selection = {
    configPaths: [...request.configPaths],
    publicEntrypoints: [...request.publicEntrypoints],
  };
  const policy = { ...limits };
  const { source } = fixture();
  const read = source.readFile;
  source.readFile = (path) => {
    selection.configPaths[0] = 'missing.json';
    selection.publicEntrypoints[0] = 'missing.ts';
    policy.maximumOutputBytes = 0;
    return read(path);
  };
  const owned = artifact();
  const extraction = extractDerivativeTypeScriptPrerequisite(
    workspace,
    selection,
    source,
    policy,
    owned,
  );
  expect(extraction.request).toEqual(request);
  expectObservation(extraction.relationships).toEqual(expected.derivative.relationships);
  expect(readDerivativeTypeScriptBinding(extraction, owned).request).toEqual(request);
});
test('limit and request getters read once and invalid bounds refuse before source access', () => {
  const policy = { ...limits };
  const reads: Record<string, number> = {};
  for (const name of Object.keys(policy) as (keyof typeof policy)[]) {
    const value = policy[name];
    Object.defineProperty(policy, name, {
      get() {
        reads[name] = (reads[name] ?? 0) + 1;
        if (reads[name] > 1) throw new Error('limit reread');
        return value;
      },
    });
  }
  const selection = {
    get configPaths() {
      reads['configPaths'] = (reads['configPaths'] ?? 0) + 1;
      return request.configPaths;
    },
    get publicEntrypoints() {
      reads['publicEntrypoints'] = (reads['publicEntrypoints'] ?? 0) + 1;
      return request.publicEntrypoints;
    },
  };
  extractDerivativeTypeScriptPrerequisite(
    workspace,
    selection,
    fixture().source,
    policy,
    artifact(),
  );
  expect(Object.values(reads).every((count) => count === 1)).toBe(true);
  const { source } = fixture();
  source.readFile = () => {
    throw new Error('source before limit validation');
  };
  expect(() =>
    extractDerivativeTypeScriptPrerequisite(
      workspace,
      request,
      source,
      { ...limits, maximumOutputBytes: NaN },
      artifact(),
    ),
  ).toThrow('TypeScript maximumOutputBytes must be a nonnegative safe integer');
});

test('failed compiler cap and freeze never register output', () => {
  const owned = artifact();
  const complete = extractDerivativeTypeScriptPrerequisite(
    workspace,
    request,
    fixture().source,
    limits,
    owned,
  );
  const exact = Buffer.byteLength(canonical(complete));
  const registered: object[] = [];
  // eslint-disable-next-line @typescript-eslint/unbound-method -- The spy forwards the original dynamic WeakMap receiver.
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
      'artifact' in value &&
      'metadata' in value
    )
      registered.push(key);
    return original.call(this, key, value);
  });
  const freeze = Object.freeze;
  try {
    expect(() =>
      extractDerivativeTypeScriptPrerequisite(
        workspace,
        { ...request, configPaths: ['missing.json'] },
        fixture().source,
        limits,
        owned,
      ),
    ).toThrow('TypeScript config absent');
    expect(() =>
      extractDerivativeTypeScriptPrerequisite(
        workspace,
        request,
        fixture().source,
        { ...limits, maximumOutputBytes: exact - 1 },
        owned,
      ),
    ).toThrow('TypeScript derivative output byte limit exceeded');
    const freezing = spyOn(Object, 'freeze').mockImplementation(<T>(value: T): Readonly<T> => {
      if (
        typeof value === 'object' &&
        value !== null &&
        'relationships' in value &&
        'compiler' in value
      )
        throw new Error('injected derivative freeze failure');
      return freeze(value);
    });
    try {
      expect(() =>
        extractDerivativeTypeScriptPrerequisite(
          workspace,
          request,
          fixture().source,
          limits,
          owned,
        ),
      ).toThrow('injected derivative freeze failure');
    } finally {
      freezing.mockRestore();
    }
    for (const attempted of registered)
      expect(() => readDerivativeTypeScriptBinding(attempted, owned)).toThrow(
        'owned derivative TypeScript extraction required',
      );
    expect(registered).toHaveLength(0);
  } finally {
    registration.mockRestore();
  }
});
test('request array length and each indexed getter are captured once', () => {
  const reads: Record<string, number> = {};
  const paths = (name: string, values: string[]) =>
    new Proxy(values, {
      get(target, key, receiver) {
        if (key === 'length' || key === '0') {
          const label = name + key;
          reads[label] = (reads[label] ?? 0) + 1;
          if (reads[label] > 1) throw new Error('request element reread');
        }
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
  const extraction = extractDerivativeTypeScriptPrerequisite(
    workspace,
    {
      configPaths: paths('config', request.configPaths),
      publicEntrypoints: paths('public', request.publicEntrypoints),
    },
    fixture().source,
    limits,
    artifact(),
  );
  expect(extraction.request).toEqual(request);
  expect(Object.values(reads).every((count) => count === 1)).toBe(true);
});
test('request array and sparse path guards refuse before compiler execution', () => {
  const owned = artifact();
  expect(() =>
    extractDerivativeTypeScriptPrerequisite(
      workspace,
      { configPaths: null as unknown as string[], publicEntrypoints: [] },
      fixture().source,
      limits,
      owned,
    ),
  ).toThrow('TypeScript derivative request arrays required');
  expect(() =>
    extractDerivativeTypeScriptPrerequisite(
      workspace,
      { configPaths: new Array<string>(1), publicEntrypoints: [] },
      fixture().source,
      limits,
      owned,
    ),
  ).toThrow('TypeScript derivative request path missing');
});
test('request count refuses before indexed getter and byte bound before accumulation', () => {
  const owned = artifact();
  const paths = new Proxy(['one', 'two'], {
    get(target, key, receiver) {
      if (key === '0') throw new Error('indexed read before count admission');
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
  expect(() =>
    extractDerivativeTypeScriptPrerequisite(
      workspace,
      { configPaths: paths, publicEntrypoints: [] },
      fixture().source,
      { ...limits, maximumOutputBytes: 1 },
      owned,
    ),
  ).toThrow('TypeScript derivative request byte limit exceeded');
  const push = Array.prototype.push;
  const accumulating = spyOn(Array.prototype, 'push').mockImplementation(function (
    this: unknown[],
    ...values: unknown[]
  ) {
    if (values.includes('TOOLONG')) throw new Error('request accumulated before byte admission');
    return push.apply(this, values);
  });
  try {
    expect(() =>
      extractDerivativeTypeScriptPrerequisite(
        workspace,
        { configPaths: ['TOOLONG'], publicEntrypoints: [] },
        fixture().source,
        { ...limits, maximumOutputBytes: 4 },
        owned,
      ),
    ).toThrow('TypeScript derivative request byte limit exceeded');
  } finally {
    accumulating.mockRestore();
  }
});
test('unknown execution branch refuses instead of selecting any runtime identity', () => {
  const { source } = fixture();
  source.readFile = () => {
    throw new Error('source identity read before selection');
  };
  expect(() =>
    runTypeScriptExtraction(
      workspace,
      request,
      source,
      { kind: 'bounded', limits },
      { kind: 'unknown', compiler: ts } as unknown as TypeScriptExecution,
      'compatible',
    ),
  ).toThrow('TypeScript execution selection invalid');
});

test('authenticated namespace reaches actual core program construction', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'derivative-core-namespace-'));
  try {
    const rewrite = (source: string, base: string, loader?: string) =>
      source.replace(
        /from '(\.{1,2}\/[^']+)'/g,
        (_match: string, path: string) =>
          `from '${path === './compiler-derivative-runtime' && loader !== undefined ? loader : new URL(path + '.ts', base).pathname}'`,
      );
    const runtimeUrl = new URL('./compiler-derivative-runtime.ts', import.meta.url);
    const runtime = await readFile(runtimeUrl, 'utf8');
    const site = 'lifetime.compiler = requireCompiler(';
    expect(runtime.split(site)).toHaveLength(2);
    const corrupted = runtime.replace(
      site,
      `new Script("module.exports = new Proxy(module.exports,{get:(target,key)=>key==='createProgram'?()=>{throw new Error('owned derivative core sentinel');}:Reflect.get(target,key)});").runInContext(lifetime.context,{timeout:remaining()});\n      lifetime.compiler = requireCompiler(`,
    );
    const runtimePath = join(directory, 'runtime.ts');
    await writeFile(runtimePath, rewrite(corrupted, runtimeUrl.href));
    const compositionUrl = new URL('./typescript-derivative.ts', import.meta.url);
    await writeFile(
      join(directory, 'derivative.ts'),
      rewrite(await readFile(compositionUrl, 'utf8'), compositionUrl.href, runtimePath),
    );
    const composition = (await import(join(directory, 'derivative.ts'))) as typeof DerivativeModule;
    expect(() =>
      composition.extractDerivativeTypeScriptPrerequisite(
        workspace,
        request,
        fixture().source,
        limits,
        artifact(),
      ),
    ).toThrow('owned derivative core sentinel');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid captured request lengths refuse before loading', () => {
  const owned = artifact();
  for (const length of [NaN, -1, 0.5, Infinity]) {
    const configPaths = new Proxy(request.configPaths, {
      get(target, key, receiver) {
        return key === 'length' ? length : (Reflect.get(target, key, receiver) as unknown);
      },
    });
    expect(() =>
      extractDerivativeTypeScriptPrerequisite(
        workspace,
        { configPaths, publicEntrypoints: [] },
        fixture().source,
        limits,
        owned,
      ),
    ).toThrow('TypeScript derivative request length invalid');
  }
});
