import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { parseOrThrow, type } from '@shared/validation';
import {
  hashBytes,
  RelationshipDeclaration,
  RelationshipRequest,
  RelativePath,
  serializeCanonical,
} from '@twilight-burokrat/judge';

import { walkRetainedCurrent } from './review-current-path';
import type { RetainedCandidate } from './review-selection-objects';

export interface HistoricalDiscoveryLimits {
  readonly maximumDeclarationPaths: number;
  readonly maximumDeclarationBytes: number;
  readonly maximumDeclarationFacts: number;
  readonly maximumHistoricalSelections: number;
}

export interface HistoricalSelection {
  readonly revision: string;
  readonly path: string;
  readonly uses: readonly {
    readonly declarationPath: string;
    readonly declarationIdentity: string;
    readonly factId: string;
  }[];
}

const compareText = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

/**
 * Reads current selected bytes, resolving retained symlinks without host path access.
 * Intermediate components require an implicit directory established by retained path prefixes;
 * files cannot be traversed before parent normalization. Fact callers additionally require
 * the original selector path to be selected; declaration discovery may use directory aliases.
 */
export function readRetainedCurrent(
  candidate: RetainedCandidate,
  requestedPath: string,
): Uint8Array {
  const seen = new Set<string>();
  const resolved = walkRetainedCurrent(requestedPath, {
    lookup: (path) => {
      const entry = candidate.snapshot.entries.find((selected) => selected.path === path);
      if (entry !== undefined)
        return { kind: entry.mode === '120000' ? ('symlink' as const) : ('file' as const), entry };
      if (
        path === '' ||
        candidate.snapshot.entries.some((selected) => selected.path.startsWith(`${path}/`))
      )
        return { kind: 'directory' as const, entry: undefined };
      return undefined;
    },
    readLink: (path, node) => {
      if (seen.has(path)) throw new Error(`historical declaration symlink cycle: ${requestedPath}`);
      seen.add(path);
      if (node.entry === undefined) throw new Error('historical declaration symlink tuple absent');
      const raw = candidate.readBlob(node.entry.blob, path);
      let target: string;
      try {
        target = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
      } catch (cause) {
        throw new Error(`historical declaration symlink malformed: ${path}`, { cause });
      }
      if (target.length === 0 || target.startsWith('/') || target.includes('\0'))
        throw new Error(`historical declaration symlink target invalid: ${path}`);
      return target;
    },
    // The historical caller retains its prior finite census/read authority; the source adapter adds lifetime work ceilings.
    step: () => undefined,
    expand: () => undefined,
    reject: (reason, path) => {
      throw new Error(
        reason === 'escape'
          ? `historical declaration escapes candidate: ${requestedPath}`
          : `historical declaration path is not a directory: ${path}`,
      );
    },
  });
  const entry = resolved.node?.entry;
  if (entry === undefined) throw new Error(`historical declaration absent: ${requestedPath}`);
  if (entry.mode !== '100644' && entry.mode !== '100755')
    throw new Error(`historical declaration mode unsupported: ${requestedPath}`);
  return candidate.readBlob(entry.blob, resolved.path);
}

