import { sha256Of } from './migration-capture';
import type { FluxUnit } from './release';
import type { StorageIdentity } from './storage-fence';

export type Suspension = { kind: 'absent' } | { kind: 'present'; value: boolean };
export interface StorageOwnershipIdentity {
  transactionId: string;
  clusterUid: string;
  namespace: string;
  storage: StorageIdentity;
  flux: Pick<FluxUnit, 'namespace' | 'kustomization'> | null;
}
export interface StorageOwnerSnapshot {
  fluxUid: string | null;
  owner: {
    kind: 'CronJob';
    name: 'sqlite-backup';
    uid: string;
    resourceVersion: string;
    /** Complete canonical CronJob spec excluding suspend; binds schedule and Job template together. */
    templateSha256: string;
    suspension: Suspension;
  };
}
/**
 * Prepared history only: no controller mutation or restoration authority. Original absent/false/true
 * suspension and token survive serialization. SHA-256 detects inconsistent bytes, not forgery.
 * Later stages deliberately refuse until conditional mutation and drain ship together.
 */
export interface StorageOwnership extends StorageOwnershipIdentity, StorageOwnerSnapshot {
  format: 'wbs-storage-ownership';
  version: 1;
  token: string;
  stage: 'prepared';
  disposition: 'already-suspended' | 'suspend-requested';
  bytes: string;
  sha256: string;
}

