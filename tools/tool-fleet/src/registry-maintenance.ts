import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';

import { type RegistryEndpoint, requestRegistry } from './platform-registry';
import type { RegistryBackupPreparation, RegistryBackupSource } from './registry-backup-store';
import {
  assertRegistryPlan,
  collectRegistryInventory,
  planRegistryRetirement,
  type RegistryInventory,
  type RegistryInventoryIdentity,
} from './registry-inventory';
import {
  type RegistryJournalPorts,
  type RegistryMaintenanceSession,
  runRegistryMaintenance,
} from './registry-journal';
import {
  type RegistryBackupReceipt,
  type RegistryMaintenanceEvidence,
  RegistryRecoveryReceipt,
  requireRegistryRecoveryReceipt,
  requireRegistryRestorationEvidence,
} from './registry-maintenance-state';
import { completeRegistryOperation } from './registry-operation-completion';
import { consumeRegistryStream } from './registry-stream';

/** Installed host adapter owns fixed resources, fresh four-owner barriers and all native child lifetimes. */
export type RegistryMaintenanceAuthority = Pick<
  RegistryMaintenanceSession,
  | 'read'
  | 'authorityDescriptor'
  | 'prepareBackup'
  | 'settleBackup'
  | 'prepareBackupReconciliation'
  | 'reconcileBackups'
  | 'settleClient'
>;
export interface RegistryMaintenanceRuntime {
  inspect(session: RegistryMaintenanceAuthority): Promise<string>;
  fence(session: RegistryMaintenanceAuthority): Promise<string>;
  assertStopped(session: RegistryMaintenanceAuthority): Promise<void>;
  identify: (session: RegistryMaintenanceAuthority) => Promise<RegistryInventoryIdentity>;
  open: (
    session: RegistryMaintenanceAuthority,
    mode: 'readonly' | 'deletion',
  ) => Promise<{
    endpoint: RegistryEndpoint;
    close(): Promise<void>;
  }>;
  discardUploads(session: RegistryMaintenanceAuthority): Promise<string>;
  collect(session: RegistryMaintenanceAuthority): Promise<void>;
  verifyImages(session: RegistryMaintenanceAuthority, inventory: RegistryInventory): Promise<void>;
  restoreService(session: RegistryMaintenanceAuthority): Promise<void>;
}
export interface RegistryMaintenanceBackup {
  prepare(
    source: RegistryBackupPreparation,
    authority: RegistryMaintenanceAuthority,
  ): Promise<void>;
  snapshot(
    source: RegistryBackupSource,
    authority: RegistryMaintenanceAuthority,
  ): Promise<RegistryBackupReceipt>;
  verify(receipt: RegistryBackupReceipt, authority: RegistryMaintenanceAuthority): Promise<void>;
}
const key = (reference: { repository: string; digest: string }) =>
  `${reference.repository}@${reference.digest}`;
function evidence(session: RegistryMaintenanceSession): RegistryMaintenanceEvidence {
  const current = session.read().maintenanceEvidence;
  if (current === null) throw new Error('Missing maintenance evidence');
  return current;
}

/** Uncached remote reads of every retained revision and its repository-scoped transitive closure, with streaming digest verification. */
export async function verifyRegistryPulls(
  inventory: RegistryInventory,
  endpoint: RegistryEndpoint,
): Promise<void> {
  const nodes = new Map(inventory.graph.nodes.map((node) => [node.digest, node]));
  const revisions = new Set(inventory.revisions.map(key));
  const verified = new Set<string>();
  const visit = async (repository: string, digest: string): Promise<void> => {
    const identity = key({ repository, digest });
    if (verified.has(identity)) return;
    const node = nodes.get(digest);
    if (node === undefined) throw new Error('Missing retained pull dependency');
    const response = await requestRegistry(
      endpoint,
      `/v2/${repository}/${revisions.has(identity) ? 'manifests' : 'blobs'}/${digest}`,
      {
        headers: {
          accept:
            'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json',
          'cache-control': 'no-cache',
        },
      },
    );
    if (response.status !== 200)
      throw new Error(`Retained pull failed (${String(response.status)})`);
    const hash = createHash('sha256');
    await consumeRegistryStream(
      response.body,
      inventory.journal.enrollment.maximumBytes,
      'Retained pull',
      (chunk) => {
        hash.update(chunk);
      },
    );
    // Proof: the retained remote corruption/absence faults must fail even when physical census is intact.
    if (`sha256:${hash.digest('hex')}` !== digest) throw new Error('Retained pull digest mismatch');
    verified.add(identity);
    for (const dependency of node.dependencies) await visit(repository, dependency);
  };
  for (const reference of inventory.revisions) await visit(reference.repository, reference.digest);
}