/** Derives the complete sorted declaration census; the proof owner must still capture and validate every selector. */
export function deriveHistoricalSelections(
  candidate: RetainedCandidate,
  installedRequest: RelationshipRequest,
  limits: HistoricalDiscoveryLimits,
): readonly HistoricalSelection[] {
  const request = parseOrThrow(RelationshipRequest, installedRequest);
  for (const [label, value] of Object.entries({
    maximumDeclarationPaths: limits.maximumDeclarationPaths,
    maximumDeclarationBytes: limits.maximumDeclarationBytes,
    maximumDeclarationFacts: limits.maximumDeclarationFacts,
    maximumHistoricalSelections: limits.maximumHistoricalSelections,
  })) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`historical ${label} must be a positive safe integer`);
  }
  const paths = request.declarationPaths ?? [];
  // Proof: independently omitting path, document-byte, fact and selector ceilings made
  // each named historical preparation limit test return a complete capture.
  if (paths.length > limits.maximumDeclarationPaths)
    throw new Error('historical declaration path ceiling exceeded');
  const bySelector = new Map<string, HistoricalSelection>();
  let factCount = 0;
  for (const path of paths) {
    const bytes = readRetainedCurrent(candidate, path);
    if (bytes.length > limits.maximumDeclarationBytes)
      throw new Error(`historical declaration byte ceiling exceeded: ${path}`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch (cause) {
      throw new Error(`historical declaration malformed: ${path}`, { cause });
    }
    const declaration = parseOrThrow(RelationshipDeclaration, parsed);
    const declarationIdentity = hashBytes(bytes);
    factCount += declaration.facts.length;
    if (!Number.isSafeInteger(factCount) || factCount > limits.maximumDeclarationFacts)
      throw new Error('historical declaration fact ceiling exceeded');
    for (const fact of declaration.facts) {
      if (fact.at.kind !== 'historical') continue;
      if (!('path' in fact))
        throw new Error(`historical fact has no selected path: ${fact.factId}`);
      const key = `${fact.at.revision}\0${fact.path}`;
      const use = { declarationPath: path, declarationIdentity, factId: fact.factId };
      const prior = bySelector.get(key);
      if (prior === undefined) {
        bySelector.set(key, { revision: fact.at.revision, path: fact.path, uses: [use] });
        if (bySelector.size > limits.maximumHistoricalSelections)
          throw new Error('historical selection ceiling exceeded');
      } else {
        bySelector.set(key, { ...prior, uses: [...prior.uses, use] });
      }
    }
  }
  return [...bySelector.values()]
    .map((selection) => ({
      ...selection,
      uses: [...selection.uses].sort(
        (left, right) =>
          compareText(left.declarationPath, right.declarationPath) ||
          compareText(left.declarationIdentity, right.declarationIdentity) ||
          compareText(left.factId, right.factId),
      ),
    }))
    .sort(
      (left, right) =>
        compareText(left.revision, right.revision) || compareText(left.path, right.path),
    );
}

const GitId = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const Digest = /^[0-9a-f]{64}$/;
const ObjectReference = type({ gitObjectId: GitId, rawIdentity: Digest }).onUndeclaredKey('reject');
const Selection = type({
  revision: GitId,
  path: RelativePath,
  uses: type({ declarationPath: RelativePath, declarationIdentity: Digest, factId: 'string>=1' })
    .onUndeclaredKey('reject')
    .array(),
}).onUndeclaredKey('reject');
export const RetainedHistoryManifest = type({
  schemaVersion: '1',
  kind: "'retained-review-history'",
  requestIdentity: Digest,
  snapshotIdentity: Digest,
  retainedContentPolicyIdentity: Digest,
  historicalSelectionsIdentity: Digest,
  selections: Selection.array(),
  proofs: type({
    revision: GitId,
    path: RelativePath,
    commit: ObjectReference,
    trees: ObjectReference.array(),
    terminal: type({
      mode: "'100644'|'100755'|'120000'",
      gitObjectId: GitId,
      rawIdentity: Digest,
    }).onUndeclaredKey('reject'),
  })
    .onUndeclaredKey('reject')
    .array(),
}).onUndeclaredKey('reject');
export type RetainedHistoryManifest = typeof RetainedHistoryManifest.infer;

export interface HistoricalRetentionPolicy extends HistoricalDiscoveryLimits {
  readonly request: RelationshipRequest;
  readonly policyIdentity: string;
  readonly maximumHistoricalRevisions: number;
  readonly maximumHistoricalTreeDepth: number;
  readonly maximumHistoricalProofEdges: number;
  readonly maximumRetainedObjects: number;
  readonly maximumObjectBytes: number;
  readonly maximumRetainedBytes: number;
  readonly maximumHistoricalManifestBytes: number;
  /** Revalidates the externally held preparation owner; throws on lost authority. */
  readonly assertOwner: () => void;
}

type ObjectKind = 'commit' | 'tree' | 'blob';
type Reference = typeof ObjectReference.infer;

