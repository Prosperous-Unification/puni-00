import { Buffer } from 'node:buffer';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import type { RelationshipRequest } from '../contracts/records';
import { hashCanonical } from '../evidence/content-manifest';
import { readSelectedBlob } from '../inventory/read-blob';
import type { CandidateSnapshot } from '../inventory/read-candidate';
import { extractDeclaredRelationships } from './declarations';
import { extractNxRelationships } from './nx';
import { extractTypeScriptRelationships } from './typescript';

const compareText = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

function readBlobs(repository: string, candidate: CandidateSnapshot): Map<string, Uint8Array> {
  const blobs = new Map<string, Uint8Array>();
  for (const entry of candidate.entries) {
    if (entry.mode === '160000') continue;
    blobs.set(entry.path, readSelectedBlob(repository, candidate.entries, entry.blob, entry.path));
  }
  return blobs;
}

function assertContained(root: string, path: string, context: string): void {
  const fromRoot = relative(root, path);
  if (fromRoot === '..' || fromRoot.startsWith('../')) {
    throw new Error(`${context} escapes the materialized candidate`);
  }
}

function trustedModules(candidateRoot: string): string {
  const configured = process.env['TOOL_WIKI_TRUSTED_NODE_MODULES'];
  if (configured === undefined || configured.length === 0) {
    throw new Error('trusted TypeScript runtime modules are not configured');
  }
  let modules: string;
  try {
    modules = realpathSync(configured);
  } catch (cause) {
    throw new Error('trusted TypeScript runtime modules are unreadable', { cause });
  }
  const offset = relative(candidateRoot, modules);
  if (offset === '' || (!isAbsolute(offset) && offset !== '..' && !offset.startsWith('../'))) {
    throw new Error('trusted TypeScript runtime modules must be outside the candidate');
  }
  if (!existsSync(join(modules, 'typescript', 'package.json'))) {
    throw new Error('trusted TypeScript runtime modules do not contain TypeScript');
  }
  return modules;
}

function materializeCandidate(
  repository: string,
  candidate: CandidateSnapshot,
): { workspace: string; installedModules: string } {
  if (candidate.untracked.length > 0) {
    throw new Error(
      `relationship extraction cannot resolve untracked diagnostic paths: ${candidate.untracked.join(', ')}`,
    );
  }
  const candidateRoot = realpathSync(repository);
  // Proof: restoring the root-only predicate admitted src/node_modules and its symlink alias;
  // `refuses candidate nested modules` originally received CLI exit 0 instead of 1.
  if (candidate.entries.some((entry) => entry.path.split('/').includes('node_modules'))) {
    throw new Error('relationship candidate may not supply trusted runtime modules');
  }
  const installedModules = trustedModules(candidateRoot);
  const workspace = mkdtempSync(join(tmpdir(), 'tool-wiki-candidate-'));
  try {
    const blobs = readBlobs(repository, candidate);
    const effectiveWorkspace = realpathSync(workspace);
    for (const entry of candidate.entries) {
      const destination = resolve(workspace, entry.path);
      assertContained(workspace, destination, `candidate path ${entry.path}`);
      if (entry.mode === '160000') {
        mkdirSync(destination, { recursive: true });
        continue;
      }
      const bytes = blobs.get(entry.path);
      if (bytes === undefined)
        throw new Error(`relationship candidate blob missing for ${entry.path}`);
      mkdirSync(dirname(destination), { recursive: true });
      if (entry.mode === '120000') {
        let target: string;
        try {
          target = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        } catch (cause) {
          const detail = cause instanceof Error ? cause.message : String(cause);
          throw new Error(
            `relationship candidate symlink target malformed at ${entry.path}: ${detail}`,
            {
              cause,
            },
          );
        }
        assertContained(
          workspace,
          resolve(dirname(destination), target),
          `candidate symlink ${entry.path}`,
        );
        symlinkSync(target, destination);
        continue;
      }
      writeFileSync(destination, bytes);
      if (entry.mode === '100755') chmodSync(destination, 0o755);
    }
    for (const entry of candidate.entries) {
      if (entry.mode !== '120000') continue;
      const destination = resolve(workspace, entry.path);
      let effectiveTarget: string;
      try {
        effectiveTarget = realpathSync(destination);
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new Error(`relationship candidate symlink unresolved at ${entry.path}: ${detail}`, {
          cause,
        });
      }
      // Proof: omitting effective resolution let `escape -> pivot/../outside` exit 0 when
      // `pivot -> .`; the production CLI expected the escape refusal before TypeScript ran.
      assertContained(effectiveWorkspace, effectiveTarget, `candidate symlink ${entry.path}`);
    }
    return { workspace, installedModules };
  } catch (cause) {
    // Proof: omitting cleanup left tool-wiki-candidate-* after a candidate symlink refusal;
    // `cleans a candidate rejected during snapshot symlink materialization` failed.
    rmSync(workspace, { force: true, recursive: true });
    throw cause;
  }
}

