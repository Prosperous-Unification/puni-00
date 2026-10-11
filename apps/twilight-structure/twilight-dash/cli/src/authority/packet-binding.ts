import {
  type AdmissionPacket,
  type AdmissionPacketIntent,
  assertAdmissionPacket,
  assertAuthoritySessionId,
  assertNarrative,
  assertUnambiguousPath,
  canonicalPaths,
  canonicalRepository,
  compareCanonicalText,
  packetAuthorityClaims,
  packetBody,
  packetBodyBytes,
  readBaseEntries,
  uniqueSorted,
  validatePacketAgainstBase,
  withPacketIdentity,
} from '@twilight-burokrat/judge';

import type { AuthorityPacketBinding, AuthorityStore } from './authority-store';
import { bindAdmissionPacket, type ClaimToken, expandBoundPacketClaims } from './claims';

const Sha256Identity = /^[0-9a-f]{64}$/;

function packetBinding(packet: AdmissionPacket): AuthorityPacketBinding {
  return { packetBytes: packetBodyBytes(packet), packetIdentity: packet.packetIdentity };
}

/** Creates and atomically binds a finite packet to the exact live authority generation. */
export function createAdmissionPacket(
  store: AuthorityStore,
  token: ClaimToken,
  repository: string,
  intent: AdmissionPacketIntent,
): AdmissionPacket {
  assertAuthoritySessionId(token.sessionId);
  if (!Number.isSafeInteger(token.generation) || token.generation < 1) {
    throw new Error(`invalid generation: ${String(token.generation)}`);
  }
  assertNarrative(intent.objective, 'objective');
  assertNarrative(intent.outcome, 'outcome');
  if (!Sha256Identity.test(intent.policyIdentity)) throw new Error('invalid policy identity');
  if (!Sha256Identity.test(intent.mappingIdentity)) throw new Error('invalid mapping identity');
  const worktreePath = canonicalRepository(repository);
  const entries = readBaseEntries(worktreePath, intent.base);
  const ownedPaths = canonicalPaths(intent.ownedPaths, 'owned path');
  const readPaths = canonicalPaths(intent.readPaths, 'read path');
  for (const path of [...ownedPaths, ...readPaths]) assertUnambiguousPath(path, entries);
  const readDependencies = readPaths.map((path) => {
    const entry = entries.get(path);
    if (entry === undefined) throw new Error(`packet read dependency is absent: ${path}`);
    return entry;
  });
  const packet = withPacketIdentity({
    base: { ...intent.base },
    checks: uniqueSorted(intent.checks, 'check'),
    consumedContracts: uniqueSorted(intent.consumedContracts, 'consumed contract'),
    consumedInterfaces: uniqueSorted(intent.consumedInterfaces, 'consumed interface'),
    conflictGroups: uniqueSorted(intent.conflictGroups, 'conflict group'),
    evidenceRequirements: uniqueSorted(intent.evidenceRequirements, 'evidence requirement'),
    generation: token.generation,
    invariants: uniqueSorted(intent.invariants, 'invariant'),
    mappingIdentity: intent.mappingIdentity,
    objective: intent.objective,
    outcome: intent.outcome,
    ownedPaths,
    policyIdentity: intent.policyIdentity,
    producedContracts: uniqueSorted(intent.producedContracts, 'produced contract'),
    producedInterfaces: uniqueSorted(intent.producedInterfaces, 'produced interface'),
    readDependencies,
    schemaVersion: 1,
    sessionId: token.sessionId,
    worktreePath,
  });
  assertAdmissionPacket(packet);
  // Proof: omitting the stored binding let independently rehashed policy and checks submit under
  // the same generation; the production binding matrix received submitted reports.
  bindAdmissionPacket(store, {
    claims: packetAuthorityClaims(packet),
    nextPacket: packetBinding(packet),
    packet: undefined,
    token,
    worktreePath,
  });
  return packet;
}

/** Atomically adds pinned read dependencies while preserving the packet's write set. */
export function expandPacketReads(
  store: AuthorityStore,
  packet: AdmissionPacket,
  repository: string,
  additions: readonly string[],
): AdmissionPacket {
  const worktreePath = canonicalRepository(repository);
  if (worktreePath !== packet.worktreePath) {
    throw new Error('read expansion repository differs from packet worktree');
  }
  const entries = validatePacketAgainstBase(repository, packet);
  const paths = canonicalPaths(additions, 'read path');
  for (const path of paths) {
    if (
      packet.ownedPaths.some(
        (owned) => owned === path || path.startsWith(`${owned}/`) || owned.startsWith(`${path}/`),
      )
    ) {
      throw new Error('read expansion cannot overlap packet write claims');
    }
  }
  const dependencies = new Map(packet.readDependencies.map((entry) => [entry.path, entry]));
  for (const path of paths) {
    assertUnambiguousPath(path, entries);
    const entry = entries.get(path);
    if (entry === undefined) throw new Error(`packet read dependency is absent: ${path}`);
    dependencies.set(path, entry);
  }
  const expanded = withPacketIdentity({
    ...packetBody(packet),
    readDependencies: [...dependencies.values()].sort((left, right) =>
      compareCanonicalText(left.path, right.path),
    ),
  });
  // Proof: splitting expansion across claim mutation and later validation left `CLAUDE.md` added
  // after a stale packet refusal; the production test observed the claim count grow from three
  // to four instead of exact state equality.
  expandBoundPacketClaims(store, {
    additions: paths.map((path) => ({ access: 'read', path })),
    claims: packetAuthorityClaims(packet),
    nextPacket: packetBinding(expanded),
    packet: packetBinding(packet),
    token: { generation: packet.generation, sessionId: packet.sessionId },
    worktreePath: packet.worktreePath,
  });
  return expanded;
}
