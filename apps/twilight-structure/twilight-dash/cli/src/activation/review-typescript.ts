import { Buffer } from 'node:buffer';

import {
  extractTypeScriptRelationshipsFromSource,
  type RelationshipRequest,
  serializeCanonical,
  type TypeScriptLimits,
  type TypeScriptRuntime,
} from '@twilight-burokrat/judge';

import type { RetainedNamespace, RetainedNamespaceProvenance } from './review-namespace';
import type { ReviewRuntime } from './review-runtime';
import type { RetainedCandidate } from './review-selection-objects';
import {
  captureRetainedTypeScriptRequest,
  type RetainedTypeScriptRequestLimits,
} from './review-typescript-request';
import {
  createRetainedTypeScriptSource,
  readRetainedTypeScriptSourceProvenance,
  type RetainedTypeScriptSourceLimits,
  sealRetainedTypeScriptReads,
} from './review-typescript-source';

export type { RetainedTypeScriptRequestLimits } from './review-typescript-request';
export interface RetainedTypeScriptExtractionRequest {
  readonly namespace: RetainedNamespace;
  readonly candidate: RetainedCandidate;
  readonly runtime: ReviewRuntime;
  /** Selected executable namespace; retained runtime bytes do not authenticate this reference. */
  readonly compiler: TypeScriptRuntime;
  readonly request: RelationshipRequest['typescript'];
  readonly sourceLimits: RetainedTypeScriptSourceLimits;
  readonly compilerLimits: TypeScriptLimits;
  readonly requestLimits: RetainedTypeScriptRequestLimits;
}

// Proof: removing readonly makes the compile-only root/nested/request mutation directives unused.
type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
declare const ExtractionBrand: unique symbol;
type ExtractionEnvelope = {
  runtimeTrust: 'unverified';
  provenance: RetainedNamespaceProvenance;
  byteReads: ReturnType<typeof sealRetainedTypeScriptReads>;
} & ReturnType<typeof extractTypeScriptRelationshipsFromSource>;
/** Exact successful extraction; its private brand adds no enumerable or symbol property. */
export type RetainedTypeScriptExtraction = DeepReadonly<ExtractionEnvelope> & {
  // Proof: brand omission makes the compile-only structural reconstruction directive unused.
  readonly [ExtractionBrand]: true;
};
type ExtractionProvenance = DeepReadonly<{
  request: { configPaths: string[]; publicEntrypoints: string[] };
  provenance: RetainedNamespaceProvenance;
}>;
const Extractions = new WeakMap<object, ExtractionProvenance>();

/**
 * Reads the cached private binding of the exact successful extraction object.
 * Foreign objects, including wrappers and proxies, are refused without property reads or IO.
 * @throws Error when extraction was not published by this module.
 */
export function readRetainedTypeScriptExtractionProvenance(
  extraction: unknown,
): ExtractionProvenance {
  const binding =
    typeof extraction === 'object' && extraction !== null ? Extractions.get(extraction) : undefined;
  // Proof: owner-check omission admits impostors; `exact extraction owner rejects impostors` observes no throw.
  if (binding === undefined) throw new Error('owned retained TypeScript extraction required');
  return binding;
}

/** Freezes the extraction graph, which contains no caller capabilities or mutable input paths. */
function freezeExtraction<T extends object>(root: T): DeepReadonly<T> {
  const pending: object[] = [root];
  const seen = new WeakSet<object>();
  for (const value of pending) {
    if (seen.has(value)) continue;
    seen.add(value);
    const children: unknown[] = Object.values(value);
    for (const child of children)
      if (typeof child === 'object' && child !== null) pending.push(child);
    // Proof: blanket freeze omission loses frozen assertions; child-enqueue omission independently loses nested freeze.
    Object.freeze(value);
  }
  // Boundary: every reachable object in the newly constructed value has been frozen above.
  return root as DeepReadonly<T>;
}

/**
 * Mounts an exact owned namespace into the shared compiler and returns unverified runtime
 * provenance. Captures finite limits and bounded unique candidate request paths before source
 * admission. Source ceilings are positive; compiler and request ceilings may be zero.
 * The final ceiling covers the complete envelope, including provenance. IO budgets do not
 * bound synchronous compiler CPU or heap. Successful extraction seals its raw byte census.
 * Only successful, fully frozen envelopes receive a private exact-object request binding.
 * No full compiler read manifest, protected freeze integration, installed runtime
 * authentication or general config-generated escape policy is supplied. Effective root-project
 * typeRoots are admitted through the retained source after parsing and before program creation.
 * @throws Error for invalid requests, foreign owners, config/compiler failures or exceeded bounds.
 */
export function extractRetainedTypeScriptRelationships(
  input: RetainedTypeScriptExtractionRequest,
): RetainedTypeScriptExtraction {
  // Proof: forwarding input.compiler after source admission reached `late compiler selection`;
  // forwarding installed TypeScript lost the selected identity in the capture-once oracle.
  const {
    namespace,
    candidate,
    runtime,
    compiler,
    request,
    sourceLimits,
    compilerLimits,
    requestLimits,
  } = input;
  const {
    request: capturedRequest,
    requestLimits: capturedRequestLimits,
    compilerLimits: capturedCompilerLimits,
    sourceLimits: capturedSourceLimits,
  } = captureRetainedTypeScriptRequest({ request, sourceLimits, compilerLimits, requestLimits });
  const source = createRetainedTypeScriptSource(
    namespace,
    candidate,
    runtime,
    capturedSourceLimits,
  );
  const provenance = readRetainedTypeScriptSourceProvenance(source);
  const extracted = extractTypeScriptRelationshipsFromSource(
    '/__puni_review__/candidate',
    capturedRequest,
    source,
    capturedCompilerLimits,
    compiler,
    // Proof: substituting retained-type-roots admitted the unused absolute outside rootDirs
    // in `retained effective rootDirs refuses absolute outside before program with types empty`.
    'retained-config-roots',
  );
  // Proof: provenance-envelope substitution loses the full owned provenance equality in `sha1 matches legacy`.
  // Proof: mount-before-success loses `byte census seals only after successful extraction`; mount-census omission loses its returned tuple assertions.
  const byteReads = sealRetainedTypeScriptReads(source);
  const envelope = { runtimeTrust: provenance.runtimeTrust, provenance, byteReads, ...extracted };
  // Proof: envelope-cap omission admits one byte below exact in `final envelope one byte below exact`.
  if (Buffer.byteLength(serializeCanonical(envelope)) > capturedRequestLimits.maximumOutputBytes)
    throw new Error('retained TypeScript output ceiling exceeded');
  const frozen = freezeExtraction(envelope);
  // Proof: original-request substitution loses callback-mutation snapshots; public-provenance alias
  // substitution loses copied-record identity only, not authentication or content integrity.
  const binding = freezeExtraction({ request: capturedRequest, provenance: { ...provenance } });
  // Proof: omitted registration loses exact-owner positives; registration before the cap exposes
  // failed envelopes to the WeakMap.set witness in `registers only after compiler cap and freeze succeed`.
  // Independent registration after the cap but before freeze exposes the injected freeze-failure key.
  Extractions.set(frozen, binding);
  // Boundary: successful cap and deep freeze precede the private exact-object registration above.
  return frozen as RetainedTypeScriptExtraction;
}
