import { Buffer } from 'node:buffer';
import { posix } from 'node:path';

import type { TypeScriptSource } from '@twilight-burokrat/judge';
import ts from 'typescript';

import { walkRetainedCurrent } from './review-current-path';
import {
  readRetainedNamespaceProvenance,
  type RetainedNamespace,
  type RetainedNamespaceNode,
  type RetainedNamespaceProvenance,
} from './review-namespace';
import { readReviewRuntimeProvenance, type ReviewRuntime } from './review-runtime';
import {
  readRetainedCandidateProvenance,
  readRetainedFileIdentity,
  type RetainedCandidate,
} from './review-selection-objects';
export interface RetainedTypeScriptSourceLimits {
  readonly maximumNodes: number;
  readonly maximumProbes: number;
  readonly maximumSteps: number;
  readonly maximumReads: number;
  readonly maximumReadBytes: number;
  readonly maximumPathBytes: number;
  readonly maximumTargetBytes: number;
  readonly maximumExpandedPathBytes: number;
  readonly maximumLinkExpansions: number;
  readonly maximumDirectoryDepth: number;
  readonly maximumPatterns: number;
  readonly maximumPatternBytes: number;
  readonly maximumEnumeratedEntries: number;
  readonly maximumReturnedPathBytes: number;
}
type MatchFiles = (
  path: string,
  extensions: readonly string[] | undefined,
  exclude: readonly string[] | undefined,
  include: readonly string[] | undefined,
  caseSensitive: boolean,
  cwd: string,
  depth: number | undefined,
  entries: (path: string) => { files: string[]; directories: string[] },
  realpath: (path: string) => string,
) => string[];
/** The lockfile-pinned @typescript/old 6.0.3 matcher is pure and delegates all namespace access to callbacks. */
function readMatcher(): MatchFiles {
  const runtime: unknown = ts;
  if (
    runtime === null ||
    typeof runtime !== 'object' ||
    !('version' in runtime) ||
    // Proof: matcher-version omission loses `matcher boundary version` (named RED in final fault ledger).
    runtime.version !== '6.0.3' ||
    !('matchFiles' in runtime) ||
    typeof runtime.matchFiles !== 'function' ||
    // Proof: matcher-signature omission loses `matcher boundary` (named RED in final fault ledger).
    runtime.matchFiles.length !== 9
  )
    throw new Error('installed TypeScript matchFiles shape differs');
  // Boundary: the pinned 6.0.3 implementation has this private signature; direct sys parity tests cover its callbacks. No ts.sys fallback is permitted.
  return runtime.matchFiles as MatchFiles;
}
const Owners = new WeakMap<TypeScriptSource, Readonly<RetainedNamespaceProvenance>>();
/** Requires the exact frozen adapter; copies cannot certify another source. */
export function readRetainedTypeScriptSourceProvenance(
  source: TypeScriptSource,
): Readonly<RetainedNamespaceProvenance> {
  const provenance = Owners.get(source);
  // Proof: source-owner omission loses `source owners` (named RED in final fault ledger).
  if (provenance === undefined) throw new Error('owned retained TypeScript source required');
  return provenance;
}
/**
 * Admits exact owned censuses and exposes only the fixed virtual candidate namespace.
 * Reads reserve raw bytes before copying and decode fatal UTF-8 (file BOMs strip;
 * link BOMs preserve). Candidate links cannot reach runtime dependency mounts.
 * Every operation shares lifetime probe/step/read/pattern/enumeration/path-output budgets;
 * link expansions and directory depth additionally bound each component walk.
 * Enumeration reserves all visited child paths before the pinned pure matcher filters them.
 * Pattern arrays capture their length once before indexed reads; missing entries throw.
 * Include/exclude patterns admit no '.'/'..' components; all syntax is checked before
 * literal-prefix link reads. This does not claim full tsconfig pattern compatibility.
 * This is direct source admission only: no compiler, config parser or read manifest runs,
 * and {@link readRetainedTypeScriptSourceProvenance} preserves unverified runtime trust.
 * @throws Error for foreign owners, identity drift, malformed/outside paths or exceeded bounds.
 */
