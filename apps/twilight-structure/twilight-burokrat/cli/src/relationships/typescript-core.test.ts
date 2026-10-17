import * as child from 'node:child_process';
import commonFs, * as fs from 'node:fs';

import { expect, spyOn, test } from 'bun:test';
import ts from 'typescript';

import { fixture, globals, limits, request, workspace } from './typescript.test.fixture';
import { extractTypeScriptRelationshipsFromSource, type TypeScriptLimits } from './typescript-core';

function forbidAmbient<T>(extract: () => T): T {
  const forbidden = (): never => {
    throw new Error('forbidden ambient IO or execution');
  };
  const rejectCommonRead = (): never => {
    throw new Error('forbidden ambient CommonJS filesystem read');
  };
  const rejectCommonWrite = (): never => {
    throw new Error('forbidden ambient CommonJS filesystem write');
  };
  const system = { ...ts.sys };
  const environment = process.env;
  const spies = [
    spyOn(fs, 'readFileSync').mockImplementation(forbidden),
    spyOn(fs, 'existsSync').mockImplementation(forbidden),
    spyOn(fs, 'statSync').mockImplementation(forbidden),
    spyOn(fs, 'lstatSync').mockImplementation(forbidden),
    spyOn(fs, 'readdirSync').mockImplementation(forbidden),
    spyOn(fs, 'realpathSync').mockImplementation(Object.assign(forbidden, { native: forbidden })),
    spyOn(fs, 'writeFileSync').mockImplementation(forbidden),
    spyOn(fs, 'mkdirSync').mockImplementation(forbidden),
    // Proof: the real-canary read/write tests returned bytes and changed bytes when these
    // CommonJS spies were absent; namespace-only spies did not intercept require('node:fs').
    spyOn(commonFs, 'readFileSync').mockImplementation(rejectCommonRead),
    spyOn(commonFs, 'writeFileSync').mockImplementation(rejectCommonWrite),
    spyOn(child, 'spawn').mockImplementation(forbidden),
    spyOn(child, 'spawnSync').mockImplementation(forbidden),
    spyOn(child, 'execSync').mockImplementation(forbidden),
    spyOn(child, 'execFileSync').mockImplementation(forbidden),
    spyOn(Bun, 'spawn').mockImplementation(forbidden),
    spyOn(Bun, 'spawnSync').mockImplementation(forbidden),
  ];
  Object.assign(ts.sys, {
    fileExists: forbidden,
    readFile: forbidden,
    readDirectory: forbidden,
    directoryExists: forbidden,
    getDirectories: forbidden,
    realpath: forbidden,
    getCurrentDirectory: forbidden,
    getExecutingFilePath: forbidden,
    write: forbidden,
    writeFile: forbidden,
    createDirectory: forbidden,
    getEnvironmentVariable: forbidden,
  });
  process.env = new Proxy(environment, { get: forbidden, set: forbidden, ownKeys: forbidden });
  try {
    return extract();
  } finally {
    process.env = environment;
    Object.assign(ts.sys, system);
    for (const spy of spies) spy.mockRestore();
  }
}

test('shared compiler source resolves imports and declaration closure without ambient hosts', () => {
  const { source } = fixture();
  const forbidden = () => {
    throw new Error('ambient TypeScript host accessed');
  };
  const originals = { ...ts.sys };
  Object.assign(ts.sys, {
    fileExists: forbidden,
    readFile: forbidden,
    readDirectory: forbidden,
    directoryExists: forbidden,
    getDirectories: forbidden,
    realpath: forbidden,
    getCurrentDirectory: forbidden,
  });
  try {
    const extraction = extractTypeScriptRelationshipsFromSource(workspace, request, source, limits);
    expect(
      extraction.relationships.imports.map(({ source, target, importKind }) => ({
        source,
        target,
        importKind,
      })),
    ).toEqual([{ source: 'src/index.ts', target: 'src/value.ts', importKind: 'type' }]);
    expect(
      extraction.relationships.publicDeclarations[0]?.declarations.map(
        ({ sourcePath }) => sourcePath,
      ),
    ).toEqual(['src/index.ts', 'src/value.ts']);
    expect(extraction.relationships.reverseEdges[0]?.provider).toBe('src/value.ts');
  } finally {
    Object.assign(ts.sys, originals);
  }
});

