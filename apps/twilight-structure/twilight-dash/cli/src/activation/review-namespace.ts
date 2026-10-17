import { Buffer } from 'node:buffer';

import { hashCanonical } from '@twilight-burokrat/judge';

import { readReviewRuntimeProvenance, type ReviewRuntime } from './review-runtime';
import {
  readRetainedCandidateProvenance,
  type RetainedCandidate,
} from './review-selection-objects';

export interface RetainedNamespaceLimits {
  readonly maximumEntries: number;
  readonly maximumNodes: number;
  readonly maximumPathBytes: number;
  readonly maximumTotalPathBytes: number;
}
type CandidateTuple = Readonly<RetainedCandidate['snapshot']['entries'][number]>;
type RuntimeTuple = Readonly<ReviewRuntime['closure']['files'][number]>;
export type RetainedNamespaceNode =
  | Readonly<{ kind: 'directory'; path: string }>
  | Readonly<{ kind: 'candidate-file' | 'candidate-symlink'; path: string; source: CandidateTuple }>
  | Readonly<{ kind: 'runtime-file'; path: string; source: RuntimeTuple }>;
export interface RetainedNamespace {
  readonly workingDirectory: '/__puni_review__/candidate';
  /** Configuration only; does not assert this directory exists in nodes. */
  readonly libraryDirectory: '/__puni_review__/candidate/node_modules/typescript/lib';
  readonly caseSensitive: true;
  readonly nodes: readonly RetainedNamespaceNode[];
}
export interface RetainedNamespaceProvenance {
  readonly snapshotIdentity: string;
  readonly classificationPolicyIdentity: string;
  readonly runtimeClosureIdentity: string;
  /** Opaque closure field; it is neither joined to nor replaced by namespacePolicyIdentity. */
  readonly resolutionPolicyIdentity: string;
  readonly namespacePolicyIdentity: string;
  readonly runtimeTrust: 'unverified';
}
const Owners = new WeakMap<RetainedNamespace, Readonly<RetainedNamespaceProvenance>>();
const CandidateRoot = '/__puni_review__/candidate';
const LibraryDirectory = '/__puni_review__/candidate/node_modules/typescript/lib';
// Proof: recipe-field omission changes the literal canonical vector in the V1 recipe oracle.
// Proof: freeze-policy omission loses the V1 recipe oracle's frozen object assertion.
const NamespacePolicy = Object.freeze({
  schemaVersion: 1,
  kind: 'retained-review-namespace-policy',
  candidatePrefix: CandidateRoot,
  runtimeDependencyPrefix: 'node_modules/',
  runtimeMountPrefix: CandidateRoot,
  workingDirectory: CandidateRoot,
  libraryDirectory: LibraryDirectory,
  caseSensitive: true,
  pathGrammar: 'well-formed-unicode-posix-relative-no-empty-dot-traversal-nul-backslash',
  // Proof: freeze-policy-candidate-components loses the V1 recipe oracle's frozen array assertion.
  candidateForbiddenComponents: Object.freeze(['.git', 'node_modules']),
  // Proof: freeze-policy-runtime-components loses the V1 recipe oracle's frozen array assertion.
  runtimeForbiddenComponents: Object.freeze(['.git']),
  // Proof: freeze-policy-modes loses the V1 recipe oracle's frozen array assertion.
  candidateModes: Object.freeze(['100644', '100755', '120000']),
  symlinks: 'opaque',
  conflicts: 'reject-duplicate-mount-and-nondirectory-ancestor',
  directories: 'valid-prefixes-including-root',
  order: 'utf8-byte-ascending',
});

/** Requires the exact published index; a spread copy cannot certify a different census. */
export function readRetainedNamespaceProvenance(
  namespace: RetainedNamespace,
): Readonly<RetainedNamespaceProvenance> {
  const provenance = Owners.get(namespace);
  // Proof: namespace-owner omission loses the named copied-index refusal in source-removal positives.
  if (provenance === undefined) throw new Error('owned retained namespace required');
  return provenance;
}

