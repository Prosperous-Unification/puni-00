import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeAll, expect, test } from 'bun:test';
import type ts from 'typescript';

import { writeCompilerDerivative } from '../packaging/compiler-derivative';
import {
  captureCompilerDerivative,
  type CompilerDerivativeMembers,
} from './compiler-derivative-artifact';
import {
  createLimits,
  createMembers,
  readLibrary,
} from './compiler-derivative-fixture.test-support';
import type * as CompilerDerivativeRuntime from './compiler-derivative-runtime';
import { withCompilerDerivative } from './compiler-derivative-runtime';

let members: CompilerDerivativeMembers;
beforeAll(() => {
  members = createMembers();
});
afterEach(() => {
  Bun.gc(true);
});
function compile(compiler: typeof ts, noLib: boolean, defaultLibrary = false) {
  const files: Partial<Record<string, string>> = {
    '/workspace/main.ts':
      'import {value} from "@feature/value"; export const answer: number = value;',
    '/workspace/safe/value.ts': 'export const value=42;',
    '/lib/lib.es5.d.ts': readLibrary('lib.es5.d.ts'),
    '/lib/lib.decorators.d.ts': readLibrary('lib.decorators.d.ts'),
    '/lib/lib.decorators.legacy.d.ts': readLibrary('lib.decorators.legacy.d.ts'),
  };
  const attempts: string[] = [];
  const emitted: string[] = [];
  const host: ts.CompilerHost & {
    onPathsSubstitutionAttempt: (attempt: { candidate: string }) => void;
  } = {
    getSourceFile: (path, target) => {
      const source = files[path];
      return source === undefined ? undefined : compiler.createSourceFile(path, source, target);
    },
    getDefaultLibFileName: () => '/lib/lib.es5.d.ts',
    writeFile: (_path, text) => {
      emitted.push(text);
    },
    getCurrentDirectory: () => '/workspace',
    getDirectories: () => [],
    directoryExists: () => true,
    fileExists: (path) => Object.hasOwn(files, path),
    readFile: (path) => files[path],
    getCanonicalFileName: (path) => path,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    onPathsSubstitutionAttempt: (attempt) => {
      attempts.push(attempt.candidate);
    },
  };
  const program = compiler.createProgram(
    ['/workspace/main.ts'],
    {
      noLib,
      lib: noLib || defaultLibrary ? undefined : ['lib.es5.d.ts'],
      declaration: true,
      emitDeclarationOnly: true,
      ignoreDeprecations: '6.0',
      module: compiler.ModuleKind.Node16,
      moduleResolution: compiler.ModuleResolutionKind.Node16,
      baseUrl: '/workspace',
      paths: { '@feature/*': ['safe/*'] },
    },
    host,
  );
  const diagnostics = compiler.getPreEmitDiagnostics(program);
  if (!noLib) expect(diagnostics).toEqual([]);
  expect(program.emit().emitSkipped).toBe(false);
  expect(emitted).toContain('export declare const answer: number;\n');
  expect(attempts).toEqual(['/workspace/safe/value']);
  return emitted;
}
for (const noLib of [true, false])
  test(`captured bytes compile noLib=${String(noLib)} with real resolution and declarations`, () => {
    const artifact = captureCompilerDerivative(members, createLimits());
    withCompilerDerivative(artifact, (compiler) => {
      expect(compiler.version).toBe('6.0.3');
      expect(compiler.sys).toBeUndefined();
      expect(typeof Reflect.get(compiler, 'resolvePath')).toBe('function');
      compile(compiler, noLib);
    });
  });
test('owned bytes survive caller mutation and each invocation receives a fresh original namespace', () => {
  const supplied = { ...members, 'compiler.cjs': members['compiler.cjs'].slice() };
  const artifact = captureCompilerDerivative(supplied, createLimits());
  supplied['compiler.cjs'].fill(0);
  withCompilerDerivative(artifact, (compiler) => {
    Object.defineProperty(compiler, 'stageOneMarker', { value: 42 });
  });
  withCompilerDerivative(artifact, (compiler) => {
    expect(Reflect.get(compiler, 'stageOneMarker')).toBeUndefined();
    compile(compiler, true);
  });
});
test('cumulative staging allowance has exact fit and cannot reset after callback failure', () => {
  const total = Object.values(members).reduce((sum, bytes) => sum + bytes.byteLength, 0);
  const allowance = 4 * members['compiler.cjs'].byteLength;
  const artifact = captureCompilerDerivative(members, {
    ...createLimits(),
    maximumOwnedBytes: total + allowance,
  });
  expect(() =>
    withCompilerDerivative(artifact, () => {
      throw new Error('controlled extraction failure');
    }),
  ).toThrow('controlled extraction failure');
  expect(() =>
    withCompilerDerivative(artifact, () => {
      throw new Error('unexpected callback');
    }),
  ).toThrow('compiler derivative maximumOwnedBytes exceeded');
  const short = captureCompilerDerivative(members, {
    ...createLimits(),
    maximumOwnedBytes: total + allowance - 1,
  });
  expect(() =>
    withCompilerDerivative(short, () => {
      throw new Error('unexpected callback');
    }),
  ).toThrow('compiler derivative maximumOwnedBytes exceeded');
});
test('fresh realm namespace retains original compiler exports', () => {
  const artifact = captureCompilerDerivative(members, createLimits());
  withCompilerDerivative(artifact, (compiler) => {
    const resolve = Reflect.get(compiler, 'resolvePath') as (
      base: string,
      ...paths: string[]
    ) => unknown;
    expect(typeof resolve).toBe('function');
    expect(resolve('/workspace', 'src/../main.ts')).toBe('/workspace/main.ts');
    expect(Object.getOwnPropertyDescriptor(compiler, 'resolvePath')?.enumerable).toBe(true);
  });
});

