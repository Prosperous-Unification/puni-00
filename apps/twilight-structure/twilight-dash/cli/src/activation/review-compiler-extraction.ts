import { Buffer } from 'node:buffer';

import {
  captureTypeScriptLimits,
  type CompilerDerivative,
  type CompilerDerivativeProvenance,
  type ExtractorIdentity,
  extractTypeScriptObservations,
  readCompilerDerivativeProvenance,
  type RelationshipRequest,
  serializeCanonical,
  type TypeScriptExtraction,
  type TypeScriptLimits,
  type TypeScriptSource,
} from '@twilight-burokrat/judge';

import type { Monotonic } from '../clock';
import { withCompilerDerivative } from './review-compiler-runtime';

type DeepReadonly<T> = T extends readonly (infer Member)[]
  ? readonly DeepReadonly<Member>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;
type TypeScriptRequest = RelationshipRequest['typescript'];
interface DerivativeEnvelope extends TypeScriptExtraction {
  readonly schemaVersion: 1;
  readonly kind: 'typescript-derivative-prerequisite';
  readonly runtimeTrust: 'unverified';
  readonly request: TypeScriptRequest;
  readonly compiler: CompilerDerivativeProvenance;
}
declare const DerivativeExtractionBrand: unique symbol;
/** Internal non-activating detached extraction; neither strict retained admission nor runtime authority. */
export type DerivativeTypeScriptPrerequisite = DeepReadonly<DerivativeEnvelope> & {
  readonly [DerivativeExtractionBrand]: true;
};
type ExtractionMetadata = DeepReadonly<{
  request: TypeScriptRequest;
  compiler: CompilerDerivativeProvenance;
}>;
const extractions = new WeakMap<
  object,
  { readonly artifact: CompilerDerivative; readonly metadata: ExtractionMetadata }
>();

function freezeDetached<T extends object>(root: T): DeepReadonly<T> {
  const pending: object[] = [root];
  const seen = new WeakSet<object>();
  for (const value of pending) {
    if (seen.has(value)) continue;
    seen.add(value);
    // Proof: child omission left published request/relationship descendants unfrozen.
    const children: unknown[] = Object.values(value);
    for (const child of children)
      if (typeof child === 'object' && child !== null) pending.push(child);
    // Proof: blanket freeze omission left the published prerequisite mutable.
    Object.freeze(value);
  }
  // Boundary: only detached extraction/metadata objects enter; every reachable object is frozen.
  return root as DeepReadonly<T>;
}

function captureRequest(request: TypeScriptRequest, maximumBytes: number): TypeScriptRequest {
  // Proof: rereading request properties lost their changing-getter control.
  const configPaths = request.configPaths;
  const publicEntrypoints = request.publicEntrypoints;
  let capturedBytes = 0;
  const capturePaths = (paths: string[]): string[] => {
    // Proof: array-guard omission lost the specific missing-array boundary error.
    if (!Array.isArray(paths)) throw new Error('TypeScript derivative request arrays required');
    // Proof: a second length read reached the original-array reread sentinel.
    const length = paths.length;
    // Proof: omitting finite length admission let NaN silently erase the requested config paths.
    if (!Number.isSafeInteger(length) || length < 0)
      throw new Error('TypeScript derivative request length invalid');
    // Proof: count omission reached the forbidden indexed getter before admission.
    if (length > maximumBytes) throw new Error('TypeScript derivative request byte limit exceeded');
    const captured: string[] = [];
    for (let index = 0; index < length; index++) {
      // Proof: a second entry read reached the original indexed getter sentinel.
      const path = paths[index];
      // Proof: path-guard omission lost the specific sparse-path boundary error.
      if (typeof path !== 'string') throw new Error('TypeScript derivative request path missing');
      const bytes = Buffer.byteLength(path, 'utf8');
      // Proof: byte admission omission reached the forbidden accumulation sentinel.
      if (bytes > maximumBytes - capturedBytes)
        throw new Error('TypeScript derivative request byte limit exceeded');
      capturedBytes += bytes;
      captured.push(path);
    }
    return captured;
  };
  const captured = {
    configPaths: capturePaths(configPaths),
    publicEntrypoints: capturePaths(publicEntrypoints),
  };
  return captured;
}

