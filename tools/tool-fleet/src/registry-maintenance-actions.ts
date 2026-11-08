import { lstat, readFile } from 'node:fs/promises';

import { type } from 'arktype';

import { selectRegistryAuthorityStorage } from './registry-authority-host';
import { runRegistryBackupWorker } from './registry-backup-worker';
import { measureVerifiedFilesystem } from './registry-capacity';
import { requireRegistryClientRecovery } from './registry-client-lineage';
import { runRegistryClientWorker } from './registry-client-worker';
import {
  observeRegistryCluster,
  observeRegistryVolume,
  registryDeploymentReady,
  withdrawnRegistrySelector,
} from './registry-maintenance-cluster';
import type { RegistryMaintenanceHostRequest } from './registry-maintenance-control';
import { fenceRegistryControllers } from './registry-maintenance-flux';
import {
  type RegistryMaintenanceInstallation,
  requireRegistryRecoveryInstallation,
  verifyRegistryHostArtifact,
} from './registry-maintenance-installation';
import { createRegistryKubernetes } from './registry-maintenance-kubernetes';
import { runRegistryMaintenanceServer } from './registry-maintenance-server';
import {
  RegistryRecoveryReceipt,
  requireRegistryCollectionEvidence,
  requireRegistryRestorationEvidence,
} from './registry-maintenance-state';
import { readRegistryWriters } from './registry-maintenance-writers';
import type { RegistryMaintenanceJournal } from './registry-managed-journal';
import { registryPodsUseStorage } from './registry-pod-writers';
import { discardRegistryUploads } from './registry-upload-census';

const Owner = type({
  name: 'string > 0',
  uid: 'string > 0',
  cluster: "'management'",
  source: 'string > 0',
  path: 'string > 0',
  specificationSha256: /^[a-f0-9]{64}$/,
  sourceRevision: 'string > 0',
  suspended: 'boolean',
  requestedAt: 'string | null',
  '+': 'reject',
});
const Runtime = type({
  operationId: 'string > 0',
  registryId: 'string > 0',
  prior: {
    owners: Owner.array().atLeastLength(4).atMostLength(4),
    replicas: '0 | 1',
    withdrawn: 'boolean',
    '+': 'reject',
  },
  sources: type({ name: 'string', revision: 'string', digest: 'string', '+': 'reject' })
    .array()
    .atLeastLength(2)
    .atMostLength(2),
  acknowledgements: type({ name: 'string', requestedAt: 'string > 0', '+': 'reject' })
    .array()
    .atMostLength(4),
  '+': 'reject',
});

/** Stale/unready endpoints still carry routable addresses; readiness false does not prove withdrawal. */
export function registryEndpointsWithdrawn(input: unknown[]): boolean {
  return input.every((entry) =>
    type({ endpoints: type({ addresses: 'string[]' }).array() })
      .assert(entry)
      .endpoints.every((endpoint) => endpoint.addresses.length === 0),
  );
}

