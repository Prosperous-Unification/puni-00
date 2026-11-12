import {
  captureCompilerDerivative,
  type CompilerDerivative,
  type CompilerDerivativeLimits,
  type CompilerDerivativeMembers,
  listCompilerDerivativeMembers,
} from '@twilight-burokrat/judge';

import { assertRetainedNamespaceOwners } from './review-namespace';
import { readReviewRuntimeProvenance, type ReviewRuntime } from './review-runtime';
import type { RetainedTypeScriptExtractionRequest } from './review-typescript';
import { captureRetainedTypeScriptRequest } from './review-typescript-request';
import {
  assertRetainedTypeScriptSourceOwners,
  createRetainedTypeScriptSource,
  readRetainedTypeScriptSourceProvenance,
} from './review-typescript-source';

declare const DerivativeBrand: unique symbol;
/** Exact retained runtime acquisition; bootstrap evidence grants no aggregate runtime trust. */
export interface RetainedCompilerDerivative {
  readonly [DerivativeBrand]: true;
}
type Acquisition = Readonly<ReviewRuntime['closure']['files'][number]>;
interface OwnedDerivative {
  readonly runtime: ReviewRuntime;
  readonly artifact: CompilerDerivative;
  readonly acquisitions: readonly Acquisition[];
}
const Derivatives = new WeakMap<RetainedCompilerDerivative, OwnedDerivative>();

function readOwnedDerivative(binding: RetainedCompilerDerivative): OwnedDerivative {
  // Proof: lookup omission loses the copied-token named refusal; poison proxies are never read.
  const owned = Derivatives.get(binding);
  if (owned === undefined) throw new Error('owned retained compiler derivative required');
  return owned;
}

/** Requires the exact acquisition token and runtime before exposing its artifact to internal composition. */
export function requireRetainedCompilerDerivative(
  binding: RetainedCompilerDerivative,
  runtime: ReviewRuntime,
): CompilerDerivative {
  const owned = readOwnedDerivative(binding);
  // Proof: join omission admits the genuine equal-closure runtime in `derivative binding requires exact runtime`.
  if (owned.runtime !== runtime) throw new Error('derivative runtime owner differs');
  return owned.artifact;
}

/** Returns detached bootstrap acquisitions, not a complete compiler read manifest. */
export function readRetainedCompilerDerivativeAcquisition(
  binding: RetainedCompilerDerivative,
): readonly Acquisition[] {
  return readOwnedDerivative(binding).acquisitions;
}

/**
 * Validates every required tuple before any actual runtime read, then captures all four raw members.
 * Caller limits are captured once. Real runtime read/copy ceilings remain cumulative across calls.
 * @throws Error for foreign runtime, absent or incompatible tuples, exhausted allowances or raw pin failure.
 */
// Proof: narrowing the required runtime parameter to never fails the actual API callers (TS2345).
export function readRetainedCompilerDerivative(
  runtime: ReviewRuntime,
  suppliedLimits: CompilerDerivativeLimits,
): RetainedCompilerDerivative {
  // Proof: authentication omission reaches the proxy property sentinel instead of owned-runtime refusal.
  readReviewRuntimeProvenance(runtime);
  // Proof: independently rereading each supplied limit loses its once-only successful acquisition oracle.
  const limits = Object.freeze({
    maximumMemberBytes: suppliedLimits.maximumMemberBytes,
    maximumTotalBytes: suppliedLimits.maximumTotalBytes,
    maximumOwnedBytes: suppliedLimits.maximumOwnedBytes,
    maximumLoadMilliseconds: suppliedLimits.maximumLoadMilliseconds,
  });
  // Proof: separate safe-integer/positive omissions reach real runtime read exhaustion for invalid limits.
  for (const [name, ceiling] of Object.entries(limits))
    if (!Number.isSafeInteger(ceiling) || ceiling <= 0)
      throw new Error(`compiler derivative ${name} must be a positive safe integer`);
  // Proof: removing receiver binding loses the real root-removal acquisition positive with owned-runtime refusal.
  const readFile = runtime.readFile.bind(runtime);
  const tuples = listCompilerDerivativeMembers().map((member) => {
    // Proof: a manifest-only prefix dependency fault admits its authentic wrong-prefix tuple and
    // spends the sentinel read allowance in `all tuple preflight path`; the dependency is restored.
    const path = `compiler-derivative/${member.path}`;
    const file = runtime.closure.files.find((entry) => entry.path === path);
    const role = member.path === 'compiler.cjs' ? 'program' : 'dependency';
    // Proof: independent role/hash omissions spend the real sentinel allowance before any raw-pin
    // error is examined. Absence omission changes the modeled refusal to TypeError, not admission.
    // Combined expected-metadata-dependency/length-guard admission proof: only the test expected hash
    // matches altered authentic bytes; expected length stays compiled. Removing only length spends
    // the sentinel allowance. This is not a hostile-owner bypass under the unchanged fixed hash.
    if (
      file?.path !== path ||
      file.role !== role ||
      file.identity !== member.identity ||
      file.byteLength !== member.byteLength
    )
      throw new Error(`compiler derivative tuple differs: ${path}`);
    return { member: member.path, file };
  });
  // Boundary: the closed compiled vector validates and fills exactly all four required members.
  const members = {} as Record<keyof CompilerDerivativeMembers, Uint8Array>;
  for (const { member, file } of tuples) members[member] = readFile(file);
  const artifact = captureCompilerDerivative(members, limits);
  // Proof: independent array/child freeze omissions lose immutable acquisition assertions.
  const acquisitions = Object.freeze(tuples.map(({ file }) => Object.freeze({ ...file })));
  // Boundary: the nominal token is authenticated exclusively by the private successful registration.
  // Proof: freeze omission loses the frozen-token assertion; failed capture registers no token.
  const binding = Object.freeze({}) as RetainedCompilerDerivative;
  Derivatives.set(binding, { runtime, artifact, acquisitions });
  return binding;
}

/**
 * Prepares a real source after full pure request capture and exact derivative/namespace/source joins.
 * This internal transient record executes no compiler and registers no successful extraction.
 * @throws Error for malformed requests or any mismatched exact construction owner.
 */
export function prepareRetainedDerivativeTypeScriptSource(
  input: Omit<RetainedTypeScriptExtractionRequest, 'compiler'> & {
    readonly derivative: RetainedCompilerDerivative;
  },
) {
  // Proof: `real derivative preparation snapshots` observes each top-level reference exactly once.
  const {
    namespace,
    candidate,
    runtime,
    derivative,
    request,
    sourceLimits,
    compilerLimits,
    requestLimits,
  } = input;
  const captured = captureRetainedTypeScriptRequest({
    request,
    sourceLimits,
    compilerLimits,
    requestLimits,
  });
  const artifact = requireRetainedCompilerDerivative(derivative, runtime);
  // Proof: omission admits a genuine equal-content runtime namespace in the preparation negative.
  assertRetainedNamespaceOwners(namespace, candidate, runtime);
  const source = createRetainedTypeScriptSource(
    namespace,
    candidate,
    runtime,
    captured.sourceLimits,
  );
  // Proof: omission admits the genuine mixed source injected at the real construction dependency.
  assertRetainedTypeScriptSourceOwners(source, namespace, candidate, runtime);
  const provenance = readRetainedTypeScriptSourceProvenance(source);
  // Proof: transient-record freeze omission loses `real derivative preparation snapshots`.
  return Object.freeze({
    ...captured,
    source,
    provenance,
    artifact,
    acquisitions: readRetainedCompilerDerivativeAcquisition(derivative),
  });
}