/**
 * Builds a metadata-only fixed POSIX index from exact owned candidate/runtime censuses.
 * All declared runtime entries count before filtering; only dependency paths beginning
 * node_modules/ mount beside candidate files. Symlink tuples remain opaque. No content,
 * filesystem, compiler, environment, history or symlink-resolution authority is exercised.
 * Limits are captured once; path bounds precede concatenation and UTF-8 allocation.
 * The fixed private policy is hashed once after owner and limit admission.
 * @throws Error for foreign owners, malformed or conflicting paths/modes, or exceeded bounds.
 */
export function createRetainedNamespace(
  candidate: RetainedCandidate,
  runtime: ReviewRuntime,
  installedLimits: RetainedNamespaceLimits,
): RetainedNamespace {
  // Proof: candidate-owner omission reaches a poisoned census; false-empty copy loses named refusal.
  const candidateProof = readRetainedCandidateProvenance(candidate);
  const runtimeProof = readReviewRuntimeProvenance(runtime);
  // Proof: limit-snapshot omission rereads changing getters and refuses the valid namespace.
  const limits = {
    maximumEntries: installedLimits.maximumEntries,
    maximumNodes: installedLimits.maximumNodes,
    maximumPathBytes: installedLimits.maximumPathBytes,
    maximumTotalPathBytes: installedLimits.maximumTotalPathBytes,
  };
  // Proof: limit-grammar omission admits undefined/zero/NaN/unsafe ceilings in named validation tests.
  for (const ceiling of Object.values(limits))
    if (!Number.isSafeInteger(ceiling) || ceiling < 1)
      throw new Error('namespace limit must be a positive safe integer');
  const namespacePolicyIdentity = hashCanonical(NamespacePolicy);
  const entries = candidate.snapshot.entries;
  const files = runtime.closure.files;
  // Proof: entry-cap omission admits five input entries under ceiling four, including hidden dependencies.
  if (
    entries.length > limits.maximumEntries ||
    files.length > limits.maximumEntries - entries.length
  )
    throw new Error('namespace entry ceiling exceeded');
  const nodes = new Map<string, RetainedNamespaceNode>();
  let retainedPathBytes = 0;
  function measurePath(path: string): number {
    // Proof: path-codeunit-cap omission reaches the UTF-8 measurement trap for an overlong source path.
    if (path.length > limits.maximumPathBytes) throw new Error('namespace path ceiling exceeded');
    const length = Buffer.byteLength(path, 'utf8');
    // Proof: path-byte-cap omission reaches the grammar-allocation trap for a multibyte oversized source.
    if (length > limits.maximumPathBytes) throw new Error('namespace path ceiling exceeded');
    return length;
  }
  function validatePath(path: string): number {
    const length = measurePath(path);
    // Proof: path-grammar omission admits injected post-ownership malformed tuples.
    if (
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(path) ||
      path.includes('\0') ||
      path.includes('\\') ||
      path.split('/').some((part) => part === '' || part === '.' || part === '..')
    )
      throw new Error('namespace path malformed');
    return length;
  }
  function appendNode(node: RetainedNamespaceNode, pathBytes: number, sourceBytes = 0): void {
    // Proof: node-cap omission emits root plus seven nodes at ceiling seven.
    if (nodes.size >= limits.maximumNodes) throw new Error('namespace node ceiling exceeded');
    // Proof: total-cap omission retains node and source path fields one byte above the exact bound.
    if (
      pathBytes > limits.maximumTotalPathBytes - retainedPathBytes ||
      sourceBytes > limits.maximumTotalPathBytes - retainedPathBytes - pathBytes
    )
      throw new Error('namespace total path ceiling exceeded');
    retainedPathBytes += pathBytes + sourceBytes;
    // Proof: freeze-node omission loses the explicit frozen node and mutation assertions.
    nodes.set(node.path, Object.freeze(node));
  }
  function mount(
    leaf:
      | Omit<
          Extract<RetainedNamespaceNode, { kind: 'candidate-file' | 'candidate-symlink' }>,
          'path'
        >
      | Omit<Extract<RetainedNamespaceNode, { kind: 'runtime-file' }>, 'path'>,
    sourceBytes: number,
  ): void {
    // Proof: virtual-cap omission constructs a virtual mount beyond its byte ceiling.
    if (sourceBytes > limits.maximumPathBytes - CandidateRoot.length - 1)
      throw new Error('namespace path ceiling exceeded');
    const path = `${CandidateRoot}/${leaf.source.path}`;
    const parts = path.split('/');
    let prefix = '';
    for (let index = 0; index < parts.length - 1; index += 1) {
      const component = parts[index];
      prefix = index === 0 ? '/' : `${prefix === '/' ? '' : prefix}/${component}`;
      const prior = nodes.get(prefix);
      // Proof: ancestor-conflict omission admits candidate a, a-b, a/child for files and opaque symlinks.
      if (prior !== undefined && prior.kind !== 'directory')
        throw new Error('namespace mount conflict');
      if (prior === undefined) appendNode({ kind: 'directory', path: prefix }, measurePath(prefix));
    }
    // Proof: duplicate-conflict omission silently overwrites a duplicate candidate mount.
    if (nodes.has(path)) throw new Error('namespace mount conflict');
    appendNode({ ...leaf, path }, CandidateRoot.length + 1 + sourceBytes, sourceBytes);
  }

  // Empty valid censuses still own the fixed working-directory ancestors.
  for (const path of ['/', '/__puni_review__', CandidateRoot])
    appendNode({ kind: 'directory', path }, measurePath(path));
  for (const entry of entries) {
    const sourceBytes = validatePath(entry.path);
    // Proof: candidate-forbidden omission admits injected .git/node_modules components.
    if (
      entry.path
        .split('/')
        .some((component) => component === '.git' || component === 'node_modules')
    )
      throw new Error('namespace candidate path forbidden');
    // Proof: mode omission admits injected Gitlink/tree/unsupported regular modes.
    if (entry.mode !== '100644' && entry.mode !== '100755' && entry.mode !== '120000')
      throw new Error('namespace candidate mode unsupported');
    mount(
      {
        kind: entry.mode === '120000' ? 'candidate-symlink' : 'candidate-file',
        // Proof: freeze-candidate-tuple omission loses explicit nested frozen/mutation assertions.
        source: Object.freeze({ path: entry.path, mode: entry.mode, blob: entry.blob }),
      },
      sourceBytes,
    );
  }
  for (const file of files) {
    const sourceBytes = validatePath(file.path);
    if (file.role !== 'dependency' || !file.path.startsWith('node_modules/')) continue;
    // Proof: runtime-forbidden omission mounts an authentic declared node_modules/.git/config file.
    if (file.path.split('/').includes('.git')) throw new Error('namespace runtime path forbidden');
    mount(
      {
        kind: 'runtime-file',
        // Proof: freeze-runtime-tuple omission loses explicit nested frozen/mutation assertions.
        source: Object.freeze({
          path: file.path,
          role: file.role,
          identity: file.identity,
          byteLength: file.byteLength,
        }),
      },
      sourceBytes,
    );
  }
  // Proof: freeze-array/freeze-index omissions lose their explicit immutable metadata assertions.
  const namespace: RetainedNamespace = Object.freeze({
    workingDirectory: CandidateRoot,
    libraryDirectory: LibraryDirectory,
    caseSensitive: true,
    nodes: Object.freeze(
      [...nodes.values()].sort((left, right) =>
        Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)),
      ),
    ),
  });
  // Proof: freeze-provenance omission loses the explicit frozen namespace provenance assertion.
  Owners.set(
    namespace,
    Object.freeze({
      ...candidateProof,
      ...runtimeProof,
      // Proof: recipe-pin substitution loses the independent literal SHA-256 oracle assertion.
      namespacePolicyIdentity,
    }),
  );
  return namespace;
}