test('project reference wildcard enumeration uses the supplied source', () => {
  const { source, enumerations } = fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { noLib: true, types: [] },
      files: ['globals.d.ts', 'src/index.ts'],
      references: [{ path: './referenced' }],
    }),
    'referenced/tsconfig.json': JSON.stringify({
      compilerOptions: { composite: true },
      include: ['*.ts'],
    }),
    'referenced/value.ts': 'export interface Reference { value: string }',
  });
  forbidAmbient(() => extractTypeScriptRelationshipsFromSource(workspace, request, source, limits));
  expect(enumerations).toContain('/candidate/referenced');
});

test('root config absent, directory and malformed stay distinct', () => {
  const { source, files } = fixture();
  expect(() =>
    extractTypeScriptRelationshipsFromSource(
      workspace,
      { ...request, configPaths: ['missing.json'] },
      source,
      limits,
    ),
  ).toThrow('TypeScript config absent: missing.json');
  expect(() =>
    extractTypeScriptRelationshipsFromSource(
      workspace,
      { ...request, configPaths: ['src'] },
      source,
      limits,
    ),
  ).toThrow('TypeScript config unreadable: src');
  files.set('/candidate/tsconfig.json', '{bad');
  expect(() =>
    extractTypeScriptRelationshipsFromSource(workspace, request, source, limits),
  ).toThrow('TypeScript config malformed: tsconfig.json');
});

for (const [limit, expected] of [
  ['maximumProbes', 'probe'],
  ['maximumReadBytes', 'read byte'],
  ['maximumDirectoryEntries', 'directory entry'],
  ['maximumObservedOutputBytes', 'observed output byte'],
  ['maximumOutputBytes', 'output byte'],
] as const) {
  test(`compiler refuses ${limit} before returning extraction`, () => {
    const { source } = fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { noLib: true, types: [] },
        include: ['src/*.ts', 'globals.d.ts'],
      }),
    });
    let failure: unknown;
    try {
      extractTypeScriptRelationshipsFromSource(workspace, request, source, {
        ...limits,
        [limit]: 0,
      });
    } catch (cause) {
      failure = cause;
    }
    const messages: string[] = [];
    while (failure instanceof Error) {
      messages.push(failure.message);
      failure = failure.cause;
    }
    expect(messages.join(': ')).toContain(`TypeScript ${expected} limit exceeded`);
  });
}

test('compiler source refuses escaping imports before invoking outside ports', () => {
  const { source } = fixture({
    'src/index.ts': "import { outside } from '../../outside'; export { outside };",
  });
  const kinds = source.pathKind;
  source.pathKind = (path) => {
    if (!path.startsWith('/candidate/') && path !== '/candidate')
      throw new Error(`outside port reached: ${path}`);
    return kinds(path);
  };
  expect(() =>
    extractTypeScriptRelationshipsFromSource(workspace, request, source, limits),
  ).toThrow('TypeScript import unresolved: src/index.ts');
});

test('compiler source rejects nonfinite, negative and fractional limits before IO', () => {
  for (const name of Object.keys(limits) as (keyof TypeScriptLimits)[]) {
    for (const value of [Infinity, -1, 0.5, NaN, undefined]) {
      const { source } = fixture();
      source.readFile = () => {
        throw new Error('IO before validation');
      };
      expect(() =>
        extractTypeScriptRelationshipsFromSource(workspace, request, source, {
          ...limits,
          [name]: value,
        }),
      ).toThrow(`TypeScript ${name} must be a nonnegative safe integer`);
    }
  }
});

test('exact final output bytes include identity and empty selector families', () => {
  const { source } = fixture({ 'src/index.ts': 'export const value = 1;' });
  const selection = { ...request, publicEntrypoints: [] };
  const extraction = extractTypeScriptRelationshipsFromSource(workspace, selection, source, limits);
  expect(extraction.relationships).toEqual({
    imports: [],
    reverseEdges: [],
    publicDeclarations: [],
  });
  const byteLength = Buffer.byteLength(JSON.stringify(extraction)) + 1;
  expect(
    extractTypeScriptRelationshipsFromSource(workspace, selection, source, {
      ...limits,
      maximumOutputBytes: byteLength,
    }),
  ).toEqual(extraction);
  expect(() =>
    extractTypeScriptRelationshipsFromSource(workspace, selection, source, {
      ...limits,
      maximumOutputBytes: byteLength - 1,
    }),
  ).toThrow('TypeScript output byte limit exceeded');
});

