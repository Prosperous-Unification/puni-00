import { parseOrThrow, type } from '@shared/validation';

import { type ContractRecord, decodeRecord } from '../contracts/decode-record';
import {
  ArtifactGraph,
  ContentSelector,
  EvidenceRecordKind,
  OpaqueId,
  Sha256,
} from '../contracts/records';
import { type ClassifiedCandidate, isSelected, type ReadBlob } from '../inventory/classify-entries';
import {
  compareCanonicalText,
  hashBytes,
  hashCanonical,
  serializeCanonical,
} from './content-manifest';

// Proof: omitting this closed boundary accepted endpoint authority fields in the installed-endpoint negative.
const Endpoint = type({
  recordKind: EvidenceRecordKind,
  pathSelector: ContentSelector,
}).onUndeclaredKey('reject');
// Proof: omitting this closed boundary accepted edge authority fields in the installed-edge negative.
const EdgeRule = type({ ruleId: OpaqueId, source: Endpoint, target: Endpoint }).onUndeclaredKey(
  'reject',
);

/** Protected, closed recipe. Candidate records never supply graph dependency policy. */
// Proof: widening each version/kind/algorithm or extra-key boundary failed `closed rule` cases;
// omitting recipe uniqueness or rule ordering independently accepted duplicate installed rules.
export const ArtifactGraphRuleV1 = type({
  schemaVersion: '1',
  kind: "'review-artifact-graph-rule'",
  algorithm: "'record-dependencies.v1'",
  decoderIdentity: Sha256,
  additionalEdges: EdgeRule.array(),
})
  .onUndeclaredKey('reject')
  .narrow((rule, context) =>
    new Set(rule.additionalEdges.map(({ source, target }) => hashCanonical({ source, target })))
      .size === rule.additionalEdges.length &&
    rule.additionalEdges.every(
      (edge, index) =>
        index === 0 ||
        compareCanonicalText(rule.additionalEdges[index - 1].ruleId, edge.ruleId) < 0,
    )
      ? true
      : context.mustBe('unique additional rules sorted by ruleId'),
  );
export type ArtifactGraphRuleV1 = typeof ArtifactGraphRuleV1.infer;

export interface ArtifactGraphLimits {
  maximumVerificationBytes: number;
  maximumRuleBytes: number;
  maximumRules: number;
  maximumSelectors: number;
  maximumSelectorBytes: number;
  maximumEntries: number;
  maximumReads: number;
  maximumReadBytes: number;
  maximumArtifacts: number;
  maximumWork: number;
  maximumEdges: number;
  maximumOutputBytes: number;
}

/** Exact installed source pins; independent runtime authentication remains required. */
export interface ArtifactDecoderFiles {
  readonly 'contracts/records.ts': Uint8Array;
  readonly 'contracts/decode-record.ts': Uint8Array;
}

/** Hashes decoder source bytes without claiming they authenticate the running process. */
export function identifyArtifactDecoder(files: ArtifactDecoderFiles): string {
  return hashCanonical({
    algorithm: 'evidence-record-decoder.v1',
    files: {
      'contracts/records.ts': hashBytes(files['contracts/records.ts']),
      'contracts/decode-record.ts': hashBytes(files['contracts/decode-record.ts']),
    },
  });
}

export interface ArtifactGraphInput {
  candidate: ClassifiedCandidate;
  snapshotIdentity: string;
  ruleBytes: Uint8Array;
  decoderFiles: ArtifactDecoderFiles;
  limits: ArtifactGraphLimits;
  readBlob: ReadBlob;
}

export interface BuiltArtifactGraph {
  graph: ArtifactGraph;
  bytes: string;
  identity: string;
  artifactGraphRuleIdentity: string;
  runtimeTrust: 'unverified';
}

// Proof: omitting the closed document boundary accepted undeclared authority fields.
// Proof: widening runtimeTrust accepted the promoted document in `runtime trust promotion`.
const GraphDocument = type({
  graph: ArtifactGraph,
  bytes: 'string',
  identity: Sha256,
  artifactGraphRuleIdentity: Sha256,
  runtimeTrust: "'unverified'",
}).onUndeclaredKey('reject');

interface EvidenceRecord {
  descriptor: ArtifactGraph['artifacts'][number];
  record: ContractRecord;
}

function requireLimits(limits: ArtifactGraphLimits): void {
  // Proof: omitting grammar accepted NaN/zero/infinite/fractional limits in every `enforces` case.
  for (const [name, ceiling] of Object.entries(limits)) {
    if (!Number.isSafeInteger(ceiling) || ceiling < 1)
      throw new Error(`artifact graph ${name} must be a positive safe integer`);
  }
}

