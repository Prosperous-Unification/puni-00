import { randomUUID } from 'node:crypto';

import {
  type ControllerAuthority,
  type ControllerLifecycle,
  drainController,
  restoreController,
  suspendController,
} from './controller-lifecycle';
import { inspectStorageOwner } from './storage-controller';
import { inspectStorageFence, inspectStorageIdentity } from './storage-fence';
import {
  assertStorageOwnership,
  sealStorageOwnership,
  type StorageOwnershipIdentity,
} from './storage-ownership';

export type ControllerTarget = Omit<StorageOwnershipIdentity, 'storage'>;
/** Ports for the two bounded source-storage intervals; no activation or semantic rollback authority. */
export interface ControllerEffects {
  suspendStorageController(
    target: ControllerTarget,
    prior: ControllerLifecycle | null,
    authority: ControllerAuthority,
  ): Promise<ControllerLifecycle>;
  drainStorageController(
    lifecycle: ControllerLifecycle,
    authority: ControllerAuthority,
  ): Promise<void>;
  restoreStorageController(
    lifecycle: ControllerLifecycle,
    authority: ControllerAuthority,
  ): Promise<ControllerLifecycle>;
  manualControllerCommand(lifecycle: ControllerLifecycle, journalPath: string): string;
}
/** Composes strict controller primitives onto the production bounded kubectl transport. */
export function controllerEffects(
  call: (args: readonly string[], input?: string) => Promise<string>,
  bound: { attempts: number; sleep: () => Promise<void> },
  command: readonly string[],
): ControllerEffects {
  return {
    async suspendStorageController(target, prior, authority) {
      await authority.assertLease();
      let ownership;
      if (prior === null) {
        const storage = await inspectStorageIdentity(target.namespace, call);
        const identity = { ...target, storage };
        ownership = sealStorageOwnership(
          identity,
          await inspectStorageOwner(identity, call),
          randomUUID(),
        );
      } else {
        assertStorageOwnership(prior.ownership, { ...target, storage: prior.ownership.storage });
        ownership = prior.ownership;
      }
      return suspendController(ownership, prior, call, authority);
    },
    async drainStorageController(lifecycle, authority) {
      await drainController(lifecycle, call, authority, bound);
      const owner = lifecycle.ownership;
      const options = { namespace: owner.namespace, flux: owner.flux };
      const fence = await inspectStorageFence(options, call);
      await inspectStorageFence(options, call, fence);
      // Proof: fresh-storage-binding bypass admitted the PVC replacement between drain and source capture.
      if (
        JSON.stringify(fence.storage) !== JSON.stringify(owner.storage) ||
        fence.fluxUid !== owner.fluxUid ||
        !fence.controllers.some(
          (controller) =>
            controller.kind === 'CronJob' &&
            controller.name === owner.owner.name &&
            controller.uid === owner.owner.uid,
        )
      )
        throw new Error('controller interval storage or owner identity changed');
      // Proof: final-original-owner omission let late template drift precede mounted source replay.
      await suspendController(owner, lifecycle, call, authority);
      await authority.assertLease();
    },
    restoreStorageController: (lifecycle, authority) =>
      restoreController(lifecycle, call, authority),
    manualControllerCommand(lifecycle, journalPath) {
      const owner = lifecycle.ownership;
      const args = [
        ...command,
        '-n',
        owner.namespace,
        'get',
        `cronjob/${owner.owner.name}`,
        '-o',
        'json',
      ];
      return (
        args.map((argument) => `'${argument.replaceAll("'", "'\\''")}'`).join(' ') +
        ` # reconcile only UID ${owner.owner.uid}, template ${owner.owner.templateSha256}, token ${owner.token}; preserve journal ${journalPath}; restore the recorded suspension only after verifying the stopped source interval`
      );
    },
  };
}
