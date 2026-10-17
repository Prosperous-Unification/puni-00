import { Buffer } from 'node:buffer';

import { parseOrThrow } from '@shared/validation';
import {
  extractTypeScriptRelationshipsFromSource,
  type RelationshipRequest,
  RelativePath,
  serializeCanonical,
  type TypeScriptLimits,
} from '@twilight-burokrat/judge';

import type { RetainedNamespace, RetainedNamespaceProvenance } from './review-namespace';
import type { ReviewRuntime } from './review-runtime';
import type { RetainedCandidate } from './review-selection-objects';
import {
  createRetainedTypeScriptSource,
  readRetainedTypeScriptSourceProvenance,
  type RetainedTypeScriptSourceLimits,
  sealRetainedTypeScriptReads,
} from './review-typescript-source';

export interface RetainedTypeScriptRequestLimits {
  readonly maximumConfigPaths: number;
  readonly maximumPublicEntrypoints: number;
  readonly maximumPathBytes: number;
  readonly maximumTotalPathBytes: number;
  readonly maximumOutputBytes: number;
}
export interface RetainedTypeScriptExtractionRequest {
  readonly namespace: RetainedNamespace;
  readonly candidate: RetainedCandidate;
  readonly runtime: ReviewRuntime;
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

function captureLimits<K extends string>(
  limits: Readonly<Record<K, number>>,
  names: readonly K[],
  minimum: number,
): Record<K, number> {
  // Boundary: every named key is inserted exactly once, validated as a safe integer below.
  const captured = {} as Record<K, number>;
  for (const name of names) {
    const ceiling = limits[name];
    // Proof: independent limit-safe/limit-minimum omissions lose `validates every limit field before source admission`.
    if (!Number.isSafeInteger(ceiling) || ceiling < minimum)
      throw new Error(`retained TypeScript limit ${name} invalid`);
    captured[name] = ceiling;
  }
  return captured;
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
  const { namespace, candidate, runtime, request, sourceLimits, compilerLimits, requestLimits } =
    input;
  // Proof: output/compiler/source-snapshot substitutions lose `callbacks mutate caller objects`;
  // getter capture is observed once in `snapshots each path and limit getter once`.
  const capturedRequestLimits = captureLimits(
    requestLimits,
    [
      'maximumConfigPaths',
      'maximumPublicEntrypoints',
      'maximumPathBytes',
      'maximumTotalPathBytes',
      'maximumOutputBytes',
    ],
    0,
  );
  const capturedCompilerLimits = captureLimits(
    compilerLimits,
    [
      'maximumProbes',
      'maximumReadBytes',
      'maximumDirectoryEntries',
      'maximumObservedOutputBytes',
      'maximumOutputBytes',
    ],
    0,
  );
  const capturedSourceLimits = captureLimits(
    sourceLimits,
    [
      'maximumNodes',
      'maximumProbes',
      'maximumSteps',
      'maximumReads',
      'maximumReadBytes',
      'maximumReadEntries',
      'maximumReadLedgerBytes',
      'maximumPathBytes',
      'maximumTargetBytes',
      'maximumExpandedPathBytes',
      'maximumLinkExpansions',
      'maximumDirectoryDepth',
      'maximumPatterns',
      'maximumPatternBytes',
      'maximumEnumeratedEntries',
      'maximumReturnedPathBytes',
    ],
    1,
  );
  const configPaths = request.configPaths;
  const publicEntrypoints = request.publicEntrypoints;
  // Proof: independent config-array/public-array omissions lose `array impostors before source admission`.
  if (!Array.isArray(configPaths) || !Array.isArray(publicEntrypoints))
    throw new Error('retained TypeScript request arrays required');
  const configCount = configPaths.length;
  const publicCount = publicEntrypoints.length;
  // Proof: config/public-nonempty omissions lose `malformed or noncandidate requests`;
  // independent count omissions lose `fixed request lengths` and `bounds UTF8 paths and public count`.
  // Proof: config-count-safe/public-count-safe omissions reach source admission with NaN proxy lengths;
  // `validates captured proxy array lengths before indexed reads` fails.
  if (
    !Number.isSafeInteger(configCount) ||
    !Number.isSafeInteger(publicCount) ||
    configCount < 1 ||
    publicCount < 1 ||
    configCount > capturedRequestLimits.maximumConfigPaths ||
    publicCount > capturedRequestLimits.maximumPublicEntrypoints
  )
    throw new Error('retained TypeScript request count invalid');
  let pathBytes = 0;
  function capturePaths(paths: readonly string[], count: number): string[] {
    const captured: string[] = [];
    const unique = new Set<string>();
    // Proof: fixed-length omission follows an appending getter into missing.json; `fixed request lengths` fails.
    for (let index = 0; index < count; index++) {
      const path = paths[index];
      // Proof: path-type omission loses `snapshots each path and limit getter once and refuses sparse entries`.
      if (typeof path !== 'string') throw new Error('retained TypeScript request path missing');
      // Proof: path-codeunits omission reaches the encoding sentinel in `bounds path codeunits before UTF8 encoding`.
      if (path.length > capturedRequestLimits.maximumPathBytes)
        throw new Error('retained TypeScript request path ceiling exceeded');
      const bytes = Buffer.byteLength(path);
      // Proof: independent path-utf8/path-total omissions lose `bounds UTF8 paths` and `fixed request lengths`.
      if (
        bytes > capturedRequestLimits.maximumPathBytes ||
        bytes > capturedRequestLimits.maximumTotalPathBytes - pathBytes
      )
        throw new Error('retained TypeScript request path byte ceiling exceeded');
      pathBytes += bytes;
      // Proof: independent drive/surrogate/reserved omissions reach source admission;
      // `malformed or noncandidate requests before retained reads` fails (including an owned replacement-character file).
      if (
        /^[A-Za-z]:/u.test(path) ||
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(path) ||
        path.split('/').some((component) => component === '.git' || component === 'node_modules')
      )
        throw new Error('retained TypeScript request path outside candidate');
      // Proof: relative-path omission reaches source admission in `malformed or noncandidate requests before retained reads`.
      parseOrThrow(RelativePath, path);
      // Proof: unique omission loses duplicated config/public path assertions in `malformed or noncandidate requests`.
      if (unique.has(path)) throw new Error('retained TypeScript request paths must be unique');
      unique.add(path);
      captured.push(path);
    }
    return captured;
  }
  // Proof: request-snapshot substitution uses callback-mutated missing paths; `callbacks mutate caller objects` fails.
  const capturedRequest = {
    configPaths: capturePaths(configPaths, configCount),
    publicEntrypoints: capturePaths(publicEntrypoints, publicCount),
  };
  // Proof: snapshot-freeze omission reaches the compiler callback with unfrozen request arrays.
  freezeExtraction(capturedRequest);
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
    // Proof: selecting compatible mode admitted the root in `refuses absolute outside`.
    'retained-type-roots',
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