/** Hashes the exact uncompressed body with its Git object header under the installed format. */
export function hashGitObject(
  kind: ObjectKind,
  bytes: Uint8Array,
  format: 'sha1' | 'sha256',
): string {
  return createHash(format)
    .update(`${kind} ${String(bytes.length)}\0`)
    .update(bytes)
    .digest('hex');
}

function readCommitTree(bytes: Uint8Array, width: number): string {
  const lineEnd = bytes.indexOf(10);
  const first = Buffer.from(bytes.subarray(0, lineEnd)).toString('ascii');
  // Proof: a raw-digest-matched malformed commit with a broken Git hash dependency
  // lost its named header refusal when this decoder check was omitted.
  if (lineEnd !== width + 5 || !first.startsWith('tree ') || !GitId.test(first.slice(5)))
    throw new Error('historical commit tree header malformed');
  return first.slice(5);
}

function readTreeEdge(bytes: Uint8Array, component: string, width: number) {
  let offset = 0;
  let selected: { mode: string; gitObjectId: string } | undefined;
  const names = new Set<string>();
  while (offset < bytes.length) {
    const space = bytes.indexOf(32, offset);
    const nul = bytes.indexOf(0, space + 1);
    const end = nul + 1 + width / 2;
    // Proof: truncating a retained tree and breaking only its Git hash lost the
    // malformed-body refusal when these byte bounds were omitted.
    if (space < offset || nul < space || end > bytes.length)
      throw new Error('historical tree body malformed');
    const mode = Buffer.from(bytes.subarray(offset, space)).toString('ascii');
    // A leading BOM belongs to the Git filename, so decoding must preserve it.
    // Proof: omitting ignoreBOM accepted nested/\uFEFFsource.ts for an absent nested/source.ts;
    // both real SHA-1/SHA-256 tree-filename production tests were RED, then GREEN restored.
    const name = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bytes.subarray(space + 1, nul),
    );
    // Proof: malformed mode, traversal name and duplicate name each lost its
    // decoder refusal under independent omissions with the Git hash dependency broken.
    if (
      !/^(40000|100644|100755|120000|160000)$/.test(mode) ||
      name === '' ||
      name === '.' ||
      name === '..' ||
      name.includes('/') ||
      names.has(name)
    )
      throw new Error('historical tree entry malformed');
    names.add(name);
    if (name === component)
      selected = { mode, gitObjectId: Buffer.from(bytes.subarray(nul + 1, end)).toString('hex') };
    offset = end;
  }
  // Proof: renaming the selected child in a retained tree lost its named missing-edge
  // refusal when this membership guard was omitted with the Git hash dependency broken.
  if (selected === undefined) throw new Error(`historical path absent: ${component}`);
  return selected;
}