function openCensus(input: ArtifactGraphInput) {
  // Proof: omitting this parse accepted `caller-label` in `snapshot identity must be a full digest`.
  parseOrThrow(Sha256, input.snapshotIdentity);
  requireLimits(input.limits);
  // Proof: omitting this cap lost the named refusal for oversized malformed recipe bytes before decode.
  if (input.ruleBytes.length > input.limits.maximumRuleBytes)
    throw new Error('artifact graph raw recipe byte ceiling exceeded');
  // Proof: disabling fatal recipe decoding lost the encoded-byte refusal for literal 0xff.
  const rawRule: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(input.ruleBytes),
  );
  const rule = parseOrThrow(ArtifactGraphRuleV1, rawRule);
  // Proof: omitting this cap accepted two distinct installed rules under maximumRules=1.
  if (rule.additionalEdges.length > input.limits.maximumRules)
    throw new Error('artifact graph rule count ceiling exceeded');
  // Proof: omitting this cap accepted one two-endpoint rule under maximumSelectors=1.
  if (rule.additionalEdges.length > Math.floor(input.limits.maximumSelectors / 2))
    throw new Error('artifact graph selector count ceiling exceeded');
  for (const edge of rule.additionalEdges)
    for (const endpoint of [edge.source, edge.target]) {
      // Proof: omitting this cap accepted a five-byte selector under maximumSelectorBytes=1.
      if (
        new TextEncoder().encode(endpoint.pathSelector.value).length >
        input.limits.maximumSelectorBytes
      )
        throw new Error('artifact graph selector byte ceiling exceeded');
    }
  // Proof: omitting the decoder join accepted a different installed pin in `closed rule`.
  if (identifyArtifactDecoder(input.decoderFiles) !== rule.decoderIdentity)
    throw new Error('artifact graph decoder identity differs');
  // Proof: omitting this ceiling returned the two-entry census with maximumEntries=1.
  if (input.candidate.entries.length > input.limits.maximumEntries)
    throw new Error('artifact graph entry ceiling exceeded');
  const selected = input.candidate.entries.filter(
    (
      entry,
    ): entry is typeof entry & {
      classification: Extract<typeof entry.classification, { kind: 'evidence' }>;
    } => entry.classification.kind === 'evidence',
  );
  // Proof: omitting this ceiling returned two artifacts with maximumArtifacts=1.
  if (selected.length > input.limits.maximumArtifacts)
    throw new Error('artifact graph artifact ceiling exceeded');
  const records: EvidenceRecord[] = [];
  let reads = 0;
  let readBytes = 0;
  for (const entry of selected) {
    // Proof: omitting this ceiling completed two record reads with maximumReads=1.
    if (reads >= input.limits.maximumReads) throw new Error('artifact graph read ceiling exceeded');
    const bytes = input.readBlob(entry.blob, entry.path);
    reads += 1;
    readBytes += bytes.length;
    // Proof: omitting this ceiling accepted records under maximumReadBytes=1.
    if (!Number.isSafeInteger(readBytes) || readBytes > input.limits.maximumReadBytes)
      throw new Error('artifact graph read byte ceiling exceeded');
    const recordKind = entry.classification.recordKind;
    // Proof: removing fatal only from retained decode(bytes) accepted literal 0xff in the payload;
    // `invalid UTF-8 cannot become replacement text` failed because the builder did not throw.
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Proof: replacing strict decoding with JSON parsing accepted all five malformed standalone kinds.
    const record = decodeRecord(recordKind, JSON.parse(source) as unknown);
    records.push({
      descriptor: {
        artifactId: hashBytes(bytes),
        path: entry.path,
        blob: entry.blob,
        recordKind,
        references: [],
      },
      record,
    });
  }
  const identities = new Set(records.map(({ descriptor }) => descriptor.artifactId));
  const paths = new Set(records.map(({ descriptor }) => descriptor.path));
  // Proof: independent identity/path omissions lost the named duplicate-census refusals.
  if (identities.size !== records.length || paths.size !== records.length)
    throw new Error('artifact graph duplicate evidence identity or path');
  records.sort((left, right) =>
    compareCanonicalText(left.descriptor.artifactId, right.descriptor.artifactId),
  );
  const artifactGraphRuleIdentity = hashCanonical(rule);
  const validationId = `artifact-graph.v1.${hashCanonical({ schemaVersion: 1, snapshotIdentity: input.snapshotIdentity, artifactGraphRuleIdentity })}`;
  return { records, rule, artifactGraphRuleIdentity, validationId };
}