// Proof: artifact-identity substitution loses all three independent execution-selector vectors.
function selectDerivative(provenance: CompilerDerivativeProvenance): ExtractorIdentity {
  return Object.freeze({
    extractorId: 'typescript.compiler.paths-observer',
    version: 'v6.0.3.paths-observer.1',
    blob: provenance.compilerExecutionIdentity,
  });
}

/**
 * Internal non-activating prerequisite: executes owned bytes through the actual shared core.
 * Captures request/limits before callbacks, caps and freezes the complete detached envelope,
 * then registers exact artifact/output ownership. No raw compiler or trusted identity is accepted.
 * The compatible configuration mode installs no placeholder observer. Stages 3 and 4 must join
 * exact retained owners and both actual-attempt admission paths before strict public composition.
 * This Dash effect owner is never exported through judge; timing is separately supplied by trusted composition.
 * @throws Error for capture/loading/compiler/budget/freeze failures; no failed envelope is owned.
 */
// Proof: narrowing the required owned-artifact input to never failed real callers in the API diagnostic.
export function extractDerivativeTypeScriptPrerequisite(
  workspace: string,
  request: TypeScriptRequest,
  source: TypeScriptSource,
  limits: TypeScriptLimits,
  artifact: CompilerDerivative,
  monotonic: Monotonic,
): DerivativeTypeScriptPrerequisite {
  // Proof: original-policy forwarding and late ceiling rereads lost snapshot/getter controls.
  const capturedLimits = captureTypeScriptLimits(limits);
  const capturedRequest = captureRequest(request, capturedLimits.maximumOutputBytes);
  const provenance = readCompilerDerivativeProvenance(artifact);
  return withCompilerDerivative(artifact, monotonic, (compiler) => {
    // Proof: original-request forwarding lost actual core output after callback mutation.
    const core = extractTypeScriptObservations(
      workspace,
      capturedRequest,
      source,
      { kind: 'bounded', limits: capturedLimits },
      // Proof: a constant test-only installed namespace dependency, substituted only here, loses
      // the authenticated createProgram sentinel; actual namespace control/restoration pass.
      compiler,
      selectDerivative(provenance),
      'compatible',
    );
    // Proof: original-request publication lost the detached request snapshot assertion.
    const envelope: DerivativeEnvelope = {
      schemaVersion: 1,
      kind: 'typescript-derivative-prerequisite',
      runtimeTrust: 'unverified',
      request: capturedRequest,
      compiler: provenance,
      ...core,
    };
    // Proof: removing this whole-envelope cap admitted the exact one-byte-short allowance.
    if (Buffer.byteLength(serializeCanonical(envelope), 'utf8') > capturedLimits.maximumOutputBytes)
      throw new Error('TypeScript derivative output byte limit exceeded');
    const frozen = freezeDetached(envelope);
    // Proof: private binding of the original request lost its post-callback snapshot assertion.
    const metadata = freezeDetached({ request: capturedRequest, compiler: provenance });
    // Proof: omission lost valid binding lookup; independently registering before cap or after
    // cap/before freeze exposed failed envelopes to the exact-owner witness.
    extractions.set(frozen, { artifact, metadata });
    // Boundary: exact private registration follows successful whole-envelope cap and deep freeze.
    return frozen as DerivativeTypeScriptPrerequisite;
  });
}

/** Reads only the private exact output/artifact join; no token properties or namespace escape. */
export function readDerivativeTypeScriptBinding(
  extraction: unknown,
  artifact: CompilerDerivative,
): ExtractionMetadata {
  const binding =
    typeof extraction === 'object' && extraction !== null ? extractions.get(extraction) : undefined;
  // Proof: omitted lookup refusal loses matching-tag computation/copy modeled errors to native
  // property failure (not publication). Artifact equality omission admits a genuine equal-content
  // foreign artifact; complete structural matching-tag envelopes still have no private ownership.
  if (binding === undefined) throw new Error('owned derivative TypeScript extraction required');
  if (binding.artifact !== artifact)
    throw new Error('owned derivative TypeScript extraction required');
  return binding.metadata;
}
