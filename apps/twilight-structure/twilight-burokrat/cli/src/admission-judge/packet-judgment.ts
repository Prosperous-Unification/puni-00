import { realpathSync } from 'node:fs';
import { isAbsolute, normalize } from 'node:path';

import { compareCanonicalText } from '../evidence/content-manifest';
import { type CandidateEntry, readCandidate } from '../inventory/read-candidate';
import { assertAuthorityWorktreePath, type AuthorityClaim } from './authority-identities';
import { type AdmissionBase, type AdmissionPacket, assertAdmissionPacket } from './packet-codec';

/** Refuses a worktree path that is relative, unnormalized or a filesystem alias. */
export function canonicalRepository(repository: string): string {
  if (!isAbsolute(repository) || normalize(repository) !== repository) {
    throw new Error(`invalid canonical worktree path: ${repository}`);
  }
  const canonical = realpathSync(repository);
  if (canonical !== repository) {
    throw new Error(`worktree path is a filesystem alias: ${repository}`);
  }
  assertAuthorityWorktreePath(canonical);
  return canonical;
}

function ancestorPaths(path: string): string[] {
  const segments = path.split('/');
  const ancestors: string[] = [];
  for (let end = 1; end < segments.length; end += 1) {
    ancestors.push(segments.slice(0, end).join('/'));
  }
  return ancestors;
}

/** Refuses a packet path that traverses a symlink or Gitlink in the base tree. */
export function assertUnambiguousPath(
  path: string,
  entries: ReadonlyMap<string, CandidateEntry>,
): void {
  for (const ancestor of ancestorPaths(path)) {
    const entry = entries.get(ancestor);
    // Proof: bypassing this submit-time ancestor check made both independently rehashed
    // `CLAUDE.md/escape` and Gitlink-descendant packets reach authority comparison; the
    // production CLI test lost the exact traversal refusal.
    if (entry?.mode === '120000' || entry?.mode === '160000') {
      throw new Error(
        `packet path traverses ${entry.mode === '120000' ? 'symlink' : 'gitlink'}: ${path}`,
      );
    }
  }
}

function entriesEqual(left: CandidateEntry | undefined, right: CandidateEntry): boolean {
  return left?.path === right.path && left.mode === right.mode && left.blob === right.blob;
}

/** Reads the pinned base tree and refuses a commit that does not resolve to it. */
export function readBaseEntries(
  repository: string,
  base: AdmissionBase,
): Map<string, CandidateEntry> {
  const snapshot = readCandidate(repository, { kind: 'committed', revision: base.commit });
  if (snapshot.selection.kind !== 'committed' || snapshot.selection.tree !== base.tree) {
    throw new Error('packet base commit does not resolve to pinned tree');
  }
  return new Map(snapshot.entries.map((entry) => [entry.path, entry]));
}

/** Revalidates every packet path and read tuple against its immutable base tree. */
export function validatePacketAgainstBase(
  repository: string,
  packet: AdmissionPacket,
): Map<string, CandidateEntry> {
  assertAdmissionPacket(packet);
  const worktreePath = canonicalRepository(repository);
  if (worktreePath !== packet.worktreePath) {
    throw new Error('packet repository differs from packet worktree');
  }
  const entries = readBaseEntries(worktreePath, packet.base);
  for (const path of packet.ownedPaths) assertUnambiguousPath(path, entries);
  for (const dependency of packet.readDependencies) {
    assertUnambiguousPath(dependency.path, entries);
    // Proof: omitting this independent base-tuple check let a hash-valid forged read blob reach
    // authority comparison; the binding test lost its packet-read diagnostic.
    if (!entriesEqual(entries.get(dependency.path), dependency)) {
      throw new Error(`packet read dependency differs from base: ${dependency.path}`);
    }
  }
  return entries;
}

function expectedClaims(packet: AdmissionPacket): AuthorityClaim[] {
  return [
    ...packet.ownedPaths.map((identity): AuthorityClaim => ({
      access: 'write',
      identity,
      kind: 'path',
    })),
    ...packet.readDependencies.map(({ path: identity }): AuthorityClaim => ({
      access: 'read',
      identity,
      kind: 'path',
    })),
    ...packet.conflictGroups.map((identity): AuthorityClaim => ({ identity, kind: 'group' })),
  ].sort((left, right) => {
    const identity = compareCanonicalText(left.identity, right.identity);
    return identity === 0 ? compareCanonicalText(left.kind, right.kind) : identity;
  });
}

/** The exact claim set a valid packet requires from its authority generation. */
export function packetAuthorityClaims(packet: AdmissionPacket): readonly AuthorityClaim[] {
  assertAdmissionPacket(packet);
  return expectedClaims(packet);
}