const scratch: string[] = [];
afterEach(async () => {
  for (const directory of scratch.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function copyLoader(corruption: string, alter = (source: string) => source) {
  const directory = await mkdtemp(join(tmpdir(), 'owned-compiler-loader-'));
  scratch.push(directory);
  const original = await readFile(
    new URL('./compiler-derivative-runtime.ts', import.meta.url),
    'utf8',
  );
  const instrumented = original
    .replace(
      "from './compiler-derivative-artifact'",
      `from '${new URL('./compiler-derivative-artifact.ts', import.meta.url).pathname}'`,
    )
    .replace(
      "from './typescript-compiler'",
      `from '${new URL('./typescript-compiler.ts', import.meta.url).pathname}'`,
    )
    .replace(
      'lifetime.compiler = requireCompiler(',
      `new Script(${JSON.stringify(corruption)}, { importModuleDynamically: denyImport }).runInContext(lifetime.context, { timeout: remaining() });\n      lifetime.compiler = requireCompiler(`,
    );
  await writeFile(join(directory, 'runtime.ts'), alter(instrumented));
  return import(join(directory, 'runtime.ts')) as Promise<typeof CompilerDerivativeRuntime>;
}
test('real raw members execute after physical deletion and poisoned original filename', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'owned-compiler-artifact-'));
  scratch.push(directory);
  const path = join(directory, 'compiler');
  await writeCompilerDerivative(path);
  const captured = {
    'compiler.cjs': new Uint8Array(await readFile(join(path, 'compiler.cjs'))),
    'manifest.json': new Uint8Array(await readFile(join(path, 'manifest.json'))),
    'LICENSE.txt': new Uint8Array(await readFile(join(path, 'LICENSE.txt'))),
    NOTICE: new Uint8Array(await readFile(join(path, 'NOTICE'))),
  };
  const artifact = captureCompilerDerivative(captured, createLimits());
  await rm(path, { recursive: true });
  await mkdir(path);
  await writeFile(join(path, 'compiler.cjs'), 'throw new Error("malicious physical replacement");');
  const require = createRequire(import.meta.url);
  const key = 'compiler-derivative:authenticated';
  const prior = require.cache[key];
  require.cache[key] = {
    exports: {
      version: '6.0.3',
      createProgram() {
        throw new Error('poisoned module cache');
      },
    },
  } as NodeJS.Module;
  try {
    withCompilerDerivative(artifact, (compiler) => {
      compile(compiler, false);
    });
  } finally {
    if (prior === undefined) Reflect.deleteProperty(require.cache, key);
    else require.cache[key] = prior;
  }
});
test('context excludes ambient IO and denies require string wasm and import machinery', async () => {
  const loader =
    await copyLoader(`module.exports.loaderGlobals = [typeof process,typeof Bun,typeof Buffer,typeof fetch,typeof setTimeout,typeof global,typeof __filename,typeof console];
  try { require('node:fs'); } catch(cause) { module.exports.requireFailure = cause.message; }
  try { Function('return process')(); } catch(cause) { module.exports.stringFailure = cause.name; }
  try { new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0])); } catch(cause) { module.exports.wasmFailure = cause.name; }
  module.exports.importFailure = import('node:fs').then(()=> 'unexpected import', cause=>cause.message);`);
  let imported: Promise<string> | undefined;
  loader.withCompilerDerivative(captureCompilerDerivative(members, createLimits()), (compiler) => {
    expect(Reflect.get(compiler, 'loaderGlobals')).toEqual(Array(8).fill('undefined'));
    expect(Reflect.get(compiler, 'requireFailure')).toBe('compiler derivative require denied');
    expect(Reflect.get(compiler, 'stringFailure')).toBe('EvalError');
    expect(Reflect.get(compiler, 'wasmFailure')).toBe('CompileError');
    imported = Reflect.get(compiler, 'importFailure') as Promise<string>;
  });
  expect(await imported).toBe('compiler derivative dynamic import denied');
});
for (const [label, corruption, message] of [
  ['namespace', 'module.exports = null;', 'namespace differs'],
  [
    'version',
    `module.exports = new Proxy(module.exports,{get:(target,key)=>key==='version'?'forged':Reflect.get(target,key)});`,
    'version differs',
  ],
  [
    'sys',
    `module.exports = new Proxy(module.exports,{get:(target,key)=>key==='sys'?{}:Reflect.get(target,key)});`,
    'sys must be absent',
  ],
  [
    'API',
    `module.exports = new Proxy(module.exports,{get:(target,key)=>key==='createProgram'?undefined:Reflect.get(target,key)});`,
    'API createProgram differs',
  ],
  [
    'private arity',
    `module.exports = new Proxy(module.exports,{get:(target,key)=>key==='resolvePath'?function(_base,_suffix){return '/workspace/main.ts';}:Reflect.get(target,key)});`,
    'private resolvePath differs',
  ],
  [
    'private helper',
    `module.exports = new Proxy(module.exports,{get:(target,key)=>key==='resolvePath'?function(_path){return '/wrong';}:Reflect.get(target,key)});`,
    'private resolvePath differs',
  ],
] as const)
  test(`actual post-evaluation ${label} compatibility refusal publishes no compiler`, async () => {
    const loader = await copyLoader(corruption);
    let calls = 0;
    expect(() => {
      loader.withCompilerDerivative(captureCompilerDerivative(members, createLimits()), () => {
        calls++;
      });
    }).toThrow(`compiler derivative ${message}`);
    expect(calls).toBe(0);
  });
