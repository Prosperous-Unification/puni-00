import { createHash } from 'node:crypto';
import { isAbsolute, normalize } from 'node:path';

import type { RegistryBackupLockPorts, RegistryBackupLockVersion } from './registry-backup-locks';
import type { RegistryBackupEffectPort } from './registry-backup-reservation';
import type {
  RegistryBackupSnapshotObserver,
  RegistryBackupSnapshotVersion,
} from './registry-backup-retention';
import type { parseRegistryBackupConfiguration } from './registry-maintenance-backup';
import { RegistryMaintenanceRefusal } from './registry-maintenance-failure';
import { assertRegistryMaintenanceLock } from './registry-maintenance-process';
import type { RegistryMaintenanceJournal } from './registry-managed-journal';
import {
  createRegistryS3Store,
  type RegistryS3Census,
  type RegistryS3Configuration,
  type RegistryS3Store,
} from './registry-s3-census';

/** Complete raw lock and snapshot observations plus exact lock removal under canonical maintenance authority. */
export type RegistryBackupVersionStore = Pick<
  RegistryBackupLockPorts,
  'census' | 'removeVersion'
> & {
  snapshotVersions: RegistryBackupSnapshotObserver;
};
export type OpenRegistryBackupVersions = (
  configuration: ReturnType<typeof parseRegistryBackupConfiguration>,
  authority: {
    journal: RegistryMaintenanceJournal;
    authorityDescriptor: number;
    journalPath: string;
    signal: AbortSignal;
    effects: RegistryBackupEffectPort;
  },
) => Promise<RegistryBackupVersionStore>;

/** Only the existing canonical S3 repository profile is supported; never discover credentials, region, bucket or scope from ambient state. */
function deriveScope(
  configuration: ReturnType<typeof parseRegistryBackupConfiguration>,
  signal: AbortSignal,
): RegistryS3Configuration {
  // Proof: scope-profile rejection removed in a disposable copy accepted the unsupported repository production-entry negative.
  const environment = configuration.environment;
  const matched = /^s3:(https:\/\/[^/]+)\/([^/]+)\/(.+)$/.exec(environment.RESTIC_REPOSITORY);
  const endpoint = matched?.[1];
  const bucket = matched?.[2];
  const repository = matched?.[3];
  if (
    endpoint === undefined ||
    bucket === undefined ||
    repository === undefined ||
    !repository
      .split('/')
      .every(
        (segment) => /^[A-Za-z0-9._-]+$/.test(segment) && segment !== '.' && segment !== '..',
      ) ||
    typeof environment.AWS_ACCESS_KEY_ID !== 'string' ||
    environment.AWS_ACCESS_KEY_ID.length === 0 ||
    typeof environment.AWS_SECRET_ACCESS_KEY !== 'string' ||
    environment.AWS_SECRET_ACCESS_KEY.length === 0 ||
    typeof environment.AWS_DEFAULT_REGION !== 'string' ||
    environment.AWS_DEFAULT_REGION.length === 0
  )
    throw new RegistryMaintenanceRefusal('backup-budget-unavailable');
  return {
    endpoint,
    bucket,
    prefix: `${repository}/`,
    region: environment.AWS_DEFAULT_REGION,
    credentials: {
      accessKeyId: environment.AWS_ACCESS_KEY_ID,
      secretAccessKey: environment.AWS_SECRET_ACCESS_KEY,
      ...(environment.AWS_SESSION_TOKEN === undefined
        ? {}
        : { sessionToken: environment.AWS_SESSION_TOKEN }),
    },
    signal,
  };
}
function canonicalCensus(census: RegistryS3Census): string {
  const identity = (version: { key: string; versionId: string }) =>
    JSON.stringify([version.key, version.versionId]);
  return JSON.stringify({
    versions: [...census.versions].sort((left, right) =>
      identity(left).localeCompare(identity(right)),
    ),
    uploads: [...census.uploads].sort((left, right) =>
      JSON.stringify([left.key, left.uploadId]).localeCompare(
        JSON.stringify([right.key, right.uploadId]),
      ),
    ),
    payloadBytes: census.payloadBytes,
    accounting: census.accounting,
  });
}

/**
 * Root worker only. Revalidate the SAME inherited authority around every provider operation.
 * SDK census is complete across the repository prefix; every raw lock object (including history)
 * is read by immutable version ID and matched to its ciphertext filename. Payload accounting here
 * never grants physical budget admission. Only the authenticated dead-attempt reconciler selects
 * a visible lock; removal independently rechecks it and confirms its exact version disappeared.
 */
