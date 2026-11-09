import { createContext, Script } from 'node:vm';

import {
  type CompilerDerivative,
  withCompilerDerivativeSource,
} from './compiler-derivative-artifact';
import type { TypeScriptRuntime } from './typescript-compiler';

const setup = `
'use strict';
// Proof: retaining ambient console lost the absent-global oracle in the actual evaluated context.
for (const name of ['process','Bun','Buffer','fetch','XMLHttpRequest','WebSocket','Worker',
  'setTimeout','setInterval','setImmediate','queueMicrotask','global','console','__filename','__dirname']) {
  Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false });
}
for (const generate of [() => eval('1'), () => Function('return 1')()]) {
  let refused = false;
  try { generate(); } catch (cause) { refused = cause instanceof EvalError; }
  // Proof: removing this refusal admitted unsupported string generation before publication.
  if (!refused) throw new Error('compiler derivative string code generation policy unavailable');
}
let wasmRefused = false;
try { new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0])); }
catch (cause) { wasmRefused = cause instanceof WebAssembly.CompileError; }
// Proof: removing this refusal admitted unsupported Wasm generation before publication.
if (!wasmRefused) throw new Error('compiler derivative wasm code generation policy unavailable');
globalThis.module = { exports: {} };
globalThis.exports = module.exports;
// Proof: an accepting require lost the exact denied-native-module oracle.
globalThis.require = () => { throw new Error('compiler derivative require denied'); };
`;

// Proof: changing the import denial lost its exact rejection in the evaluated context.
function denyImport(): never {
  throw new Error('compiler derivative dynamic import denied');
}

function requireCompiler(namespace: unknown): TypeScriptRuntime {
  // Proof: removing this guard lost the post-evaluation namespace-specific refusal.
  if (namespace === null || typeof namespace !== 'object')
    throw new Error('compiler derivative namespace differs');
  // Proof: removing this guard published the post-evaluation forged-version namespace.
  if (Reflect.get(namespace, 'version') !== '6.0.3')
    throw new Error('compiler derivative version differs');
  // Proof: removing this guard published the post-evaluation Node-system namespace.
  if (Reflect.get(namespace, 'sys') !== undefined)
    throw new Error('compiler derivative sys must be absent');
  for (const name of [
    'createProgram',
    'createSourceFile',
    'readConfigFile',
    'parseJsonConfigFileContent',
    'resolveModuleName',
    'getPreEmitDiagnostics',
    'formatDiagnostics',
    'resolvePath',
  ]) {
    // Proof: removing API checks admitted a post-evaluation missing createProgram.
    if (typeof Reflect.get(namespace, name) !== 'function')
      throw new Error(`compiler derivative API ${name} differs`);
  }
  const resolvePath: unknown = Reflect.get(namespace, 'resolvePath');
  // Proof: omitting arity validation published the injected two-argument private helper.
  if (typeof resolvePath !== 'function' || resolvePath.length !== 1)
    throw new Error('compiler derivative private resolvePath differs');
  // Boundary: the authenticated 6.0.3 private helper has this pure signature; output is checked.
  const normalize = resolvePath as (base: string, ...paths: string[]) => unknown;
  // Proof: wrong post-evaluation private-helper output lost the exact compatibility refusal.
  if (normalize('/workspace', 'src/../main.ts') !== '/workspace/main.ts')
    throw new Error('compiler derivative private resolvePath differs');
  // Authenticated pinned executable plus compatibility checks establish this internal namespace type.
  // Proof: spreading the namespace erased the injected non-enumerable private export.
  return namespace as TypeScriptRuntime;
}

/**
 * Internal synchronous extraction composition over a fresh original compiler namespace.
 * Evaluates only privately owned authenticated bytes, with no filename/cache/ambient fallback.
 * No candidate JavaScript enters the VM. This is IO composition, not an arbitrary-code sandbox.
 * Finally releases loader references on load, compatibility or extraction failure; consumers must
 * return detached extraction records and must not retain Programs/ASTs/namespace references.
 * The Script timeout bounds evaluation, not full parsing or VM-internal resource use.
 */
export function withCompilerDerivative<T>(
  artifact: CompilerDerivative,
  consume: (compiler: TypeScriptRuntime) => T,
): T {
  // Proof: starting after decode lost the injected slow-decoder pre-evaluation timeout.
  const started = performance.now();
  return withCompilerDerivativeSource(artifact, (source, maximumLoadMilliseconds) => {
    const remaining = (): number => {
      const milliseconds = maximumLoadMilliseconds - Math.ceil(performance.now() - started);
      if (milliseconds <= 0) throw new Error('compiler derivative load timeout exceeded');
      return Math.min(milliseconds, 2_147_483_647);
    };
    const lifetime: { context?: ReturnType<typeof createContext>; compiler?: TypeScriptRuntime } =
      {};
    try {
      // Boundary: this freshly created empty null-prototype sandbox contains no host values.
      const sandbox = Object.create(null) as Record<string, unknown>;
      lifetime.context = createContext(sandbox, {
        codeGeneration: { strings: false, wasm: false },
      });
      new Script(setup, {
        filename: 'compiler-derivative:policy',
        importModuleDynamically: denyImport,
      }).runInContext(lifetime.context, { timeout: remaining() });
      // Proof: a 1000ms timeout substituted for the captured 100ms limit lost fast settlement.
      new Script(source, {
        filename: 'compiler-derivative:authenticated',
        importModuleDynamically: denyImport,
      }).runInContext(lifetime.context, { timeout: remaining() });
      // Proof: module-global reuse exposed the previous invocation's marker to fresh extraction.
      // Installed same-version substitution (sys hidden) lost the real /workspace/safe/value observer assertion.
      lifetime.compiler = requireCompiler(
        new Script('module.exports').runInContext(lifetime.context, { timeout: remaining() }),
      );
      remaining();
      return consume(lifetime.compiler);
    } finally {
      lifetime.compiler = undefined;
      lifetime.context = undefined;
    }
  });
}
