import { createHash } from 'node:crypto';

import type { ReleaseRequest } from './release';

export interface MigrationSetIdentity {
  target: string;
  attempt: string;
  candidate: string;
}

export interface AppliedMigration {
  name: string;
  hash: string;
}

export interface PendingMigration extends AppliedMigration {
  downHash: string;
}

export interface MigrationCapture {
  /** Display only. Selection uses the pinned exact set. */
  baseline: string;
  applied: readonly AppliedMigration[];
  pending: readonly PendingMigration[];
  /** Original bytes handed to both automatic and manual schema Jobs. */
  bytes: string;
  sha256: string;
}

const SHA256 = /^[0-9a-f]{64}$/;
const DATABASE = '/data/wbs.sqlite';
const PVC = 'wbs-data';

function recordOf(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(
      'legacy migration capture: exact-set object is required; use the prior executor/manual recovery',
    );
  }
  // Boundary: the object/non-null/non-array check establishes indexable unknown fields.
  return value as Record<string, unknown>;
}

function rowsOf(value: unknown, pending: false): AppliedMigration[];
function rowsOf(value: unknown, pending: true): PendingMigration[];
function rowsOf(value: unknown, pending: boolean): AppliedMigration[] | PendingMigration[] {
  if (!Array.isArray(value)) throw new Error('migration capture identities are missing');
  return value.map((raw: unknown) => {
    const row = recordOf(raw);
    // Proof: accepting a malformed forward hash let `refuses malformed forward hash in a
    // durable capture` resume into rollback; the watched hash-shape fault failed.
    if (
      typeof row['name'] !== 'string' ||
      row['name'] === '' ||
      typeof row['hash'] !== 'string' ||
      !SHA256.test(row['hash'])
    ) {
      throw new Error('migration capture has a malformed name or forward hash');
    }
    if (!pending) return { name: row['name'], hash: row['hash'] };
    if (typeof row['downHash'] !== 'string' || !SHA256.test(row['downHash'])) {
      throw new Error('migration capture has a malformed down hash');
    }
    return { name: row['name'], hash: row['hash'], downHash: row['downHash'] };
  });
}

export function migrationIdentityOf(
  request: ReleaseRequest,
  attempt: string,
): MigrationSetIdentity {
  return {
    target: `k8s:${request.cluster.uid}:${request.namespaces.backend}:${PVC}:${DATABASE}`,
    attempt,
    candidate: request.release.images.backend,
  };
}

export function sha256Of(bytes: string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Serialize once at capture; subsequent callers must carry these same bytes and digest. */
export function sealMigrationCapture(
  identity: MigrationSetIdentity,
  applied: readonly AppliedMigration[],
  pending: readonly PendingMigration[],
): MigrationCapture {
  const bytes = JSON.stringify({
    format: 'applied-migration-set',
    version: 1,
    ...identity,
    applied,
    pending,
  });
  const capture = {
    baseline: applied.at(-1)?.name ?? 'none',
    applied,
    pending,
    bytes,
    sha256: sha256Of(bytes),
  };
  assertMigrationCapture(capture, identity);
  return capture;
}

/** Refuse altered, legacy or foreign durable captures before Lease or cluster mutation. */
export function assertMigrationCapture(
  raw: unknown,
  identity: MigrationSetIdentity,
): asserts raw is MigrationCapture {
  const envelope = recordOf(raw);
  // Proof: removing this byte/digest presence refusal made `refuses an interrupted legacy
  // capture` lose its explicit prior-executor route and report only a later SHA mismatch.
  if (typeof envelope['bytes'] !== 'string' || typeof envelope['sha256'] !== 'string') {
    throw new Error(
      'legacy migration capture: original bytes and digest are absent; use the prior executor/manual recovery',
    );
  }
  // Proof: bypassing the original digest check made `refuses altered bytes in a resumed
  // capture` continue to rollback with changed serialized bytes.
  if (!SHA256.test(envelope['sha256']) || sha256Of(envelope['bytes']) !== envelope['sha256']) {
    throw new Error('migration capture differs from its original SHA-256');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(envelope['bytes']);
  } catch (cause) {
    throw new Error('migration capture bytes are not JSON', { cause });
  }
  const payload = recordOf(parsed);
  // Proof: accepting a foreign format let `refuses unsupported format in a durable capture`
  // resume with a capture the backend CLI does not understand.
  if (payload['format'] !== 'applied-migration-set' || payload['version'] !== 1) {
    throw new Error('unsupported migration capture format or version');
  }
  // Proof: bypassing caller identity made `refuses wrong target in a resumed capture`
  // continue under a foreign cluster target.
  if (
    payload['target'] !== identity.target ||
    payload['attempt'] !== identity.attempt ||
    payload['candidate'] !== identity.candidate
  ) {
    throw new Error('migration capture belongs to another target, attempt or candidate');
  }
  const applied = rowsOf(payload['applied'], false);
  const pending = rowsOf(payload['pending'], true);
  const names = [...applied, ...pending].map((row) => row.name);
  // Proof: allowing repeated identities made `refuses duplicate identity in a durable capture`
  // continue to rollback with a duplicate pending row.
  if (new Set(names).size !== names.length) throw new Error('duplicate migration capture identity');
  // Proof: accepting reversed pending order made `refuses reordered pending in a durable
  // capture` start rollback and fail later on a missing script.
  if (pending.some((row, index) => index > 0 && pending[index - 1].name > row.name)) {
    throw new Error('pending migration order differs from forward runner order');
  }
  // Proof: ignoring envelope/byte disagreement made `refuses divergent envelope in a durable
  // capture` continue with a display baseline not present in the pinned bytes.
  if (
    JSON.stringify(envelope['applied']) !== JSON.stringify(applied) ||
    JSON.stringify(envelope['pending']) !== JSON.stringify(pending) ||
    envelope['baseline'] !== (applied.at(-1)?.name ?? 'none')
  ) {
    throw new Error('migration capture envelope differs from original bytes');
  }
}