test('case insensitive compiler preserves TypeScript Unicode canonical names', () => {
  const { source } = fixture({
    'src/index.ts':
      "import type { First } from './İ'; import type { Second } from './i̇'; export interface Value { first: First; second: Second }",
    'src/İ.ts': 'export interface First { first: string }',
    'src/i̇.ts': 'export interface Second { second: number }',
  });
  const insensitive = { ...source, useCaseSensitiveFileNames: false };
  const extraction = extractTypeScriptRelationshipsFromSource(
    workspace,
    request,
    insensitive,
    limits,
  );
  expect(extraction.relationships.imports.map(({ target }) => target).sort()).toEqual([
    'src/i̇.ts',
    'src/İ.ts',
  ]);
});

test('compiler declaration newline follows CRLF config', () => {
  const { source } = fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { noLib: true, types: [], newLine: 'crlf' },
      files: ['globals.d.ts', 'src/index.ts'],
    }),
  });
  const extraction = extractTypeScriptRelationshipsFromSource(workspace, request, source, limits);
  expect(
    extraction.relationships.publicDeclarations[0]?.declarations.find(
      ({ sourcePath }) => sourcePath === 'src/index.ts',
    )?.text,
  ).toContain('\r\n');
});

test('relative and scoped extends, paths aliases and package imports use source ports', () => {
  const { source } = fixture({
    'tsconfig.json': JSON.stringify({
      extends: './config/base.json',
      files: ['globals.d.ts', 'src/index.ts'],
    }),
    'config/base.json': JSON.stringify({
      extends: '@fixture/config/base.json',
      compilerOptions: { paths: { '@local/*': ['../src/*'] } },
    }),
    'node_modules/@fixture/config/package.json': '{"name":"@fixture/config","version":"1"}',
    'node_modules/@fixture/config/base.json': JSON.stringify({
      compilerOptions: { noLib: true, types: [], module: 'esnext', moduleResolution: 'bundler' },
    }),
    'node_modules/@fixture/value/package.json': '{"name":"@fixture/value","types":"index.d.ts"}',
    'node_modules/@fixture/value/index.d.ts': 'export interface External { tag: number }',
    'src/index.ts':
      "import type { Value } from '@local/value'; import type { External } from '@fixture/value'; export interface Public { value: Value; external: External }",
  });
  const extraction = forbidAmbient(() =>
    extractTypeScriptRelationshipsFromSource(workspace, request, source, limits),
  );
  expect(extraction.relationships.imports.map(({ target }) => target).sort()).toEqual([
    'external:@fixture/value',
    'src/value.ts',
  ]);
});

test('compiler reads explicitly supplied default library bytes', () => {
  const { source } = fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { types: [], target: 'es2022' },
      files: ['src/index.ts'],
    }),
    'node_modules/@typescript/old/lib/lib.es2022.full.d.ts': globals,
    'node_modules/@typescript/old/lib/lib.es2022.d.ts': '',
    'src/index.ts': "/// <reference lib='es2022' />\nexport const value = 1;",
  });
  const read = source.readFile;
  const reads: string[] = [];
  source.readFile = (path) => {
    reads.push(path);
    return read(path);
  };
  forbidAmbient(() => extractTypeScriptRelationshipsFromSource(workspace, request, source, limits));
  expect(reads).toContain(`${source.compilerLibraryDirectory}/lib.es2022.full.d.ts`);
});

test('source parsing does not execute candidate preload, package scripts or compiler plugins', () => {
  const { source } = fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { noLib: true, types: [], plugins: [{ name: './candidate-plugin.cjs' }] },
      files: ['globals.d.ts', 'src/index.ts'],
    }),
    'package.json': JSON.stringify({
      scripts: { prepare: 'node candidate-plugin.cjs' },
      preload: ['./candidate-plugin.cjs'],
    }),
    'candidate-plugin.cjs': "throw new Error('candidate plugin executed');",
    'bunfig.toml': 'preload = ["./candidate-plugin.cjs"]',
  });
  const extraction = forbidAmbient(() =>
    extractTypeScriptRelationshipsFromSource(workspace, request, source, limits),
  );
  expect(extraction.relationships.imports[0]?.target).toBe('src/value.ts');
});

