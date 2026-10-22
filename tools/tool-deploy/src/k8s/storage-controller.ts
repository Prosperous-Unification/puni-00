import { randomUUID } from 'node:crypto';

import { sha256Of } from './migration-capture';
import { inspectStorageIdentity, type StorageIdentity } from './storage-fence';
import {
  assertStorageOwnership,
  sealStorageOwnership,
  type StorageOwnership,
  type StorageOwnershipIdentity,
  type StorageOwnerSnapshot,
  type Suspension,
} from './storage-ownership';

/** Must be connected to the enclosing authoritative journal before any future controller mutation. */
export interface StorageAuthority {
  assertLease(): Promise<void>;
  /** Resolves only after the entire authoritative record has been fsync'd and committed. No default. */
  checkpoint(ownership: StorageOwnership): Promise<void>;
}
export interface StorageOwnerObservation extends StorageOwnerSnapshot {
  clusterUid: string;
  storage: StorageIdentity;
}
/** Read-only preparation ports; deliberately no mutation, scanner, restore or release effects. */
export interface StorageControllerEffects {
  inspectStorageOwner(identity: StorageOwnershipIdentity): Promise<StorageOwnerObservation>;
}
type ReadCall = (args: readonly string[]) => Promise<string>;
function fieldsOf(value: unknown, label: string): Record<string, unknown> {
  // Proof: adapter-object removal lost the missing-spec boundary diagnostic.
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`malformed ${label}`);
  // Boundary: non-null non-array Kubernetes object checked above; field values remain unknown.
  return value as Record<string, unknown>;
}
function textOf(value: unknown, label: string): string {
  // Proof: adapter-text removal returned a typed observation with no backup resourceVersion.
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`missing ${label}`);
  return value;
}
function canonical(value: unknown): string {
  if (value === undefined) throw new Error('missing storage controller evidence');
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, field]) => `${JSON.stringify(key)}:${canonical(field)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function assertEqual(observed: unknown, expected: unknown): void {
  // Proof: fresh-comparison removal admitted changed cluster/PVC/backup/template/Flux history on resume.
  if (canonical(observed) !== canonical(expected))
    throw new Error('storage ownership identity or original controller state changed');
}
/**
 * Strict GET-only Kubernetes boundary. The caller supplies its bounded kubectl transport.
 * Read twice to reject storage/controller replacement during preparation. ResourceVersion may
 * advance between observations; the latest version is retained, while templates and UIDs stay pinned.
 * No source-consumer inventory or stopped-storage claim is established here.
 */
export async function inspectStorageOwner(
  identity: StorageOwnershipIdentity,
  call: ReadCall,
): Promise<StorageOwnerObservation> {
  async function get(resource: string, name: string, namespace: string | null) {
    const fields = fieldsOf(
      JSON.parse(
        await call([
          ...(namespace === null ? [] : ['-n', namespace]),
          'get',
          resource,
          '-o',
          'json',
        ]),
      ),
      resource,
    );
    const metadata = fieldsOf(fields['metadata'], `${resource} metadata`);
    // Proof: adapter-identity removal admitted deleting and foreign-namespace backup fixtures.
    if (
      metadata['name'] !== name ||
      (namespace !== null && metadata['namespace'] !== namespace) ||
      'deletionTimestamp' in metadata
    )
      throw new Error(`foreign or deleting ${resource}`);
    return { fields, metadata, uid: textOf(metadata['uid'], `${resource} UID`) };
  }
  async function inspect(): Promise<StorageOwnerObservation> {
    const cluster = await get('namespace/kube-system', 'kube-system', null);
    const storage = await inspectStorageIdentity(identity.namespace, call);
    let fluxUid: string | null = null;
    if (identity.flux !== null) {
      const flux = await get(
        `kustomizations.kustomize.toolkit.fluxcd.io/${identity.flux.kustomization}`,
        identity.flux.kustomization,
        identity.flux.namespace,
      );
      // Proof: flux-suspension removal admitted the unsuspended Flux resume fixture.
      if (fieldsOf(flux.fields['spec'], 'Flux spec')['suspend'] !== true)
        throw new Error('Flux is not suspended');
      fluxUid = flux.uid;
    }
    const backup = await get('cronjob/sqlite-backup', 'sqlite-backup', identity.namespace);
    // Proof: adapter-kind removal admitted a Job returned for the backup CronJob.
    if (backup.fields['apiVersion'] !== 'batch/v1' || backup.fields['kind'] !== 'CronJob')
      throw new Error('foreign backup kind');
    // Proof: foreign-token removal adopted a backup carrying another ownership token.
    if (
      'annotations' in backup.metadata &&
      'puni.dev/storage-owner' in fieldsOf(backup.metadata['annotations'], 'backup annotations')
    )
      throw new Error('backup already has an ownership token; preparation cannot adopt it');
    const spec = fieldsOf(backup.fields['spec'], 'backup spec');
    const template = fieldsOf(
      fieldsOf(fieldsOf(spec['jobTemplate'], 'backup jobTemplate')['spec'], 'backup Job spec')[
        'template'
      ],
      'backup Pod template',
    );
    fieldsOf(template['spec'], 'backup Pod spec');
    let suspension: Suspension = { kind: 'absent' };
    if ('suspend' in spec) {
      // Proof: adapter-suspension removal returned a typed observation with string suspension.
      if (typeof spec['suspend'] !== 'boolean') throw new Error('invalid backup suspension');
      suspension = { kind: 'present', value: spec['suspend'] };
    }
    const { suspend: _suspend, ...templateSpec } = spec;
    return {
      clusterUid: cluster.uid,
      storage,
      fluxUid,
      owner: {
        kind: 'CronJob',
        name: 'sqlite-backup',
        uid: backup.uid,
        resourceVersion: textOf(backup.metadata['resourceVersion'], 'backup resourceVersion'),
        templateSha256: sha256Of(canonical(templateSpec)),
        suspension,
      },
    };
  }
  const first = await inspect();
  // Proof: second-read omission missed replacement during GET and returned the stale resourceVersion.
  const final = await inspect();
  assertEqual(
    { ...first, owner: { ...first.owner, resourceVersion: null } },
    { ...final, owner: { ...final.owner, resourceVersion: null } },
  );
  return final;
}
function assertTarget(
  observation: StorageOwnerObservation,
  identity: StorageOwnershipIdentity,
): void {
  // Proof: target-dispatch omission admitted changed cluster and PVC on resume.
  assertEqual(observation.clusterUid, identity.clusterUid);
  assertEqual(observation.storage, identity.storage);
}
/**
 * Generates fresh prepared history under current Lease and awaits the caller's durable checkpoint.
 * Does not patch, suspend or drain the backup. A checkpoint failure throws and returns no receipt.
 */
export async function prepareStorageOwnership(
  identity: StorageOwnershipIdentity,
  effects: StorageControllerEffects,
  authority: StorageAuthority,
): Promise<StorageOwnership> {
  // Proof: lease-before omission reached observation after Lease loss.
  await authority.assertLease();
  const observed = await effects.inspectStorageOwner(identity);
  assertTarget(observed, identity);
  const ownership = sealStorageOwnership(identity, observed, randomUUID());
  // Proof: lease-after-read omission reached checkpoint after Lease loss.
  await authority.assertLease();
  // Proof: checkpoint omission returned without a durable file; checkpoint-await omission returned while blocked.
  await authority.checkpoint(ownership);
  return ownership;
}
/**
 * Revalidates original prepared history after interruption without resealing or replacing it.
 * Any token/suspension change refuses: acknowledgment of conditional patches is a later packet.
 */
export async function validateStorageOwnership(
  value: unknown,
  identity: StorageOwnershipIdentity,
  effects: StorageControllerEffects,
  authority: StorageAuthority,
): Promise<void> {
  // Proof: resume-validation omission reached GET with an altered token in prepared history.
  assertStorageOwnership(value, identity);
  await authority.assertLease();
  const observed = await effects.inspectStorageOwner(identity);
  assertTarget(observed, identity);
  assertEqual(observed.fluxUid, value.fluxUid);
  assertEqual(
    { ...observed.owner, resourceVersion: null },
    { ...value.owner, resourceVersion: null },
  );
  // Proof: resume-final-lease omission returned after the fresh read lost its Lease.
  await authority.assertLease();
}