/** Derives only fixed schema dependencies and installed selector edges; payload text is opaque. */
function deriveRelations(
  records: readonly EvidenceRecord[],
  rule: ArtifactGraphRuleV1,
  limits: ArtifactGraphLimits,
) {
  const references = new Map(
    records.map(({ descriptor }) => [descriptor.artifactId, new Set<string>()]),
  );
  let work = 0;
  let edges = 0;
  const charge = () => {
    // Proof: omitting this ceiling completed derivation under maximumWork=1.
    if (work >= limits.maximumWork) throw new Error('artifact graph work ceiling exceeded');
    work += 1;
  };
  const add = (source: EvidenceRecord, target: EvidenceRecord) => {
    // Proof: omitting this ceiling accepted intrinsic plus installed edge work under maximumEdges=1.
    if (edges >= limits.maximumEdges) throw new Error('artifact graph edge ceiling exceeded');
    edges += 1;
    // Proof: omitting this refusal lost the named self-dependency diagnosis in `installed self`.
    if (source === target) throw new Error('evidence cannot require itself');
    const adjacency = references.get(source.descriptor.artifactId);
    // Proof: an injected absent adjacency made the exact-container production test refuse foreign dependency.
    if (adjacency === undefined) throw new Error('artifact graph foreign dependency');
    adjacency.add(target.descriptor.artifactId);
  };
  for (const source of records) {
    charge();
    const review = source.record;
    if (!('receiptKind' in review) || review.receiptKind !== 'review') continue;
    const matches = records.filter((target) => {
      charge();
      const response = target.record;
      return (
        // Proof: independently dropping invocation or payload equality accepted foreign/wrong-payload responses.
        'recordKind' in response &&
        response.invocationId === review.invocationId &&
        hashBytes(response.payload) === review.rawResponseArtifact
      );
    });
    const response = matches.at(0);
    // Proof: omitting cardinality accepted two matching containers in `ambiguous response binding`.
    if (matches.length !== 1 || response === undefined)
      throw new Error(
        `review receipt requires exactly one response container: ${source.descriptor.path}`,
      );
    add(source, response);
  }
  for (const edge of rule.additionalEdges) {
    const select = (endpoint: ArtifactGraphRuleV1['additionalEdges'][number]['source']) =>
      records.filter(({ descriptor }) => {
        // Proof: omitting this charge failed the selector/Cartesian budget production witnesses.
        charge();
        return (
          descriptor.recordKind === endpoint.recordKind &&
          isSelected(descriptor.path, endpoint.pathSelector)
        );
      });
    const sources = select(edge.source);
    const targets = select(edge.target);
    // Proof: independent source/target omissions accepted missing installed matches in selector tests.
    if (sources.length === 0 || targets.length === 0)
      throw new Error(`artifact graph rule requires nonempty matches: ${edge.ruleId}`);
    for (const source of sources)
      for (const target of targets) {
        // Proof: omitting this charge completed four pairs after their installed work budget was exhausted.
        charge();
        add(source, target);
      }
  }
  return references;
}

/** Iterative Kahn traversal bounds stack use and derives the exact zero-indegree roots. */
function deriveRoots(
  records: readonly EvidenceRecord[],
  references: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const indegrees = new Map(records.map(({ descriptor }) => [descriptor.artifactId, 0]));
  for (const targets of references.values())
    for (const target of targets) {
      const count = indegrees.get(target);
      // Proof: injecting an absent indegree made the exact-container production test refuse foreign dependency.
      if (count === undefined) throw new Error('artifact graph foreign dependency');
      indegrees.set(target, count + 1);
    }
  const roots = [...indegrees]
    .filter(([, count]) => count === 0)
    .map(([identity]) => identity)
    .sort(compareCanonicalText);
  const queue = [...roots];
  for (const identity of queue) {
    const targets = references.get(identity);
    // Proof: injecting absent traversal adjacency made the exact-container test refuse traversal identity.
    if (targets === undefined) throw new Error('artifact graph traversal identity absent');
    for (const target of targets) {
      const count = indegrees.get(target);
      // Proof: injecting an absent traversal indegree made the exact-container test refuse traversal target.
      if (count === undefined) throw new Error('artifact graph traversal target absent');
      indegrees.set(target, count - 1);
      if (count === 1) queue.push(target);
    }
  }
  // Proof: omitting this refusal accepted the installed receipt/response cycle.
  if (queue.length !== records.length) throw new Error('cyclic artifact graph');
  return roots;
}