export const openRegistryBackupVersions: OpenRegistryBackupVersions = async (
  configuration,
  authority,
) => {
  const { journal, journalPath, authorityDescriptor, signal } = authority;
  const ownership = JSON.stringify(journal.maintenance);
  const revision = journal.revision;
  const verify = async () => {
    // Proof: disposable UID/abort guard mutations broke their before-network production negatives; revision/owner mutations accepted their ciphertext-GET replacement negatives.
    if (
      process.getuid?.() !== 0 ||
      !(signal instanceof AbortSignal) ||
      signal.aborted ||
      typeof journalPath !== 'string' ||
      !isAbsolute(journalPath) ||
      normalize(journalPath) !== journalPath ||
      !Number.isSafeInteger(authorityDescriptor) ||
      authorityDescriptor < 0 ||
      journal.maintenance === null ||
      typeof journal.maintenance.operationId !== 'string' ||
      journal.maintenance.operationId.length === 0 ||
      journal.revision !== revision ||
      JSON.stringify(journal.maintenance) !== ownership
    )
      throw new Error('Missing current root backup version authority');
    // Proof: removing this dependency in a disposable copy allowed the modeled missing inherited-lock negative to complete its real SDK census.
    await assertRegistryMaintenanceLock(journalPath, authorityDescriptor, 59001);
  };
  await verify();
  const scope = deriveScope(configuration, signal);
  async function useProvider<T>(
    operate: (provider: RegistryS3Store) => Promise<T>,
    retentionSignal?: AbortSignal,
  ): Promise<T> {
    // Proof: firing the modeled first 60s timer let a census complete before the shared cycle signal existed.
    const deadline = new AbortController();
    const timer = setTimeout(() => {
      deadline.abort();
    }, 60000);
    const cycle = AbortSignal.any([
      signal,
      deadline.signal,
      // Proof: dropping this signal let the retention-abort wire negative send further requests in a disposable copy.
      ...(retentionSignal === undefined ? [] : [retentionSignal]),
    ]);
    try {
      const provider = createRegistryS3Store({
        ...scope,
        signal: cycle,
        fetch: async (request) => {
          // Proof: before this wire guard, authority loss after GETversioning still sent DELETE and first-page lock loss sent two further requests.
          await verify();
          if (cycle.aborted) throw new Error('Backup version census deadline or cancellation');
          return fetch(request);
        },
      });
      return await operate(provider);
    } finally {
      clearTimeout(timer);
    }
  }
  const lockPrefix = `${scope.prefix}locks/`;
  const observeCensus = () =>
    useProvider(async (provider) => {
      await verify();
      const before = await provider.census();
      await verify();
      const locks: RegistryBackupLockVersion[] = [];
      // Proof: removing this guard in a disposable copy accepted the real-wire unfinished lock upload negative.
      if (before.uploads.some((upload) => upload.key.startsWith(lockPrefix)))
        throw new Error('Incomplete raw backup lock upload');
      let ciphertextBytes = 0;
      for (const version of before.versions) {
        if (!version.key.startsWith(lockPrefix)) continue;
        const key = version.key.slice(scope.prefix.length);
        // Proof: removing this guard in a disposable copy accepted the real-wire unknown raw marker name.
        if (!/^locks\/[a-f0-9]{64}$/.test(key)) throw new Error('Unknown raw backup lock name');
        if (version.kind === 'delete-marker') {
          locks.push({
            key,
            versionId: version.versionId,
            visible: version.visible,
            kind: 'delete-marker',
          });
        } else {
          ciphertextBytes += version.bytes;
          // Proof: removing this limit in a disposable copy accepted nine 8MiB historical/current ciphertext versions.
          if (
            version.bytes <= 0 ||
            !Number.isSafeInteger(ciphertextBytes) ||
            ciphertextBytes > 64 * 1024 ** 2
          )
            throw new Error('Raw backup lock ciphertext exceeds bound');
          await verify();
          const bytes = await provider.readVersion(version.key, version.versionId);
          await verify();
          const sha256 = createHash('sha256').update(bytes).digest('hex');
          // Proof: separate removed-size/removed-hash mutations accepted listed-size and ciphertext corruption real-wire negatives.
          if (bytes.byteLength !== version.bytes || sha256 !== key.slice(6))
            throw new Error('Raw backup lock ciphertext differs from listed identity');
          locks.push({
            key,
            versionId: version.versionId,
            visible: version.visible,
            kind: 'object',
            sha256,
            bytes: bytes.byteLength,
          });
        }
      }
      // Proof: broken SDK producer models (not real-wire evidence) accepted 65,537 versions or >64MiB metadata with the corresponding guard removed in a disposable copy.
      if (locks.length > 65536 || Buffer.byteLength(JSON.stringify(locks)) > 64 * 1024 ** 2)
        throw new Error('Raw backup lock census exceeds bound');
      await verify();
      const after = await provider.census();
      await verify();
      // Proof: removing this comparison in a disposable copy accepted changed current-version metadata after the exact ciphertext reads.
      if (canonicalCensus(before) !== canonicalCensus(after))
        throw new Error('Raw backup lock metadata changed during observation');
      return locks;
    });
  return {
    census: observeCensus,
    /** One fresh complete root census; payload bytes are metadata only and grant no physical admission. */
    async snapshotVersions(retentionSignal) {
      // Proof: removing this guard accepted the missing-signal production callback negative in a disposable copy.
      if (!(retentionSignal instanceof AbortSignal) || retentionSignal.aborted)
        throw new Error('Missing live backup retention signal');
      return useProvider(async (provider) => {
        await verify();
        const census = await provider.census();
        await verify();
        retentionSignal.throwIfAborted();
        const prefix = `${scope.prefix}snapshots/`;
        // Proof: removing this guard accepted the signed-wire unfinished snapshot upload negative.
        if (census.uploads.some((upload) => upload.key.startsWith(prefix)))
          throw new Error('Incomplete raw backup snapshot upload');
        const snapshots: RegistryBackupSnapshotVersion[] = [];
        let bytes = 0;
        for (const version of census.versions) {
          if (!version.key.startsWith(prefix)) continue;
          const snapshotId = version.key.slice(prefix.length);
          // Proof: removing this guard accepted current, hidden-history and marker unknown-name wire negatives.
          if (!/^[a-f0-9]{64}$/.test(snapshotId))
            throw new Error('Unknown raw backup snapshot name');
          if (version.kind === 'delete-marker')
            snapshots.push({
              snapshotId,
              versionId: version.versionId,
              visible: version.visible,
              kind: 'delete-marker',
            });
          else {
            bytes += version.bytes;
            // Proof: a broken SDK producer supplied two MAX_SAFE_INTEGER sizes; guard removal accepted the unsafe sum.
            if (
              !Number.isSafeInteger(version.bytes) ||
              version.bytes < 0 ||
              !Number.isSafeInteger(bytes)
            )
              throw new Error('Raw backup snapshot bytes exceed safe arithmetic');
            snapshots.push({
              snapshotId,
              versionId: version.versionId,
              visible: version.visible,
              kind: 'object',
              bytes: version.bytes,
            });
          }
        }
        // Proof: separate guard removals accepted broken SDK producers with 8,193 rows or oversized serialized metadata.
        if (snapshots.length > 8192 || Buffer.byteLength(JSON.stringify(snapshots)) > 4 * 1024 ** 2)
          throw new Error('Raw backup snapshot census exceeds bound');
        return snapshots;
      }, retentionSignal);
    },
    async removeVersion(observed) {
      await verify();
      // Proof: disabling both visibility guards in a disposable copy let the historical-version negative send DELETE.
      if (
        observed.kind !== 'object' ||
        !observed.visible ||
        !/^locks\/[a-f0-9]{64}$/.test(observed.key)
      )
        throw new Error('Invalid exact backup lock removal');
      const current = (await observeCensus()).find(
        (version) => version.key === observed.key && version.versionId === observed.versionId,
      );
      // Proof: dropping fresh version-ID selection or the byte comparison each let the changed-ID/forged-bytes negative send DELETE.
      if (
        current?.kind !== 'object' ||
        !current.visible ||
        current.sha256 !== observed.sha256 ||
        current.bytes !== observed.bytes
      )
        throw new Error('Exact backup lock version changed before removal');
      await verify();
      // Proof: consumption omission sent an SDK DELETE in 'actual SDK DELETE consumes durable authority: durable-missing'; the wire records requests before its modeled response.
      const ticket = await authority.effects.consumeEffect({
        slot: 'exact-lock-delete',
        kind: 'delete',
        targetSha256: createHash('sha256')
          .update(
            JSON.stringify([observed.key, observed.versionId, observed.sha256, observed.bytes]),
          )
          .digest('hex'),
      });
      await useProvider((provider) =>
        provider.deleteVersion(`${scope.prefix}${observed.key}`, observed.versionId),
      );
      await verify();
      const after = await observeCensus();
      // Proof: removing this confirmation in a disposable copy accepted a DELETE204 whose exact version remained in the complete census.
      if (
        after.some(
          (version) => version.key === observed.key && version.versionId === observed.versionId,
        )
      )
        throw new Error('Exact backup lock deletion remains unconfirmed');
      // Proof: settlement omission left durable consumed state in 'actual SDK DELETE consumes durable authority: durable-delete'; exact disappearance is verified above before this terminal acknowledgement.
      await authority.effects.settleEffect(ticket);
    },
  };
};