/** Fixed root action dispatcher. Its request was validated under inherited FD3 by the control supervisor; every effect re-observes the trusted installed resources. */
export async function executeRegistryHostAction(input: {
  installed: RegistryMaintenanceInstallation;
  journal: RegistryMaintenanceJournal;
  request: RegistryMaintenanceHostRequest;
  signal: AbortSignal;
  descriptor: number;
  ready: (receipt: string) => Promise<void>;
}): Promise<string> {
  const { installed, journal, request, signal } = input;
  // Proof: missing/stale/changed receipt root-action tests reach modeled trusted effects when this early gate is removed.
  if (request.action === 'restore-service')
    requireRegistryRestorationEvidence(journal, installed.journalPath, new Date().toISOString());
  const storage = selectRegistryAuthorityStorage(journal.enrollment, installed);
  const api = await createRegistryKubernetes(
    installed,
    input.descriptor,
    signal,
    request.action === 'restore-service'
      ? () => {
          requireRegistryRestorationEvidence(
            journal,
            installed.journalPath,
            new Date().toISOString(),
          );
        }
      : undefined,
  );

  const cluster = () => observeRegistryCluster(installed, storage, api.read);
  const mount = async (selected = storage) => {
    if ((await readFile('/etc/machine-id', 'utf8')).trim() !== installed.machineId)
      throw new Error('Maintenance helper is on a different machine');
    await verifyRegistryHostArtifact(installed.distribution);
    const [registry, canonical, registryStatus, canonicalStatus, root] = await Promise.all([
      measureVerifiedFilesystem(selected.path, selected.identityReceipt),
      measureVerifiedFilesystem(installed.journalPath, installed.journalIdentityReceipt),
      lstat(selected.path),
      lstat(installed.journalPath),
      lstat('/'),
    ]);
    if (
      registry.identity !== selected.storageId ||
      registry.maximumBytes !== selected.maximumBytes ||
      canonical.maximumBytes !== installed.journalMaximumBytes ||
      new Set([registryStatus.dev, canonicalStatus.dev, root.dev]).size !== 3 ||
      registryStatus.uid !== 59001 ||
      canonicalStatus.uid !== 59001
    )
      throw new Error(
        'Registry/canonical journal mounts differ from independent installed identities',
      );
    return {
      registryId: installed.registryId,
      storageId: selected.storageId,
      node: installed.node.name,
      pvcUid: selected.pvc.uid,
      mountIdentity: `${String(registryStatus.dev)}:${registry.identity}`,
      distributionDigest: 'sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278',
      binarySha256: installed.distribution.sha256,
    };
  };
  const previous = () => {
    const serialized = journal.maintenanceEvidence?.runtime;
    if (serialized === null || serialized === undefined)
      throw new Error('Missing prior registry runtime receipt');
    const receipt = Runtime.assert(JSON.parse(serialized));
    if (
      receipt.operationId !== request.operationId ||
      receipt.registryId !== installed.registryId ||
      JSON.stringify(receipt.prior.owners.map((owner) => [owner.name, owner.uid])) !==
        JSON.stringify(installed.owners.map((owner) => [owner.name, owner.uid]))
    )
      throw new Error('Prior registry runtime receipt differs from operation/owner identities');
    return receipt;
  };
  const hasWriters = async () => {
    // Proof: omitting enrolled recovery lets the actual stopped-action recovery-alias test verify writer absence.
    const stores: [
      RegistryMaintenanceInstallation['ordinary'],
      ...RegistryMaintenanceInstallation['ordinary'][],
    ] = [
      installed.ordinary,
      ...(installed.recovery.state === 'enrolled' ? [installed.recovery] : []),
    ];
    // Proof: omitting await falsely blocks the unrelated-path stopped-action test.
    if (
      await registryPodsUseStorage(
        await api.pods(),
        stores.map((store) => store.pvc.name),
        [stores[0].path, ...stores.slice(1).map((store) => store.path)],
        installed.node.name,
      )
    )
      return true;
    return (await readRegistryWriters(storage.path, installed.distribution.path)).length > 0;
  };
  const audit = async () => {
    signal.throwIfAborted();
    await mount();
    return cluster();
  };
  const stopped = async (receipt = previous()) => {
    const observed = await audit();
    if (
      receipt.acknowledgements.length !== 4 ||
      observed.replicas !== 0 ||
      JSON.stringify(observed.serviceSelector) !== JSON.stringify(withdrawnRegistrySelector) ||
      observed.owners.some((owner) => !owner.suspended) ||
      receipt.acknowledgements.some(
        (ack) =>
          observed.acknowledgements.find((current) => current.name === ack.name)?.requestedAt !==
          ack.requestedAt,
      ) ||
      !registryEndpointsWithdrawn(await api.endpoints()) ||
      (await hasWriters())
    )
      throw new Error('Registry writer exclusion is not freshly verified');
    return observed;
  };
  switch (request.action) {
    case 'verify-images':
    case 'verify-recovery-images': {
      const beforeLaunch = async () => {
        await stopped();
        if (request.action === 'verify-recovery-images') {
          const { target, prepared } = requireRegistryClientRecovery(journal, installed);
          await observeRegistryVolume(installed, api.read, target.pvc, target.pv, target.path);
          const identity = await mount(target);
          // Proof: actual dispatcher mount/distribution negatives reach the worker with this comparison removed.
          if (
            identity.mountIdentity !== prepared.mountIdentity ||
            identity.distributionDigest !== prepared.distributionDigest
          )
            throw new Error('Client target differs from prepared recovery identity');
        }
      };
      await beforeLaunch();
      return runRegistryClientWorker({ ...input, beforeLaunch });
    }

    case 'backup-reconcile':
    case 'backup-preflight':
    case 'backup-snapshot':
    case 'backup-verify':
    case 'backup-restore': {
      if (request.action === 'backup-preflight' || request.action === 'backup-reconcile')
        await audit();
      else await stopped();
      if (request.action === 'backup-restore')
        await executeRegistryHostAction({
          ...input,
          request: { ...request, action: 'verify-recovery-target' },
        });
      return runRegistryBackupWorker(input);
    }
    case 'inspect': {
      const observed = await audit();
      return JSON.stringify(
        Runtime.assert({
          operationId: request.operationId,
          registryId: installed.registryId,
          prior: {
            owners: observed.owners,
            replicas: observed.replicas,
            withdrawn:
              JSON.stringify(observed.serviceSelector) ===
              JSON.stringify(withdrawnRegistrySelector),
          },
          sources: installed.sources.map((source) => ({
            name: source.resource.name,
            revision: source.revision,
            digest: source.digest,
          })),
          acknowledgements: [],
        }),
      );
    }
    case 'fence': {
      const receipt = previous();
      const confirmed = new Map<string, string>();
      const acknowledgements = await fenceRegistryControllers(receipt.prior.owners, {
        verify: async () => {
          const observed = await audit();
          for (const [name, token] of confirmed)
            if (
              !observed.owners.find((owner) => owner.name === name)?.suspended ||
              observed.acknowledgements.find((ack) => ack.name === name)?.requestedAt !== token
            )
              throw new Error('Previously drained Flux owner revived or lost acknowledgement');
        },
        withdraw: async () => {
          await api.patch('production', installed.service, { kind: 'withdraw' });
          await converge(
            async () => registryEndpointsWithdrawn(await api.endpoints()),
            signal,
            'Registry endpoint withdrawal',
          );
        },
        patch: async (owner, requestedAt) => {
          const pin = installed.owners.find(
            (pin) => pin.name === owner.name && pin.uid === owner.uid,
          );
          if (pin === undefined) throw new Error('Uninstalled Flux owner');
          await api.patch('management', pin, { kind: 'owner', suspended: true, requestedAt });
        },
        observe: async (owner) => {
          const observed = await cluster();
          const current = observed.owners.find((current) => current.name === owner.name);
          const acknowledgement = observed.acknowledgements.find(
            (current) => current.name === owner.name,
          );
          if (current === undefined || acknowledgement === undefined)
            throw new Error('Missing fresh owner observation');
          if (
            current.suspended &&
            acknowledgement.requestedAt !== null &&
            acknowledgement.requestedAt === current.requestedAt
          )
            confirmed.set(owner.name, acknowledgement.requestedAt);
          return { suspended: current.suspended, requestedAt: acknowledgement.requestedAt };
        },
        stop: () => api.patch('production', storage.deployment, { kind: 'stop' }),
        hasWriters,
      });
      const fenced = { ...receipt, acknowledgements };
      await stopped(fenced);
      return JSON.stringify(fenced);
    }
    case 'assert-stopped':
      await stopped();
      return 'verified';
    case 'identify':
      await stopped();
      return JSON.stringify(await mount());
    case 'assert-desired': {
      await stopped();
      const evidence = journal.maintenanceEvidence;
      if (evidence?.recovery === null || evidence?.recovery === undefined)
        throw new Error('Missing recovered storage receipt');
      const recovered = RegistryRecoveryReceipt.assert(JSON.parse(evidence.recovery));
      if (
        recovered.operationId !== request.operationId ||
        recovered.storageId !== storage.storageId ||
        recovered.registryPath !== storage.path ||
        recovered.maximumBytes !== storage.maximumBytes ||
        recovered.canonicalJournalPath !== installed.journalPath ||
        evidence.backup?.snapshotId !== recovered.snapshotId
      )
        throw new Error('Desired target differs from verified recovery receipt');
      return 'verified';
    }
    case 'verify-recovery-target': {
      const target = requireRegistryRecoveryInstallation(installed);
      await stopped();
      await observeRegistryVolume(installed, api.read, target.pvc, target.pv, target.path);
      const identity = await mount(target);
      const staged = await measureVerifiedFilesystem(
        target.stagedJournalPath,
        target.stagedJournalIdentityReceipt,
      );
      const devices = await Promise.all(
        [
          target.path,
          target.stagedJournalPath,
          installed.journalPath,
          journal.enrollment.registryPath,
        ].map((path) => lstat(path)),
      );
      if (
        new Set(devices.map((current) => current.dev)).size !== 4 ||
        staged.identity !== target.stagedJournalStorageId ||
        staged.maximumBytes !== target.stagedJournalMaximumBytes
      )
        throw new Error('Recovery registry/journal targets are not independently bounded');
      const backup = journal.maintenanceEvidence?.backup;
      if (backup === null || backup === undefined)
        throw new Error('Recovery target requires verified snapshot lineage');
      return JSON.stringify({
        target: {
          state: 'prepared',
          operationId: request.operationId,
          snapshotId: backup.snapshotId,
          previousStorageId: journal.enrollment.storageId,
          previousRegistryPath: journal.enrollment.registryPath,
          storageId: target.storageId,
          registryPath: target.path,
          maximumBytes: target.maximumBytes,
          canonicalJournalPath: installed.journalPath,
          stagedJournalPath: target.stagedJournalPath,
          stagedJournalStorageId: target.stagedJournalStorageId,
          stagedJournalMaximumBytes: target.stagedJournalMaximumBytes,
          node: identity.node,
          pvcUid: identity.pvcUid,
          mountIdentity: identity.mountIdentity,
          distributionDigest: identity.distributionDigest,
          binarySha256: identity.binarySha256,
          preparedAt: new Date().toISOString(),
        },
        registryIdentityReceipt: target.identityReceipt,
        stagedJournalIdentityReceipt: target.stagedJournalIdentityReceipt,
        canonicalJournalIdentityReceipt: installed.journalIdentityReceipt,
      });
    }
    case 'discard-uploads': {
      await stopped();
      return discardRegistryUploads(journal, signal);
    }
    case 'serve-readonly':
    case 'serve-deletion':
    case 'serve-recovery':
    case 'collect': {
      await stopped();
      const selected =
        request.action === 'serve-recovery'
          ? requireRegistryRecoveryInstallation(installed)
          : storage;
      if (request.action === 'serve-recovery') {
        await observeRegistryVolume(installed, api.read, selected.pvc, selected.pv, selected.path);
        await mount(selected);
      }
      // Proof: native HOST25 refuses missing retirement evidence before GC; HOST26 removes this call, clears journal.retirements while the verified backup remains, and observes an actual Distribution GC PID before the fixture fails.
      if (request.action === 'collect') requireRegistryCollectionEvidence(journal);
      await runRegistryMaintenanceServer({
        installed,
        storage: selected,
        action:
          request.action === 'collect'
            ? 'collect'
            : request.action === 'serve-deletion'
              ? 'deletion'
              : 'readonly',
        token: request.token,
        descriptor: input.descriptor,
        signal,
        ready: input.ready,
      });
      return 'verified';
    }
    case 'restore-service': {
      const receipt = previous();
      await stopped(receipt);
      // Proof: delayed stopped/replicas production-block negatives reach the next reopening patch when the respective guard is removed.
      requireRegistryRestorationEvidence(journal, installed.journalPath, new Date().toISOString());
      // Only the success path calls this action. Restore child owners before either parent graph.
      await api.patch('production', storage.deployment, {
        kind: 'replicas',
        value: receipt.prior.replicas,
      });
      // Proof: delayed stopped/replicas production-block negatives reach the next reopening patch when the respective guard is removed.
      requireRegistryRestorationEvidence(journal, installed.journalPath, new Date().toISOString());
      await api.patch('production', installed.service, {
        kind: 'service',
        withdrawn: receipt.prior.withdrawn,
      });
      for (const owner of [...receipt.prior.owners].reverse()) {
        const pin = installed.owners.find(
          (pin) => pin.name === owner.name && pin.uid === owner.uid,
        );
        if (pin === undefined) throw new Error('Prior Flux owner is no longer installed');
        // Proof: expiry during service restoration reaches an owner patch when this guard is removed.
        requireRegistryRestorationEvidence(
          journal,
          installed.journalPath,
          new Date().toISOString(),
        );
        await api.patch('management', pin, {
          kind: 'owner',
          suspended: owner.suspended,
          requestedAt: owner.requestedAt,
        });
      }
      await converge(
        async () =>
          registryDeploymentReady(
            await api.read('production', storage.deployment),
            receipt.prior.replicas,
          ),
        signal,
        'Restored registry availability',
      );
      const observed = await audit();
      if (
        observed.replicas !== receipt.prior.replicas ||
        observed.owners.some((owner) => {
          const prior = receipt.prior.owners.find((prior) => prior.name === owner.name);
          const hasPrior = prior !== undefined;
          return (
            !hasPrior ||
            owner.suspended !== prior.suspended ||
            owner.requestedAt !== prior.requestedAt
          );
        }) ||
        (JSON.stringify(observed.serviceSelector) === JSON.stringify(withdrawnRegistrySelector)) !==
          receipt.prior.withdrawn
      )
        throw new Error('Prior registry service/Flux state restoration is unconfirmed');
      return 'verified';
    }
  }
}

async function converge(
  observe: () => Promise<boolean>,
  signal: AbortSignal,
  name: string,
): Promise<void> {
  const deadline = Date.now() + 120000;
  for (;;) {
    signal.throwIfAborted();
    if (await observe()) return;
    if (Date.now() >= deadline) throw new Error(`${name} did not converge`);
    await Bun.sleep(1000);
  }
}
