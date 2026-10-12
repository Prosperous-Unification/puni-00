import { Buffer } from 'node:buffer';
import { posix } from 'node:path';

import { parseOrThrow } from '@shared/validation';

import { RelationshipDeclaration, RelationshipRequest } from '../contracts/records';
import { hashBytes } from '../evidence/content-manifest';
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

function readDeclaration(candidate: RetainedCandidate, requestedPath: string): Uint8Array {
  const seen = new Set<string>();
  const resolved: string[] = [];
  const remaining = requestedPath.split('/');
  while (remaining.length > 0) {
    const component = remaining.shift();
    if (component === undefined || component === '' || component === '.') continue;
    if (component === '..') {
      if (resolved.pop() === undefined)
        throw new Error(`historical declaration escapes candidate: ${requestedPath}`);
      continue;
    }
    const path = [...resolved, component].join('/');
    const entry = candidate.snapshot.entries.find((selected) => selected.path === path);
    if (entry?.mode === '120000') {
      if (seen.has(path)) throw new Error(`historical declaration symlink cycle: ${requestedPath}`);
      seen.add(path);
      const raw = candidate.readBlob(entry.blob, path);
      let target: string;
      try {
        target = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
      } catch (cause) {
        throw new Error(`historical declaration symlink malformed: ${path}`, { cause });
      }
      if (target.length === 0 || target.startsWith('/') || target.includes('\0'))
        throw new Error(`historical declaration symlink target invalid: ${path}`);
      remaining.unshift(...target.split('/'));
      continue;
    }
    if (entry === undefined && remaining.length === 0)
      throw new Error(`historical declaration absent: ${requestedPath}`);
    resolved.push(component);
  }
  const path = posix.join(...resolved);
  const entry = candidate.snapshot.entries.find((selected) => selected.path === path);
  if (entry === undefined) throw new Error(`historical declaration absent: ${requestedPath}`);
  if (entry.mode !== '100644' && entry.mode !== '100755')
    throw new Error(`historical declaration mode unsupported: ${requestedPath}`);
  return candidate.readBlob(entry.blob, path);
}

/** Derives a non-authorizing selector census; historical object proof and retention follow separately. */
export function deriveHistoricalSelections(
  candidate: RetainedCandidate,
  installedRequest: RelationshipRequest,
  limits: HistoricalDiscoveryLimits,
): readonly HistoricalSelection[] {
  const request = parseOrThrow(RelationshipRequest, installedRequest);
  for (const [label, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`historical ${label} must be a positive safe integer`);
  }
  const paths = request.declarationPaths ?? [];
  if (paths.length > limits.maximumDeclarationPaths)
    throw new Error('historical declaration path ceiling exceeded');
  const bySelector = new Map<string, HistoricalSelection>();
  let factCount = 0;
  for (const path of paths) {
    const bytes = readDeclaration(candidate, path);
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