/** A 202 is only acceptance. Independently prove exact revision unlink and every planned current tag removal; 404 never substitutes. */
async function reconcileDeletion(
  path: string,
  deletion: RegistryMaintenanceEvidence['deletions'][number],
): Promise<void> {
  const manifests = join(
    path,
    'docker/registry/v2/repositories',
    deletion.repository,
    '_manifests',
  );
  const revision = join(manifests, 'revisions/sha256', deletion.digest.slice(7), 'link');
  try {
    await lstat(revision);
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT')) throw cause;
    for (const tag of deletion.tags) {
      try {
        await lstat(join(manifests, 'tags', tag));
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') continue;
        throw cause;
      }
      throw new Error('Accepted deletion left planned tag metadata', { cause });
    }
    return;
  }
  throw new Error('Accepted deletion left manifest revision');
}

/**
 * Backup and retirement share the publication/deployment authority for the entire operation.
 * {@link completeRegistryOperation} awaits cleanup for every outcome; both causes survive dual failure, and failed verification
 * never restores service. Matching
 * contents/journal backup precedes the persisted exact plan and all API/GC effects.
 */
export async function maintainRegistry(input: {
  directory: string;
  operationId: string;
  owner: string;
  kind: 'backup' | 'retirement';
  recover?: boolean;
  ports: RegistryJournalPorts;
  runtime: RegistryMaintenanceRuntime;
  backup: RegistryMaintenanceBackup;
}): Promise<void> {
  await runRegistryMaintenance(
    input.directory,
    {
      operationId: input.operationId,
      owner: input.owner,
      kind: input.kind,
      recover: input.recover ?? false,
    },
    input.ports,
    async (session) => {
      const census = async (projectRevision = false): Promise<RegistryInventory> => {
        await input.runtime.assertStopped(session);
        const identity = await input.runtime.identify(session);
        const server = await input.runtime.open(session, 'readonly');
        // Proof: legacy finally semantics at this call drop the primary failure in the actual census caller test.
        return completeRegistryOperation(
          async () => {
            const journal = session.read();
            if (projectRevision) journal.revision++;
            return await collectRegistryInventory({
              journal,
              identity,
              endpoint: server.endpoint,
              consumers: input.ports,
            });
          },
          () => server.close(),
        );
      };
      // Proof: unavailable backup repository/budget refuses before the first host fence mutation.
      await input.backup.prepare(
        {
          operationId: input.operationId,
          ...session.read().enrollment,
          journalPath: input.directory,
        },
        session,
      );
      const phase = () => {
        const owned = session.read().maintenance;
        if (owned === null) throw new Error('Missing resumed maintenance');
        return owned.phase;
      };
      if (evidence(session).backup !== null)
        throw new Error('Verified backup requires explicit staged recovery');
      if (phase() === 'acquired') {
        if (evidence(session).runtime === null)
          await session.record({
            ...evidence(session),
            runtime: await input.runtime.inspect(session),
          });
        await session.advance('reconciled');
      }
      const barrier = await input.runtime.fence(session);
      await session.record({ ...evidence(session), runtime: barrier });
      if (phase() === 'reconciled') await session.advance('fenced');
      // Proof: unavailable-ACK caller tests reach verified backup without ACK; adding its dependency refuses with modeled ENOSPC.
      // Proof: removing this stop check records stopped for a surviving writer; the later census check still refuses backup.
      await input.runtime.assertStopped(session);
      if (phase() === 'fenced') await session.advance('stopped');
      if (phase() !== 'stopped') throw new Error('Invalid pre-backup recovery phase');
      const before = await census();
      await session.record({
        ...evidence(session),
        backupCensusSha256: before.binding.censusSha256,
      });
      const state = session.read();
      const backup = await input.backup.snapshot(
        {
          operationId: input.operationId,
          ...state.enrollment,
          journalPath: input.directory,
          journalRevision: state.revision,
          censusSha256: before.binding.censusSha256,
        },
        session,
      );
      await session.record({ ...evidence(session), backup, retained: [...before.revisions] });
      await input.backup.verify(backup, session);
      await session.advance('backed-up');
      if (input.kind === 'retirement') {
        // Proof: omitting this call reaches real GC without the measured baseline asserted by the retirement caller test.
        const capacity = await session.measureReclamation('before');
        const inventory = await census(true);
        const plan = planRegistryRetirement(inventory, {
          now: (input.ports.now ?? (() => new Date().toISOString()))(),
          mode: 'nightly',
          capacity,
        });
        const removed = new Set(plan.retireRevisions.map(key));
        await session.record({
          ...evidence(session),
          plan: JSON.stringify(plan),
          retained: inventory.revisions.filter((revision) => !removed.has(key(revision))),
          deletions: plan.retireRevisions.map((revision) => ({
            ...revision,
            tags: inventory.tags
              .filter((tag) => key(tag) === key(revision))
              .map((tag) => tag.tag)
              .sort(),
            state: 'pending',
          })),
        });
        // Recollect real current journal after durable plan persistence; the prior projected revision must now agree exactly.
        assertRegistryPlan(plan, await census());
        await session.prepareRetirement(plan);
        await session.advance('deleting');
        await input.runtime.assertStopped(session);
        await input.backup.verify(backup, session);
        const server = await input.runtime.open(session, 'deletion');
        // Proof: legacy finally semantics at this call drop the primary failure in the actual deletion caller test.
        await completeRegistryOperation(
          async () => {
            for (let index = 0; index < plan.retireRevisions.length; index++) {
              const current = evidence(session);
              const deletion = current.deletions.at(index);
              if (deletion?.state !== 'pending') throw new Error('Invalid planned deletion state');
              const response = await requestRegistry(
                server.endpoint,
                `/v2/${deletion.repository}/manifests/${deletion.digest}`,
                { method: 'DELETE' },
              );
              await response.body?.cancel();
              // Proof: pinned post-unlink HTTP500/retry404 cannot create accepted or verified deletion evidence.
              if (response.status !== 202)
                throw new Error(`Manifest deletion is unconfirmed (${String(response.status)})`);
              deletion.state = 'accepted';
              await session.record(current);
              await reconcileDeletion(session.read().enrollment.registryPath, deletion);
              deletion.state = 'verified';
              await session.record(current);
            }
          },
          () => server.close(),
        );
        await input.runtime.assertStopped(session);
        const uploadsVerified = await input.runtime.discardUploads(session);
        await session.record({ ...evidence(session), uploadsVerified });
        await session.retire(plan);
        await input.runtime.assertStopped(session);
        await input.runtime.collect(session);
        await session.advance('collected');
      }
      await input.runtime.assertStopped(session);
      const identity = await input.runtime.identify(session);
      const server = await input.runtime.open(session, 'readonly');
      // Proof: legacy finally semantics at this call drop the primary failure in the actual retained caller test.
      const retained = await completeRegistryOperation(
        async () => {
          const retained = await collectRegistryInventory({
            journal: session.read(),
            identity,
            endpoint: server.endpoint,
            consumers: input.ports,
          });
          if (
            JSON.stringify(retained.revisions.map(key).sort()) !==
            JSON.stringify(evidence(session).retained.map(key).sort())
          )
            throw new Error('Retained exact repository revisions changed');
          if (
            input.kind === 'retirement' &&
            (retained.orphanBlobs.length !== 0 || retained.uploads.length !== 0)
          )
            throw new Error('Verified retirement left uncollected blobs or staging');
          await verifyRegistryPulls(retained, server.endpoint);
          return retained;
        },
        () => server.close(),
      );
      await input.runtime.assertStopped(session);
      // Proof: removing this call loses the actual client-failure diagnostic before restoration, while the journal separately refuses missing completion.
      await input.runtime.verifyImages(session, retained);
      await input.runtime.assertStopped(session);
      // Proof: omitting final measurement prevents successful retirement; it cannot fabricate reclaimed amounts from the plan.
      if (input.kind === 'retirement') await session.measureReclamation('after');
      else await input.ports.measureRegistry(session.read().enrollment);
      await session.advance('verified');
      // Proof: removing this gate restores service after an acknowledgement stalls long enough to expire its final measurement.
      requireRegistryRestorationEvidence(
        session.read(),
        input.directory,
        (input.ports.now ?? (() => new Date().toISOString()))(),
      );
      // Proof: backup corruption and retained verification failures never reach this success-only restoration.
      await input.runtime.restoreService(session);
      await session.advance('restored');
      await session.advance('completed');
    },
  );
}