for (const [name, config, expected] of [
  ['absolute extends', { extends: '/outside/config.json' }, 'TypeScript config malformed'],
  ['relative extends', { extends: '../../outside/config.json' }, 'TypeScript config malformed'],
  ['project reference', { references: [{ path: '../outside' }] }, 'TypeScript compiler failed'],
  [
    'type root',
    { compilerOptions: { noLib: true, types: ['outside'], typeRoots: ['/outside'] } },
    'TypeScript compiler failed',
  ],
] as const) {
  test(`compiler refuses ${name} escape before outside ports`, () => {
    const { source } = fixture({
      'tsconfig.json': JSON.stringify({
        compilerOptions: { noLib: true, types: [] },
        files: ['globals.d.ts', 'src/index.ts'],
        ...config,
      }),
    });
    const outsideCalls: string[] = [];
    const guard =
      <Arguments extends [string, ...unknown[]], Value>(
        name: string,
        port: (...parameters: Arguments) => Value,
      ) =>
      (...parameters: Arguments): Value => {
        const path = parameters[0];
        if (!path.startsWith('/candidate/') && path !== '/candidate') {
          outsideCalls.push(`${name}: ${path}`);
          throw new Error(`outside port reached: ${name}: ${path}`);
        }
        return port(...parameters);
      };
    source.pathKind = guard('pathKind', source.pathKind);
    source.readFile = guard('readFile', source.readFile);
    source.readDirectory = guard('readDirectory', source.readDirectory);
    source.getDirectories = guard('getDirectories', source.getDirectories);
    source.realpath = guard('realpath', source.realpath);
    expect(() =>
      forbidAmbient(() =>
        extractTypeScriptRelationshipsFromSource(workspace, request, source, limits),
      ),
    ).toThrow(expected);
    expect(outsideCalls).toEqual([]);
  });
}

test('compiler refuses canonical source symlink escape', () => {
  const { source } = fixture();
  source.realpath = (path) => (path.endsWith('/src/value.ts') ? '/outside/value.ts' : path);
  expect(() =>
    extractTypeScriptRelationshipsFromSource(workspace, request, source, limits),
  ).toThrow('compiler declaration outside trusted copied closure');
});

test('unreadable config remains unreadable with source context', () => {
  const { source } = fixture();
  const read = source.readFile;
  source.readFile = (path) => {
    if (path === '/candidate/tsconfig.json') throw new Error('injected unreadable config');
    return read(path);
  };
  expect(() =>
    extractTypeScriptRelationshipsFromSource(workspace, request, source, limits),
  ).toThrow('TypeScript config unreadable: tsconfig.json');
});

test('compiler snapshots finite limits before source callbacks mutate caller policy', () => {
  const { source } = fixture();
  const ceiling = { ...limits, maximumOutputBytes: 0 };
  const read = source.readFile;
  source.readFile = (path) => {
    ceiling.maximumOutputBytes = Infinity;
    return read(path);
  };
  expect(() =>
    extractTypeScriptRelationshipsFromSource(workspace, request, source, ceiling),
  ).toThrow('TypeScript output byte limit exceeded');
});

test('automatic type root enumeration uses the source host', () => {
  const { source } = fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { noLib: true, types: ['*'] },
      files: ['globals.d.ts', 'src/index.ts'],
    }),
    'node_modules/@types/fixture/index.d.ts': 'declare const ambient: string;',
  });
  const extraction = forbidAmbient(() =>
    extractTypeScriptRelationshipsFromSource(workspace, request, source, limits),
  );
  expect(extraction.relationships.imports[0]?.target).toBe('src/value.ts');
});

test('observation budget charges every emitted declaration and selector before accumulation', () => {
  const { source } = fixture();
  const extraction = extractTypeScriptRelationshipsFromSource(workspace, request, source, limits);
  const selectorBytes = [
    ...extraction.relationships.imports,
    ...extraction.relationships.reverseEdges,
    ...extraction.relationships.publicDeclarations,
  ].reduce(
    (total, { identity: _identity, ...selector }) =>
      total + Buffer.byteLength(JSON.stringify(selector)),
    0,
  );
  const declarations = extraction.relationships.publicDeclarations[0]?.declarations;
  const observed =
    selectorBytes +
    Buffer.byteLength(globals) +
    declarations.reduce((total, declaration) => total + Buffer.byteLength(declaration.text), 0);
  expect(
    extractTypeScriptRelationshipsFromSource(workspace, request, source, {
      ...limits,
      maximumObservedOutputBytes: observed,
    }),
  ).toEqual(extraction);
  expect(() =>
    extractTypeScriptRelationshipsFromSource(workspace, request, source, {
      ...limits,
      maximumObservedOutputBytes: observed - 1,
    }),
  ).toThrow('TypeScript observed output byte limit exceeded');
});