export function createRetainedTypeScriptSource(
  namespace: RetainedNamespace,
  candidate: RetainedCandidate,
  runtime: ReviewRuntime,
  installedLimits: RetainedTypeScriptSourceLimits,
): TypeScriptSource {
  const provenance = readRetainedNamespaceProvenance(namespace);
  const candidateProof = readRetainedCandidateProvenance(candidate);
  const runtimeProof = readReviewRuntimeProvenance(runtime);
  if (
    // Proof: join-snapshotIdentity omission loses `source joins independent namespace identity field snapshotIdentity` (named RED in final fault ledger).
    provenance.snapshotIdentity !== candidateProof.snapshotIdentity ||
    // Proof: join-classificationPolicyIdentity omission loses `source joins independent namespace identity field classificationPolicyIdentity` (named RED in final fault ledger).
    provenance.classificationPolicyIdentity !== candidateProof.classificationPolicyIdentity ||
    // Proof: join-runtimeClosureIdentity omission loses `source joins independent namespace identity field runtimeClosureIdentity` (named RED in final fault ledger).
    provenance.runtimeClosureIdentity !== runtimeProof.runtimeClosureIdentity ||
    // Proof: join-resolutionPolicyIdentity omission loses `source joins independent namespace identity field resolutionPolicyIdentity` (named RED in final fault ledger).
    provenance.resolutionPolicyIdentity !== runtimeProof.resolutionPolicyIdentity
  )
    throw new Error('retained source identity differs');
  const limits = {
    maximumNodes: installedLimits.maximumNodes,
    maximumProbes: installedLimits.maximumProbes,
    maximumSteps: installedLimits.maximumSteps,
    // Proof: limit-snapshot omission loses `source snapshots` (named RED in final fault ledger).
    maximumReads: installedLimits.maximumReads,
    maximumReadBytes: installedLimits.maximumReadBytes,
    maximumPathBytes: installedLimits.maximumPathBytes,
    maximumTargetBytes: installedLimits.maximumTargetBytes,
    maximumExpandedPathBytes: installedLimits.maximumExpandedPathBytes,
    maximumLinkExpansions: installedLimits.maximumLinkExpansions,
    maximumDirectoryDepth: installedLimits.maximumDirectoryDepth,
    maximumPatterns: installedLimits.maximumPatterns,
    maximumPatternBytes: installedLimits.maximumPatternBytes,
    maximumEnumeratedEntries: installedLimits.maximumEnumeratedEntries,
    maximumReturnedPathBytes: installedLimits.maximumReturnedPathBytes,
  };
  for (const ceiling of Object.values(limits))
    // Proof: limit-grammar omission loses `explicit positive finite` (named RED in final fault ledger).
    if (!Number.isSafeInteger(ceiling) || ceiling < 1)
      throw new Error('source limit must be a positive safe integer');
  // Proof: node-cap omission loses `lifetime probes` (named RED in final fault ledger).
  if (namespace.nodes.length > limits.maximumNodes) throw new Error('source node ceiling exceeded');
  const matchFiles = readMatcher();
  const nodes = new Map(namespace.nodes.map((node) => [node.path, node]));
  let reads = 0;
  let readBytes = 0;
  function readNode(node: Exclude<RetainedNamespaceNode, { kind: 'directory' }>): Uint8Array {
    const identity =
      node.kind === 'runtime-file'
        ? node.source
        : readRetainedFileIdentity(candidate, node.source.path, node.source.blob);
    // Proof: read-cap omission loses `reserves raw` (named RED in final fault ledger).
    if (reads >= limits.maximumReads) throw new Error('source read ceiling exceeded');
    // Proof: read-byte-cap omission loses `byte reserve precedes` (named RED in final fault ledger).
    if (identity.byteLength > limits.maximumReadBytes - readBytes)
      throw new Error('source read byte ceiling exceeded');
    reads += 1;
    readBytes += identity.byteLength;
    return node.kind === 'runtime-file'
      ? runtime.readFile(node.source)
      : candidate.read(
          node.source.path,
          node.source.blob,
          readRetainedFileIdentity(candidate, node.source.path, node.source.blob).rawIdentity,
        );
  }
  let probes = 0;
  let steps = 0;
  const root = namespace.workingDirectory;
  function measure(text: string, ceiling: number, label: string): number {
    // Proof: measure-cap omission loses `lifetime probes` (named RED in final fault ledger).
    // Proof: path-utf8-bytes omission loses `source query counts UTF8` (named RED in final fault ledger).
    // Proof: query-codeunits omission loses `query codeunit bound` (named RED in final fault ledger).
    if (text.length > ceiling || Buffer.byteLength(text) > ceiling)
      throw new Error(`source ${label} ceiling exceeded`);
    return Buffer.byteLength(text);
  }
  function assertQuery(path: string): string {
    measure(path, limits.maximumPathBytes, 'path');
    if (
      // Proof: path-unicode omission loses `direct malformed or outside` (named RED in final fault ledger).
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(path) ||
      // Proof: path-grammar omission loses `direct malformed or outside` (named RED in final fault ledger).
      path.includes('\0') ||
      // Proof: path-backslash omission loses `direct malformed or outside` (named RED in final fault ledger).
      path.includes('\\') ||
      // Proof: path-empty-component omission loses `direct malformed or outside` (named RED in final fault ledger).
      path.includes('//') ||
      // Proof: path-outside omission loses `direct malformed or outside` (named RED in final fault ledger).
      (path !== root && !path.startsWith(`${root}/`))
    )
      throw new Error('source path outside or malformed');
    const relative = path === root ? '' : path.slice(root.length + 1);
    let depth = 0;
    for (const component of relative.split('/')) {
      if (component === '..') {
        depth -= 1;
        // Proof: path-traversal omission loses `lexical outside query refuses` (named RED in final fault ledger).
        if (depth < 0) throw new Error('source path escapes candidate');
      } else if (component !== '' && component !== '.') depth += 1;
    }
    return relative;
  }
  function probe(): void {
    // Proof: probe-cap omission loses `lifetime probes` (named RED in final fault ledger).
    if (probes >= limits.maximumProbes) throw new Error('source probe ceiling exceeded');
    probes += 1;
  }
  function resolvePath(path: string): {
    path: string;
    node: RetainedNamespaceNode | undefined;
    crossedCandidateLink: boolean;
  } {
    const relative = assertQuery(path);
    probe();
    let links = 0;
    const seen = new Set<string>();
    const walked = walkRetainedCurrent(relative, {
      lookup: (path) => {
        const node = nodes.get(path === '' ? root : `${root}/${path}`);
        if (node === undefined) return undefined;
        // Proof: runtime-link-mount omission loses `candidate link expansion` (named RED in final fault ledger).
        if (links > 0 && node.path.split('/').includes('node_modules'))
          throw new Error('source symlink target invalid');
        return {
          kind:
            node.kind === 'directory'
              ? ('directory' as const)
              : node.kind === 'candidate-symlink'
                ? ('symlink' as const)
                : ('file' as const),
          node,
        };
      },
      step: (depth) => {
        // Proof: step-cap omission loses `lifetime probes` (named RED in final fault ledger).
        if (steps >= limits.maximumSteps) throw new Error('source step ceiling exceeded');
        steps += 1;
        // Proof: depth-cap omission loses `lifetime probes` (named RED in final fault ledger).
        if (depth > limits.maximumDirectoryDepth)
          throw new Error('source directory depth ceiling exceeded');
      },
      readLink: (path, wrapped, remaining) => {
        // Proof: link-cap omission loses `lifetime probes` (named RED in final fault ledger).
        if (links >= limits.maximumLinkExpansions) throw new Error('source link ceiling exceeded');
        links += 1;
        const state = `${path}\0${remaining.join('/')}`;
        // Proof: link-cycle omission loses `component walk resolves` (named RED in final fault ledger).
        if (seen.has(state)) throw new Error('source symlink cycle');
        seen.add(state);
        const node = wrapped.node;
        if (node.kind !== 'candidate-symlink') throw new Error('source link kind differs');
        const identity = readRetainedFileIdentity(candidate, node.source.path, node.source.blob);
        // Proof: target-cap omission loses `lifetime probes` (named RED in final fault ledger).
        if (identity.byteLength > limits.maximumTargetBytes)
          throw new Error('source target ceiling exceeded');
        // Proof: link-fatal-utf8 omission loses `source rejects malformed owned link` (named RED in final fault ledger).
        // Proof: link-bom omission loses `component walk resolves` (named RED in final fault ledger).
        const target = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          readNode(node),
        );
        if (
          // Proof: target-empty omission loses `source rejects broken owned link decoder` (named RED in final fault ledger).
          target === '' ||
          // Proof: target-absolute omission loses `source rejects broken owned link decoder` (named RED in final fault ledger).
          target.startsWith('/') ||
          // Proof: target-nul omission loses `source rejects broken owned link decoder` (named RED in final fault ledger).
          target.includes('\0') ||
          // Proof: target-backslash omission loses `source rejects broken owned link decoder` (named RED in final fault ledger).
          target.includes('\\') ||
          target
            .split('/')
            // Proof: target-runtime-component omission loses `candidate link target policy` (named RED in final fault ledger).
            .some((component) => component === 'node_modules' || component === '.git')
        )
          throw new Error('source symlink target invalid');
        return target;
      },
      expand: (resolved, target, remaining) => {
        // Proof: target-only expand-cap omission loses `lifetime probes` (named RED in final fault ledger).
        const targetBytes = measure(target, limits.maximumExpandedPathBytes, 'expanded path');
        let bytes = targetBytes;
        for (const parts of [resolved, remaining])
          for (const part of parts) {
            const length = measure(part, limits.maximumExpandedPathBytes, 'expanded path');
            // Proof: aggregate-fence omission loses `expanded aggregate includes` with individually fitting parts.
            if (length >= limits.maximumExpandedPathBytes - bytes)
              throw new Error('source expanded path ceiling exceeded');
            bytes += length + 1;
          }
      },
      reject: (reason) => {
        throw new Error(
          reason === 'escape'
            ? 'retained path escapes candidate'
            : 'retained path is not a directory',
        );
      },
    });
    return {
      path: walked.path === '' ? root : `${root}/${walked.path}`,
      node: walked.node?.node,
      crossedCandidateLink: links > 0,
    };
  }
  const children = new Map<string, RetainedNamespaceNode[]>();
  for (const node of namespace.nodes) {
    const parent = posix.dirname(node.path);
    if (node.path === parent) continue;
    const siblings = children.get(parent);
    if (siblings === undefined) children.set(parent, [node]);
    else siblings.push(node);
  }
  let enumerated = 0;
  let returnedBytes = 0;
  let patterns = 0;
  let patternBytes = 0;
  function returnPath(path: string): string {
    const length = Buffer.byteLength(path);
    // Proof: returned-total omission loses `source query counts UTF8` (named RED in final fault ledger).
    if (length > limits.maximumReturnedPathBytes - returnedBytes)
      throw new Error('source returned path ceiling exceeded');
    returnedBytes += length;
    return path;
  }
  function entries(
    path: string,
    candidateOnlyRoot: boolean,
  ): { files: string[]; directories: string[] } {
    const resolved = resolvePath(path);
    const files: string[] = [];
    const directories: string[] = [];
    if (resolved.node?.kind !== 'directory') return { files, directories };
    for (const child of children.get(resolved.path) ?? []) {
      // Proof: enumeration-cap omission loses `enumeration patterns` (named RED in final fault ledger).
      if (enumerated >= limits.maximumEnumeratedEntries)
        throw new Error('source enumeration ceiling exceeded');
      enumerated += 1;
      if (
        // Proof: entries-alias-provenance omission loses `root and prefix canonicalization` (named RED in final fault ledger).
        (resolved.crossedCandidateLink || candidateOnlyRoot) &&
        child.path.split('/').includes('node_modules')
      )
        throw new Error('source symlink target invalid');
      const name = posix.basename(child.path);
      if (
        name.length + 1 > limits.maximumPathBytes - path.length ||
        // Proof: child-utf8-bytes omission loses `enumeration child UTF8` (named RED in final fault ledger).
        Buffer.byteLength(name) + 1 > limits.maximumPathBytes - Buffer.byteLength(path)
      )
        throw new Error('source path ceiling exceeded');
      const virtualPath = `${path.endsWith('/') ? path.slice(0, -1) : path}/${name}`;
      const terminal = child.kind === 'candidate-symlink' ? resolvePath(virtualPath).node : child;
      if (terminal === undefined) continue;
      // Reserve every path passed to the matcher before it can accumulate a filtered result.
      returnPath(virtualPath);
      if (terminal.kind === 'directory') directories.push(name);
      else files.push(name);
    }
    return { files, directories };
  }
  function capturePatterns(
    values: readonly string[] | undefined,
    path: string,
    isExtension: boolean,
  ): readonly string[] | undefined {
    if (values === undefined) return undefined;
    const indexedValues: readonly (string | undefined)[] = values;
    const count = indexedValues.length;
    // Proof: pattern-count omission loses `enumeration patterns` (named RED in final fault ledger).
    if (count > limits.maximumPatterns - patterns)
      throw new Error('source pattern count ceiling exceeded');
    patterns += count;
    const captured: string[] = [];
    // Proof: snapshot-count omission loses `captured extensions ignore` under an appending getter.
    for (let index = 0; index < count; index++) {
      const value = indexedValues[index];
      // Proof: missing-index omission loses `captured patterns refuse a missing indexed entry`.
      if (value === undefined) throw new Error('source pattern missing');
      const length = measure(value, limits.maximumPatternBytes, 'pattern byte');
      // Proof: pattern-byte omission loses `pattern byte budget counts` (named RED in final fault ledger).
      if (length > limits.maximumPatternBytes - patternBytes)
        throw new Error('source pattern byte ceiling exceeded');
      patternBytes += length;
      // Proof: pattern-syntax omission loses `pattern syntax admission precedes link copies` independently for NUL, backslash and surrogate.
      if (
        value.includes('\0') ||
        value.includes('\\') ||
        /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)
      )
        throw new Error('source pattern malformed');
      if (!isExtension) {
        // Proof: pattern-drive-root omission loses `drive-rooted matcher` before the link-copy sentinel.
        if (/^[A-Za-z]:/u.test(value)) throw new Error('source pattern outside namespace');
        assertQuery(posix.resolve(path, value));
        // Proof: pattern-dot-grammar omission loses `pattern dot components` (named RED in final fault ledger).
        if (value.split('/').some((component) => component === '.' || component === '..'))
          throw new Error('source pattern dot component invalid');
      }
      captured.push(value);
    }
    return captured;
  }
  function resolvePatterns(
    values: readonly string[] | undefined,
    path: string,
    context: { candidateOnlyRoot: boolean },
  ): readonly string[] | undefined {
    if (values === undefined) return undefined;
    const admitted: string[] = [];
    for (const value of values) {
      const components = value.split('/');
      const wildcard = components.findIndex((component) => /[*?]/u.test(component));
      const literal = wildcard < 0 ? components : components.slice(0, wildcard);
      const prefix = literal.join('/');
      const base = path.endsWith('/') ? path.slice(0, -1) : path;
      const query = prefix.startsWith('/') ? prefix : prefix === '' ? base : `${base}/${prefix}`;
      // Proof: literal-prefix-walk omission loses `literal.*prefix` (named RED in final fault ledger).
      const resolved = resolvePath(query);
      if (resolved.node === undefined) continue;
      // Proof: prefix-alias-provenance omission loses `root and prefix canonicalization` (named RED in final fault ledger).
      if (resolved.crossedCandidateLink && resolved.path === root) context.candidateOnlyRoot = true;
      admitted.push(value);
    }
    return admitted;
  }
  // Proof: source-freeze omission loses `source owners` (named RED in final fault ledger).
  const source: TypeScriptSource = Object.freeze({
    compilerLibraryDirectory: namespace.libraryDirectory,
    useCaseSensitiveFileNames: true,
    getCurrentDirectory: () => {
      probe();
      // Proof: cwd-output omission loses `cwd shares` (named RED in final fault ledger).
      // Proof: no-cwd-fallback dependency fault reaches the intercepted cwd sentinel in `all direct methods survive`.
      return returnPath(root);
    },
    pathKind: (path: string) => {
      const { node } = resolvePath(path);
      return node === undefined ? 'absent' : node.kind === 'directory' ? 'directory' : 'file';
    },
    readFile: (path: string) => {
      const { node } = resolvePath(path);
      return node === undefined || node.kind === 'directory'
        ? undefined
        : // Proof: file-fatal-utf8 omission loses `fatal UTF8 for files` (named RED in final fault ledger).
          // Proof: no-fallback omission loses `all direct methods survive` (named RED in final fault ledger).
          new TextDecoder('utf-8', { fatal: true }).decode(readNode(node));
    },
    getDirectories: (path: string) => {
      assertQuery(path);
      // Proof: directory-string-order omission loses `directory basenames use` (named RED in final fault ledger).
      return entries(path, false).directories.sort();
    },
    readDirectory: (
      path: string,
      extensions?: readonly string[],
      exclude?: readonly string[],
      include?: readonly string[],
      depth?: number,
    ) => {
      assertQuery(path);
      // Proof: supplied-depth omission loses `supplied enumeration depth refuses before link copies`.
      if (
        depth !== undefined &&
        (!Number.isSafeInteger(depth) || depth < 1 || depth > limits.maximumDirectoryDepth)
      )
        throw new Error('source enumeration depth invalid');
      const context = { candidateOnlyRoot: false };
      const selectedExtensions = capturePatterns(extensions, path, true);
      const capturedExclude = capturePatterns(exclude, path, false);
      const capturedInclude = capturePatterns(include, path, false);
      // Proof: root-walk omission loses `enumeration root walks` (named RED in final fault ledger).
      const resolved = resolvePath(path);
      // Proof: root-miss omission loses `missing enumeration ancestor` (named RED in final fault ledger).
      if (resolved.node?.kind !== 'directory') return [];
      // Proof: root-alias-provenance omission loses `root and prefix canonicalization` (named RED in final fault ledger).
      if (resolved.crossedCandidateLink) context.candidateOnlyRoot = true;
      const enumerationPath = path
        .split('/')
        .some((component) => component === '.' || component === '..')
        ? resolved.path
        : path;
      const selectedExclude = resolvePatterns(capturedExclude, enumerationPath, context);
      const selectedInclude = resolvePatterns(capturedInclude, enumerationPath, context);
      // Proof: all-missing-includes omission loses `missing includes preserve` (named RED in final fault ledger).
      // Proof: caller-include-reread loses `captured includes remain missing-only` under a truncating getter.
      if (
        capturedInclude !== undefined &&
        capturedInclude.length > 0 &&
        selectedInclude?.length === 0
      )
        return [];
      return matchFiles(
        enumerationPath,
        selectedExtensions,
        selectedExclude,
        selectedInclude,
        true,
        root,
        depth,
        (path) => entries(path, context.candidateOnlyRoot),
        (path) => returnPath(resolvePath(path).path),
      );
    },
    realpath: (path: string) => returnPath(resolvePath(path).path),
  });
  Owners.set(source, provenance);
  return source;
}
