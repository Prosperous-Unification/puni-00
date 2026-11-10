import { createContext, Script } from 'node:vm';

import {
  type CompilerDerivative,
  type TypeScriptRuntime,
  withCompilerDerivativeSource,
} from '@twilight-burokrat/judge';

import type { Monotonic } from '../clock';

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

// Proof: allowing node:path through the actual compiler Script importer fulfilled the context
// import (basename derivative.ts), failing its rejected-state oracle; restored denial passed.
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
 * Required timing comes separately from trusted Dash composition, never request/options. Its method
 * is captured once with its receiver. One allowance covers decode, construction/evaluation and
 * compatibility before the consumer; it does not interrupt synchronous decode itself.
 * The Script timeout bounds evaluation, not full parsing or VM-internal resource use.
 * @throws Error for missing/malformed timing, invalid samples, expired allowance or VM/policy failure.
 */
export function withCompilerDerivative<T>(
  artifact: CompilerDerivative,
  monotonic: Monotonic,
  consume: (compiler: TypeScriptRuntime) => T,
): T {
  // Proof: shape/callability omissions lose the modeled missing-dependency refusal to native TypeError;
  // they do not demonstrate successful publication. No default timing dependency is installed.
  const timing: unknown = monotonic;
  if (timing === null || (typeof timing !== 'object' && typeof timing !== 'function'))
    throw new Error('compiler derivative monotonic required');
  // Proof: rereading this getter loses `timing method is captured once`; swallowing its throw
  // loses `a throwing timing getter propagates`. The bound call preserves its actual receiver.
  const now: unknown = Reflect.get(timing, 'now');
  if (typeof now !== 'function') throw new Error('compiler derivative monotonic required');
  // Boundary: callability is established above; every returned value is validated before arithmetic.
  const sample = now.bind(timing) as () => number;
  // Proof: moving start after decode reaches the consumer under controlled actual decode progression;
  // the separate real slow-decoder control uses the actual monotonicClock producer.
  // Catch/default faults lose thrown-dependency propagation before/after context allocation.
  const started = sample();
  // Proof: omission allows actual context allocation before a later guard; `nonfinite start` observes it.
  if (!Number.isFinite(started)) throw new Error('compiler derivative monotonic start nonfinite');
  let previous = started;
  return withCompilerDerivativeSource(artifact, (source, maximumLoadMilliseconds) => {
    const allowance = maximumLoadMilliseconds;
    const remaining = (): number => {
      const current = sample();
      // Proof: omission loses the precise sample boundary to later elapsed/backwards refusal;
      // this is error-order evidence, not an accepted-publication bypass.
      if (!Number.isFinite(current))
        throw new Error('compiler derivative monotonic sample nonfinite');
      // Proof: omission reaches the forbidden consumer in `backwards monotonic movement`.
      if (current < previous) throw new Error('compiler derivative monotonic moved backwards');
      // Proof: a previous-sample reset reaches the consumer in the one-diminishing-allowance oracle.
      const elapsed = current - started;
      // Proof: omission changes the finite-endpoint overflow refusal to a later timeout refusal;
      // this is the precise elapsed boundary, not a successful-publication bypass.
      if (!Number.isFinite(elapsed))
        throw new Error('compiler derivative monotonic elapsed nonfinite');
      previous = current;
      // Proof: ceil omission loses the fractional positive integer timeout control to native RangeError.
      const milliseconds = allowance - Math.ceil(elapsed);
      // Proof: omission admits an invalid zero-timeout Script invocation before native refusal;
      // phase-count assertions observe admission, not successful evaluation or publication.
      if (milliseconds <= 0) throw new Error('compiler derivative load timeout exceeded');
      // Proof: clamp omission forwards 2147483648 to all three actual Script calls;
      // the timeout-argument oracle expects 2147483647 each. No native refusal is claimed.
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
      // Proof: independent policy/authenticated/exports timeout substitutions admit the forbidden
      // actual Script phase before subsequent failures; no later raw-pin error is the oracle.
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
      // Proof: omission reaches the consumer and registers an extraction after final deadline expiry.
      remaining();
      return consume(lifetime.compiler);
    } finally {
      // Proof: independently omitting each clear leaves the actual observed reference after
      // consumer/timing failure in the copied production-source cleanup tests; no GC claim is made.
      lifetime.compiler = undefined;
      lifetime.context = undefined;
    }
  });
}