function fieldsOf(value: unknown, keys: readonly string[]): Record<string, unknown> {
  // Proof: codec-object removal lost malformed-envelope diagnostics; closed-fields removal admitted extra fields.
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('malformed storage ownership object');
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(','))
    throw new Error('unexpected storage ownership fields');
  // Boundary: non-null non-array object checked above; field values remain unknown.
  return value as Record<string, unknown>;
}
function textOf(value: unknown): string {
  // Proof: codec-text removal admitted the resealed empty owner UID.
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error('missing storage ownership identity');
  return value;
}
function hashOf(value: unknown): string {
  const hash = textOf(value);
  // Proof: hash-format removal admitted the resealed invalid template hash.
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('malformed storage ownership hash');
  return hash;
}
function canonical(value: unknown): string {
  // Proof: canonical-missing removal lost the missing-field boundary diagnostic.
  if (value === undefined) throw new Error('missing storage ownership field');
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, field]) => `${JSON.stringify(key)}:${canonical(field)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function readStorage(value: unknown): StorageIdentity {
  const storage = fieldsOf(value, [
    'namespace',
    'pvcName',
    'pvcUid',
    'volumeName',
    'pvUid',
    'databasePath',
  ]);
  // Proof: fixed-source removal admitted foreign PVC names and database paths.
  if (storage['pvcName'] !== 'wbs-data' || storage['databasePath'] !== '/data/wbs.sqlite')
    throw new Error('foreign storage ownership source');
  return {
    namespace: textOf(storage['namespace']),
    pvcName: 'wbs-data',
    pvcUid: textOf(storage['pvcUid']),
    volumeName: textOf(storage['volumeName']),
    pvUid: textOf(storage['pvUid']),
    databasePath: '/data/wbs.sqlite',
  };
}
function readFlux(value: unknown): StorageOwnershipIdentity['flux'] {
  if (value === null) return null;
  const flux = fieldsOf(value, ['namespace', 'kustomization']);
  return { namespace: textOf(flux['namespace']), kustomization: textOf(flux['kustomization']) };
}
function readSuspension(value: unknown): Suspension {
  // Proof: suspension-object removal lost the malformed-suspension boundary diagnostic.
  if (typeof value !== 'object' || value === null || !('kind' in value))
    throw new Error('malformed storage ownership suspension');
  const suspension = fieldsOf(value, value.kind === 'absent' ? ['kind'] : ['kind', 'value']);
  if (suspension['kind'] === 'absent') return { kind: 'absent' };
  // Proof: suspension removal admitted a resealed numeric suspension value.
  if (suspension['kind'] !== 'present' || typeof suspension['value'] !== 'boolean')
    throw new Error('malformed storage ownership suspension');
  return { kind: 'present', value: suspension['value'] };
}
const PAYLOAD_KEYS = [
  'format',
  'version',
  'transactionId',
  'clusterUid',
  'namespace',
  'storage',
  'flux',
  'fluxUid',
  'owner',
  'token',
  'stage',
  'disposition',
];
function readPayload(value: unknown): Omit<StorageOwnership, 'bytes' | 'sha256'> {
  const payload = fieldsOf(value, PAYLOAD_KEYS);
  // Proof: format-stage removal admitted unsupported format, version and suspended-stage fixtures.
  if (
    payload['format'] !== 'wbs-storage-ownership' ||
    payload['version'] !== 1 ||
    payload['stage'] !== 'prepared'
  )
    throw new Error('unsupported storage ownership format, version or stage');
  const owner = fieldsOf(payload['owner'], [
    'kind',
    'name',
    'uid',
    'resourceVersion',
    'templateSha256',
    'suspension',
  ]);
  // Proof: controller removal admitted the resealed foreign controller name.
  if (owner['kind'] !== 'CronJob' || owner['name'] !== 'sqlite-backup')
    throw new Error('foreign storage ownership controller');
  const suspension = readSuspension(owner['suspension']);
  const disposition =
    suspension.kind === 'present' && suspension.value ? 'already-suspended' : 'suspend-requested';
  // Proof: disposition removal admitted already-suspended with an absent original field.
  if (payload['disposition'] !== disposition)
    throw new Error('inconsistent storage ownership disposition');
  const flux = readFlux(payload['flux']);
  const fluxUid = payload['fluxUid'] === null ? null : textOf(payload['fluxUid']);
  // Proof: flux-binding removal admitted a configured Flux unit with no pinned UID.
  if ((flux === null) !== (fluxUid === null))
    throw new Error('missing or foreign storage ownership Flux UID');
  const namespace = textOf(payload['namespace']);
  const storage = readStorage(payload['storage']);
  // Proof: namespace-binding removal admitted the caller repeating inconsistent storage namespace.
  if (namespace !== storage.namespace) throw new Error('foreign storage ownership namespace');
  return {
    format: 'wbs-storage-ownership',
    version: 1,
    stage: 'prepared',
    transactionId: textOf(payload['transactionId']),
    clusterUid: textOf(payload['clusterUid']),
    namespace,
    storage,
    flux,
    fluxUid,
    token: textOf(payload['token']),
    disposition,
    owner: {
      kind: 'CronJob',
      name: 'sqlite-backup',
      uid: textOf(owner['uid']),
      resourceVersion: textOf(owner['resourceVersion']),
      templateSha256: hashOf(owner['templateSha256']),
      suspension,
    },
  };
}

/** Refuses altered, unsupported or foreign prepared history without resealing loaded evidence. */
export function assertStorageOwnership(
  value: unknown,
  expected: StorageOwnershipIdentity,
): asserts value is StorageOwnership {
  const envelope = fieldsOf(value, [...PAYLOAD_KEYS, 'bytes', 'sha256']);
  const { bytes, sha256, ...raw } = envelope;
  // Proof: digest removal admitted a changed SHA-256 over original bytes.
  if (typeof bytes !== 'string' || sha256Of(bytes) !== hashOf(sha256))
    throw new Error('storage ownership differs from original SHA-256');
  // Proof: canonical-envelope removal admitted an altered token before a cluster call.
  if (bytes !== canonical(raw))
    throw new Error('storage ownership envelope differs from canonical bytes');
  const payload = readPayload(raw);
  const observed = {
    transactionId: payload.transactionId,
    clusterUid: payload.clusterUid,
    namespace: payload.namespace,
    storage: payload.storage,
    flux: payload.flux,
  };
  // Proof: target removal admitted independently foreign transaction, cluster, namespace, PVC and Flux targets.
  if (canonical(observed) !== canonical(expected))
    throw new Error('storage ownership belongs to another target or transaction');
}

/** Seals a newly observed prepared snapshot; never use this to repair loaded evidence. */
export function sealStorageOwnership(
  identity: StorageOwnershipIdentity,
  snapshot: StorageOwnerSnapshot,
  token: string,
): StorageOwnership {
  const payload = {
    format: 'wbs-storage-ownership',
    version: 1,
    ...identity,
    fluxUid: snapshot.fluxUid,
    owner: snapshot.owner,
    token,
    stage: 'prepared',
    disposition:
      snapshot.owner.suspension.kind === 'present' && snapshot.owner.suspension.value
        ? 'already-suspended'
        : 'suspend-requested',
  };
  const bytes = canonical(payload);
  const ownership: unknown = { ...payload, bytes, sha256: sha256Of(bytes) };
  assertStorageOwnership(ownership, identity);
  return ownership;
}