/** Captures commit/tree/blob bodies for every derived selector while the private Git store exists. */
export function captureHistoricalObjects(
  candidate: RetainedCandidate,
  policy: HistoricalRetentionPolicy,
  requestIdentity: string,
  snapshotIdentity: string,
  format: 'sha1' | 'sha256',
  readObject: (kind: ObjectKind, identity: string) => Uint8Array,
  rawObjects: Map<string, Uint8Array>,
): RetainedHistoryManifest {
  requireStorageBounds(rawObjects, policy);
  const selections = deriveHistoricalSelections(candidate, policy.request, policy).map(
    (selection) => ({ ...selection, uses: [...selection.uses] }),
  );
  const width = format === 'sha1' ? 40 : 64;
  const retain = (kind: ObjectKind, identity: string): Reference => {
    let bytes: Uint8Array;
    try {
      bytes = readObject(kind, identity);
    } catch (cause) {
      throw new Error(`historical ${kind} unavailable: ${identity}`, { cause });
    }
    if (identity.length !== width || hashGitObject(kind, bytes, format) !== identity)
      throw new Error(`historical ${kind} Git identity differs`);
    const rawIdentity = hashBytes(bytes);
    rawObjects.set(rawIdentity, Uint8Array.from(bytes));
    requireStorageBounds(rawObjects, policy);
    return { gitObjectId: identity, rawIdentity };
  };
  requireSelectionBounds(selections, policy);
  const proofs = selections.map(({ revision, path }) => {
    const commit = retain('commit', revision);
    const body = rawObjects.get(commit.rawIdentity);
    if (body === undefined) throw new Error('historical commit raw body absent');
    let treeId = readCommitTree(body, width);
    const trees: Reference[] = [];
    const components = path.split('/');
    let terminal: RetainedHistoryManifest['proofs'][number]['terminal'] | undefined;
    for (const [index, component] of components.entries()) {
      const tree = retain('tree', treeId);
      trees.push(tree);
      const treeBody = rawObjects.get(tree.rawIdentity);
      if (treeBody === undefined) throw new Error('historical tree raw body absent');
      const child = readTreeEdge(treeBody, component, width);
      if (index < components.length - 1) {
        if (child.mode !== '40000') throw new Error('historical path parent is not a tree');
        treeId = child.gitObjectId;
      } else {
        // Proof: a real selected directory lost its supported-blob refusal when this
        // terminal-mode guard was omitted independently.
        if (child.mode !== '100644' && child.mode !== '100755' && child.mode !== '120000')
          throw new Error('historical terminal is not a supported blob');
        terminal = { mode: child.mode, ...retain('blob', child.gitObjectId) };
      }
    }
    if (terminal === undefined) throw new Error('historical terminal absent');
    return { revision, path, commit, trees, terminal };
  });
  const manifest = {
    schemaVersion: 1 as const,
    kind: 'retained-review-history' as const,
    requestIdentity,
    snapshotIdentity,
    retainedContentPolicyIdentity: policy.policyIdentity,
    historicalSelectionsIdentity: hashBytes(serializeCanonical(selections)),
    selections,
    proofs,
  };
  verifyHistoricalObjects(
    manifest,
    candidate,
    policy,
    requestIdentity,
    snapshotIdentity,
    format,
    rawObjects,
  );
  return manifest;
}

function requireSelectionBounds(
  selections: readonly HistoricalSelection[],
  policy: HistoricalRetentionPolicy,
): void {
  const revisions = new Set(selections.map(({ revision }) => revision));
  const edges = selections.reduce((sum, { path }) => sum + path.split('/').length, 0);
  // Proof: independently omitting revision, pair, depth or proof-edge bounds made the
  // corresponding historical preparation limit test select ready references.
  if (
    selections.length > policy.maximumHistoricalSelections ||
    revisions.size > policy.maximumHistoricalRevisions ||
    selections.some(({ path }) => path.split('/').length > policy.maximumHistoricalTreeDepth) ||
    !Number.isSafeInteger(edges) ||
    edges > policy.maximumHistoricalProofEdges
  )
    throw new Error('historical selector proof bounds exceeded');
}

/** Counts unique head and history bodies together; individual bodies remain independently bounded. */
export function requireStorageBounds(
  rawObjects: ReadonlyMap<string, Uint8Array>,
  policy: HistoricalRetentionPolicy,
): void {
  let total = 0;
  for (const bytes of rawObjects.values()) {
    // Proof: omitting this object ceiling made maximumObjectBytes select references.
    if (bytes.length > policy.maximumObjectBytes)
      throw new Error('historical object byte ceiling exceeded');
    total += bytes.length;
  }
  // Proof: omitting object-count or unique-byte bounds independently made their
  // historical preparation limit tests return a ready capture.
  if (
    rawObjects.size > policy.maximumRetainedObjects ||
    !Number.isSafeInteger(total) ||
    total > policy.maximumRetainedBytes
  )
    throw new Error('historical retained storage ceiling exceeded');
}