interface RegistryRecoveryOperation {
  directory: string;
  operationId: string;
  owner: string;
  kind: 'backup' | 'retirement' | 'restore';
  ports: RegistryJournalPorts;
  runtime: RegistryMaintenanceRuntime;
  backup: RegistryMaintenanceBackup;
}

/** Recovery stops at an active fenced handoff. Old desired Flux artifacts cannot silently move serving back to the preserved old store. */
export async function stageRegistryRecovery(input: RegistryRecoveryOperation): Promise<void> {
  await runRegistryMaintenance(
    input.directory,
    { operationId: input.operationId, owner: input.owner, kind: input.kind, recover: true },
    input.ports,
    async (session) => {
      const backup = evidence(session).backup;
      if (backup === null) throw new Error('Recovery requires matching verified backup');
      await session.record({ ...evidence(session), runtime: await input.runtime.fence(session) });
      await input.runtime.assertStopped(session);
      await input.backup.verify(backup, session);
      const recovery = evidence(session).recovery;
      if (recovery !== null && RegistryRecoveryReceipt.allows(JSON.parse(recovery))) {
        requireRegistryRecoveryReceipt(session.read(), input.directory);
        const identity = await input.runtime.identify(session);
        const server = await input.runtime.open(session, 'readonly');
        // Proof: legacy finally semantics at this call drop the primary failure in the actual stage caller test.
        const inventory = await completeRegistryOperation(
          async () => {
            const inventory = await collectRegistryInventory({
              journal: session.read(),
              identity,
              endpoint: server.endpoint,
              consumers: input.ports,
            });
            await verifyRegistryPulls(inventory, server.endpoint);
            return inventory;
          },
          () => server.close(),
        );
        await input.runtime.assertStopped(session);
        await input.runtime.verifyImages(session, inventory);
        await input.runtime.assertStopped(session);
      } else await session.restore();
      await session.deferActivation();
    },
  );
}