test('non-enumerable private helper stays on original namespace', async () => {
  const loader = await copyLoader(
    `const original=module.exports; module.exports=Object.create(null,Object.fromEntries(Reflect.ownKeys(original).map(key=>[key,{...Object.getOwnPropertyDescriptor(original,key),enumerable:key==='resolvePath'?false:true}])));`,
  );
  loader.withCompilerDerivative(captureCompilerDerivative(members, createLimits()), (compiler) => {
    expect(Object.getOwnPropertyDescriptor(compiler, 'resolvePath')?.enumerable).toBe(false);
    const resolve = Reflect.get(compiler, 'resolvePath') as (
      base: string,
      ...paths: string[]
    ) => unknown;
    expect(resolve('/workspace', 'main.ts')).toBe('/workspace/main.ts');
  });
});
for (const [label, alter, message] of [
  [
    'strings',
    (source: string) => source.replace('strings: false', 'strings: true'),
    'string code generation policy unavailable',
  ],
  [
    'wasm',
    (source: string) => source.replace('wasm: false', 'wasm: true'),
    'wasm code generation policy unavailable',
  ],
] as const)
  test(`unsupported ${label} policy refuses before compiler publication`, async () => {
    const loader = await copyLoader('', alter);
    let calls = 0;
    expect(() => {
      loader.withCompilerDerivative(captureCompilerDerivative(members, createLimits()), () => {
        calls++;
      });
    }).toThrow(`compiler derivative ${message}`);
    expect(calls).toBe(0);
  });
test('evaluation timeout settles without callback and consumes its allocation allowance', async () => {
  const loader = await copyLoader('', (source) =>
    source.replace('new Script(source,', 'new Script("while (true) {}",'),
  );
  const total = Object.values(members).reduce((sum, bytes) => sum + bytes.byteLength, 0);
  const artifact = captureCompilerDerivative(members, {
    ...createLimits(),
    maximumLoadMilliseconds: 100,
    maximumOwnedBytes: total + 4 * members['compiler.cjs'].byteLength,
  });
  let calls = 0;
  const start = performance.now();
  expect(() => {
    loader.withCompilerDerivative(artifact, () => {
      calls++;
    });
  }).toThrow(/timed out|timeout/);
  expect(calls).toBe(0);
  expect(performance.now() - start).toBeLessThan(700);
  expect(() => {
    withCompilerDerivative(artifact, () => {
      calls++;
    });
  }).toThrow('maximumOwnedBytes exceeded');
});

test('default-library host selection compiles with the captured executable', () => {
  withCompilerDerivative(captureCompilerDerivative(members, createLimits()), (compiler) => {
    compile(compiler, false, true);
  });
});

test('load deadline includes captured executable decoding before VM evaluation', () => {
  const artifact = captureCompilerDerivative(members, {
    ...createLimits(),
    maximumLoadMilliseconds: 100,
  });
  const Decoder = globalThis.TextDecoder;
  globalThis.TextDecoder = new Proxy(Decoder, {
    construct(target, args) {
      const decoder = Reflect.construct(target, args) as TextDecoder;
      const decode = decoder.decode.bind(decoder);
      decoder.decode = (...parameters: Parameters<TextDecoder['decode']>) => {
        const started = performance.now();
        while (performance.now() - started < 150) {
          /* Inject synchronous decoding delay. */
        }
        return decode(...parameters);
      };
      return decoder;
    },
  });
  let calls = 0;
  try {
    expect(() => {
      withCompilerDerivative(artifact, () => {
        calls++;
      });
    }).toThrow('compiler derivative load timeout exceeded');
  } finally {
    globalThis.TextDecoder = Decoder;
  }
  expect(calls).toBe(0);
});