/** Reproves exact commit/tree edges and selector completeness solely from retained bodies. */
export function verifyHistoricalObjects(
  manifest: RetainedHistoryManifest,
  candidate: RetainedCandidate,
  policy: HistoricalRetentionPolicy,
  requestIdentity: string,
  snapshotIdentity: string,
  format: 'sha1' | 'sha256',
  rawObjects: ReadonlyMap<string, Uint8Array>,
): void {
  // Proof: request, snapshot and policy were independently substituted in canonical,
  // digest-matched history; each omission failed its named reopen refusal test.
  if (
    manifest.requestIdentity !== requestIdentity ||
    manifest.snapshotIdentity !== snapshotIdentity ||
    manifest.retainedContentPolicyIdentity !== policy.policyIdentity
  )
    throw new Error('historical manifest binding differs');
  requireStorageBounds(rawObjects, policy);
  const selections = deriveHistoricalSelections(candidate, policy.request, policy).map(
    (selection) => ({ ...selection, uses: [...selection.uses] }),
  );
  // Proof: removing the census comparator admitted repinned empty provenance;
  // separately omitting selector digest or proof count failed their reopen tests.
  if (
    serializeCanonical(selections) !== serializeCanonical(manifest.selections) ||
    hashBytes(serializeCanonical(manifest.selections)) !== manifest.historicalSelectionsIdentity ||
    manifest.proofs.length !== selections.length
  )
    throw new Error('historical selector completeness differs');
  requireSelectionBounds(selections, policy);
  requireStorageBounds(rawObjects, policy);
  // Proof: omitting this ceiling published a history manifest with a one-byte limit.
  if (Buffer.byteLength(serializeCanonical(manifest)) > policy.maximumHistoricalManifestBytes)
    throw new Error('historical manifest byte ceiling exceeded');
  const width = format === 'sha1' ? 40 : 64;
  const read = (reference: Reference, kind: ObjectKind): Uint8Array => {
    const bytes = rawObjects.get(reference.rawIdentity);
    if (bytes === undefined) throw new Error('historical retained object absent');
    // Proof: altered commit, tree and blob bodies were separately repinned by raw
    // SHA-256; omitting only Git-body hashing failed each named kind-identity test.
    if (
      hashBytes(bytes) !== reference.rawIdentity ||
      reference.gitObjectId.length !== width ||
      hashGitObject(kind, bytes, format) !== reference.gitObjectId
    )
      throw new Error(`historical ${kind} object identity differs`);
    return bytes;
  };
  for (const [index, proof] of manifest.proofs.entries()) {
    const selection = selections.at(index);
    // Proof: canonical substitutions of revision, path and commit each lost their
    // named selector refusal with the corresponding join omitted independently.
    if (
      proof.revision !== selection?.revision ||
      proof.path !== selection.path ||
      proof.commit.gitObjectId !== proof.revision
    )
      throw new Error('historical proof selector differs');
    const components = proof.path.split('/');
    // Proof: a truncated proof opened when the tree-count check was omitted.
    if (proof.trees.length !== components.length)
      throw new Error('historical proof tree count differs');
    let expectedTree = readCommitTree(read(proof.commit, 'commit'), width);
    for (const [depth, tree] of proof.trees.entries()) {
      // Proof: replacing root or nested parent with another real retained tree
      // independently lost its named parent refusal when this join was omitted.
      if (tree.gitObjectId !== expectedTree)
        throw new Error('historical proof parent tree differs');
      const component = components.at(depth);
      if (component === undefined) throw new Error('historical proof component absent');
      const edge = readTreeEdge(read(tree, 'tree'), component, width);
      if (depth < components.length - 1) {
        // Proof: a retained directory edge relabeled as a blob lost its named parent-mode
        // refusal when this guard was omitted with only the Git hash dependency broken.
        if (edge.mode !== '40000') throw new Error('historical proof parent mode differs');
        expectedTree = edge.gitObjectId;
        // Proof: separately changing terminal mode or blob lost the corresponding
        // terminal-edge refusal when its comparator was omitted independently.
      } else if (
        edge.mode !== proof.terminal.mode ||
        edge.gitObjectId !== proof.terminal.gitObjectId
      ) {
        throw new Error('historical proof terminal edge differs');
      }
    }
    read(proof.terminal, 'blob');
  }
}