/** Task11 first aligns configured desired/runtime storage. Fresh observations and full retained reads precede prior-service restoration under the same session. */
export async function completeRegistryRecovery(
  input: RegistryRecoveryOperation & {
    assertDesired(authority: RegistryMaintenanceAuthority): Promise<void>;
  },
): Promise<void> {
  await runRegistryMaintenance(
    input.directory,
    { operationId: input.operationId, owner: input.owner, kind: input.kind, recover: true },
    input.ports,
    async (session) => {
      const current = session.read();
      if (
        !['verified', 'restored'].includes(current.maintenance?.phase ?? '') ||
        current.maintenanceEvidence?.recovery === null
      )
        throw new Error('Recovery is not awaiting coordinated activation');
      requireRegistryRecoveryReceipt(current, input.directory);
      const backup = evidence(session).backup;
      if (backup === null) throw new Error('Activation requires verified backup lineage');
      await session.record({ ...evidence(session), runtime: await input.runtime.fence(session) });
      await input.runtime.assertStopped(session);
      await input.backup.verify(backup, session);
      await input.assertDesired(session);
      const identity = await input.runtime.identify(session);
      const server = await input.runtime.open(session, 'readonly');
      // Proof: legacy finally semantics at this call drop the primary failure in the actual activate caller test.
      const inventory = await completeRegistryOperation(
        async () => {
          const inventory = await collectRegistryInventory({
            journal: session.read(),
            identity,
            endpoint: server.endpoint,
            consumers: input.ports,
          });
          await verifyRegistryPulls(inventory, server.endpoint);
          return inventory;
        },
        () => server.close(),
      );
      await input.runtime.assertStopped(session);
      await input.runtime.verifyImages(session, inventory);
      await input.runtime.assertStopped(session);
      await input.assertDesired(session);
      requireRegistryRestorationEvidence(
        session.read(),
        input.directory,
        (input.ports.now ?? (() => new Date().toISOString()))(),
      );
      await input.runtime.restoreService(session);
      if (session.read().maintenance?.phase === 'verified') await session.advance('restored');
      await session.advance('completed');
    },
  );
}