function relationshipInput(inputId: string, selectors: unknown): { inputId: string; blob: string } {
  return { inputId, blob: hashCanonical(selectors) };
}

function selectorIdentities(selectors: readonly { identity: string }[]): string[] {
  return selectors.map((selector) => selector.identity).sort(compareText);
}

/** Extracts version-bound structural relationships from one frozen candidate snapshot. */
export function extractRelationships(
  repository: string,
  candidate: CandidateSnapshot,
  request: RelationshipRequest,
) {
  const { workspace, installedModules } = materializeCandidate(repository, candidate);
  try {
    const typescript = extractTypeScriptRelationships(
      workspace,
      request.typescript,
      installedModules,
    );
    const nx = extractNxRelationships(workspace);
    const declarations =
      (request.declarationPaths?.length ?? 0) === 0
        ? undefined
        : extractDeclaredRelationships(repository, workspace, candidate, request, nx.relationships);
    const extractors = [
      nx.extractor,
      typescript.extractor,
      ...(declarations === undefined ? [] : [declarations.extractor]),
    ].sort((left, right) => compareText(left.extractorId, right.extractorId));
    const relationshipInputs = [
      relationshipInput('nx.dependencies', selectorIdentities(nx.relationships.dependencies)),
      relationshipInput('nx.projects', selectorIdentities(nx.relationships.projects)),
      relationshipInput('nx.targets', selectorIdentities(nx.relationships.targets)),
      relationshipInput('typescript.imports', selectorIdentities(typescript.relationships.imports)),
      relationshipInput(
        'typescript.public-declarations',
        selectorIdentities(typescript.relationships.publicDeclarations),
      ),
      relationshipInput(
        'typescript.reverse-edges',
        selectorIdentities(typescript.relationships.reverseEdges),
      ),
      ...(declarations === undefined
        ? []
        : [
            relationshipInput(
              'declarations.edges',
              selectorIdentities(declarations.relationships.edges),
            ),
            relationshipInput(
              'declarations.facts',
              selectorIdentities(declarations.relationships.facts),
            ),
            relationshipInput('declarations.unresolved', declarations.relationships.unresolved),
          ]),
    ].sort((left, right) => compareText(left.inputId, right.inputId));
    return {
      schemaVersion: 1,
      selection: candidate.selection,
      extractors,
      manifestInputs: { relationshipInputs, extractors },
      typescript: typescript.relationships,
      nx: nx.relationships,
      declarations: declarations?.relationships ?? {
        coverage: [],
        facts: [],
        edges: [],
        unresolved: [],
      },
    };
  } finally {
    // Proof: omitting workspace cleanup left tool-wiki-candidate-* in the dedicated scratch root;
    // the production `refuses trusted package copy failure` cleanup assertion failed.
    rmSync(workspace, { force: true, recursive: true });
  }
}