function encodeGraph(
  graph: ArtifactGraph,
  artifactGraphRuleIdentity: string,
  limits: ArtifactGraphLimits,
): BuiltArtifactGraph {
  const bytes = serializeCanonical(graph);
  // Proof: omitting this ceiling returned canonical output under maximumOutputBytes=1.
  if (new TextEncoder().encode(bytes).length > limits.maximumOutputBytes)
    throw new Error('artifact graph output ceiling exceeded');
  return {
    graph,
    bytes,
    identity: hashBytes(bytes),
    artifactGraphRuleIdentity,
    runtimeTrust: 'unverified',
  };
}

/**
 * Produces a deterministic complete finite graph from a retained-only read capability.
 * @throws for malformed records/rules, unmatched response/rule endpoints, cycles or installed bounds.
 * Runtime source pins are explicit; they do not close the independent runtime authority boundary.
 */
export function buildArtifactGraph(input: ArtifactGraphInput): BuiltArtifactGraph {
  const census = openCensus(input);
  const references = deriveRelations(census.records, census.rule, input.limits);
  const roots = deriveRoots(census.records, references);
  const artifacts = census.records.map(({ descriptor }) => {
    const dependencies = references.get(descriptor.artifactId);
    // Proof: injecting absent producer adjacency made the exact-container test refuse dependencies absent.
    if (dependencies === undefined) throw new Error('artifact graph dependencies absent');
    return { ...descriptor, references: [...dependencies].sort(compareCanonicalText) };
  });
  const graph = parseOrThrow(ArtifactGraph, {
    schemaVersion: 1,
    validationId: census.validationId,
    roots,
    artifacts,
  });
  return encodeGraph(graph, census.artifactGraphRuleIdentity, input.limits);
}

/**
 * Bounds raw document bytes before parsing, then independently censuses retained records and
 * compares every complete descriptor/edge/root set.
 * Does not call the producer or accept structurally valid caller graphs as completeness evidence.
 */
export function verifyArtifactGraph(
  input: ArtifactGraphInput,
  documentBytes: Uint8Array,
): BuiltArtifactGraph {
  requireLimits(input.limits);
  // Proof: omitting this cap lost the named refusal for oversized malformed verification bytes before schema decode.
  if (documentBytes.length > input.limits.maximumVerificationBytes)
    throw new Error('artifact graph verification byte ceiling exceeded');
  // Proof: disabling fatal document decoding lost the encoded-byte refusal for literal 0xff.
  const untrusted: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(documentBytes),
  );
  const supplied = parseOrThrow(GraphDocument, untrusted);
  const graph = supplied.graph;
  const census = openCensus(input);
  // Proof: independent validation/rule-identity omissions accepted resealed provenance substitutions.
  if (
    graph.validationId !== census.validationId ||
    supplied.artifactGraphRuleIdentity !== census.artifactGraphRuleIdentity
  )
    throw new Error('artifact graph provenance differs');
  // Proof: omitting coverage lost the named coverage diagnostic for resealed false-empty artifacts.
  if (graph.artifacts.length !== census.records.length)
    throw new Error('artifact graph evidence coverage differs');
  const references = deriveRelations(census.records, census.rule, input.limits);
  for (const [index, evidence] of census.records.entries()) {
    const descriptor = graph.artifacts.at(index);
    // Proof: each artifactId/path/blob/kind join omission accepted its individually resealed descriptor fault.
    if (
      descriptor?.artifactId !== evidence.descriptor.artifactId ||
      descriptor.path !== evidence.descriptor.path ||
      descriptor.blob !== evidence.descriptor.blob ||
      descriptor.recordKind !== evidence.descriptor.recordKind
    )
      throw new Error('artifact graph descriptor differs from retained evidence');
    const expected = references.get(evidence.descriptor.artifactId);
    // Proof: omitting adjacency equality accepted the resealed omitted-edge graph accepted by legacy validation.
    if (
      expected === undefined ||
      serializeCanonical(descriptor.references) !==
        serializeCanonical([...expected].sort(compareCanonicalText))
    )
      throw new Error('artifact graph dependencies differ');
  }
  // Proof: omitting root equality accepted resealed missing roots despite complete descriptors.
  if (
    serializeCanonical(graph.roots) !== serializeCanonical(deriveRoots(census.records, references))
  )
    throw new Error('artifact graph roots differ');
  const encoded = encodeGraph(graph, census.artifactGraphRuleIdentity, input.limits);
  // Proof: independent bytes/digest omissions accepted trailing bytes or a substituted identity.
  if (supplied.bytes !== encoded.bytes || supplied.identity !== encoded.identity)
    throw new Error('artifact graph exact bytes differ');
  return encoded;
}