test('observation budget charges bundled declaration text before accumulation', () => {
  const { source } = fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        noLib: true,
        types: [],
        module: 'system',
        outFile: './bundle.d.ts',
        rootDir: '.',
        ignoreDeprecations: '6.0',
      },
      files: ['src/index.ts'],
    }),
    'src/index.ts': `declare global { ${globals} } export interface Value { label: string }`,
  });
  const extraction = extractTypeScriptRelationshipsFromSource(workspace, request, source, limits);
  const declaration = extraction.relationships.publicDeclarations[0];
  const { identity: _identity, ...selector } = declaration;
  const observed =
    Buffer.byteLength(JSON.stringify(selector)) +
    declaration.declarations.reduce((total, entry) => total + Buffer.byteLength(entry.text), 0);
  expect(
    extractTypeScriptRelationshipsFromSource(workspace, request, source, {
      ...limits,
      maximumObservedOutputBytes: observed,
    }),
  ).toEqual(extraction);
  expect(() =>
    extractTypeScriptRelationshipsFromSource(workspace, request, source, {
      ...limits,
      maximumObservedOutputBytes: observed - 1,
    }),
  ).toThrow('TypeScript observed output byte limit exceeded');
});

for (const operation of ['read', 'write'] as const) {
  test(`ambient CommonJS filesystem ${operation} is intercepted before real canary IO`, () => {
    const directory = fs.mkdtempSync('/tmp/typescript-ambient-canary-');
    const readPath = `${directory}/read.txt`;
    const writePath = `${directory}/write.txt`;
    fs.writeFileSync(readPath, 'read canary');
    fs.writeFileSync(writePath, 'write canary');
    try {
      const attempt =
        operation === 'read'
          ? () => commonFs.readFileSync(readPath, 'utf8')
          : () => {
              commonFs.writeFileSync(writePath, 'changed');
            };
      expect(() => {
        forbidAmbient(attempt);
      }).toThrow(`forbidden ambient CommonJS filesystem ${operation}`);
      expect(fs.readFileSync(readPath, 'utf8')).toBe('read canary');
      expect(fs.readFileSync(writePath, 'utf8')).toBe('write canary');
      expect(fs.readdirSync(directory).sort()).toEqual(['read.txt', 'write.txt']);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

test('compiler configuration mode rejects unknown before source callbacks', () => {
  const { source } = fixture();
  Object.defineProperty(source, 'compilerLibraryDirectory', {
    get() {
      throw new Error('mode reached source');
    },
  });
  source.readFile = () => {
    throw new Error('mode reached source');
  };
  expect(() =>
    extractTypeScriptRelationshipsFromSource(
      workspace,
      request,
      source,
      limits,
      // @ts-expect-error Unknown mode models an untyped caller at the public boundary.
      'unknown',
    ),
  ).toThrow('TypeScript configuration mode invalid');
});

test('compatible source mode preserves explicit outside root probes as absent', () => {
  const { source } = fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { noLib: true, types: [], typeRoots: ['/outside/types'] },
      files: ['globals.d.ts', 'src/index.ts'],
    }),
  });
  const original = source.pathKind;
  source.pathKind = (path) => {
    if (path.startsWith('/outside')) throw new Error('outside admission');
    return original(path);
  };
  expect(
    extractTypeScriptRelationshipsFromSource(workspace, request, source, limits).relationships
      .publicDeclarations,
  ).toHaveLength(1);
  expect(() =>
    extractTypeScriptRelationshipsFromSource(
      workspace,
      request,
      source,
      limits,
      'retained-type-roots',
    ),
  ).toThrow('outside admission');
});

test('retained configuration mode reaches every requested root project', () => {
  const { source } = fixture({
    'second.json': JSON.stringify({
      compilerOptions: { noLib: true, types: [], typeRoots: ['/outside/types'] },
      files: ['globals.d.ts', 'src/index.ts'],
    }),
  });
  const original = source.pathKind;
  source.pathKind = (path) => {
    if (path.startsWith('/outside')) throw new Error('second root admission');
    return original(path);
  };
  expect(() =>
    extractTypeScriptRelationshipsFromSource(
      workspace,
      { ...request, configPaths: ['tsconfig.json', 'second.json'] },
      source,
      limits,
      'retained-type-roots',
    ),
  ).toThrow('second root admission');
});
