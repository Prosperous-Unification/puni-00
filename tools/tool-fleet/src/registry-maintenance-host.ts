import { RegistryBackupAction, RegistryBackupCompletion } from './registry-backup-attempt';
import { RegistryBackupLockRecovery } from './registry-backup-locks';
import { requireRegistryClientCompletion } from './registry-client-completion';
import { requireRegistryClientPlan } from './registry-client-evidence';
import type { RegistryClientPullPlan } from './registry-client-plan';
import { authenticateMaintenanceChannel } from './registry-maintenance-channel';
import type { RegistryMaintenanceHostRequest } from './registry-maintenance-control';
import { createMaintenanceSocketPair } from './registry-maintenance-socket';
import { verifyRegistryMaintenanceSudo } from './registry-maintenance-sudo';
import type { RegistryMaintenanceSession } from './registry-managed-journal';

const executable = '/usr/local/libexec/puni-registry-maintenance-host';

async function bounded<T>(pending: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Maintenance helper termination is unconfirmed; recovery required'));
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fixed sudo command and private inherited FD0 socket. The existing authority description crosses
 * via SCM_RIGHTS; the token follows only a current-kernel-credential root acknowledgement. Root
 * owns effect cancellation/reaping and holds its received descriptor through terminal cleanup.
 * See docs/adr/0076-registry-maintenance-transfers-the-held-authority-descriptor.md.
 */
export async function connectRegistryMaintenanceHost(
  session: Pick<
    RegistryMaintenanceSession,
    | 'read'
    | 'authorityDescriptor'
    | 'prepareBackup'
    | 'settleBackup'
    | 'prepareBackupReconciliation'
    | 'reconcileBackups'
    | 'settleClient'
  >,
  action: RegistryMaintenanceHostRequest['action'],
  clientPlan?: RegistryClientPullPlan,
): Promise<{ receipt: string; close: () => Promise<void> }> {
  const scope =
    action === 'verify-images'
      ? 'current'
      : action === 'verify-recovery-images'
        ? 'recovery'
        : undefined;
  // Proof: removing this action/plan agreement admits missing plan and a plan attached to another fixed action.
  if ((scope === undefined) !== (clientPlan === undefined))
    throw new Error('Client host action requires exactly its independent parent plan');
  if (scope !== undefined && clientPlan !== undefined)
    requireRegistryClientPlan(session.read(), clientPlan, scope);
  const owned = session.read().maintenance;
  if (owned === null) throw new Error('Missing maintenance session');
  // Proof: removing admission reaches privileged spawn with an unverified fixed binary.
  await verifyRegistryMaintenanceSudo();
  const pair = createMaintenanceSocketPair();
  let child: Bun.Subprocess<number, 'pipe', 'pipe'>;
  try {
    // No extra FD preservation option or loader environment; input relays fail the nonsecret bootstrap.
    child = Bun.spawn(['/usr/bin/sudo.ws', '-n', '--', executable], {
      env: { PATH: '/usr/bin:/bin', LANG: 'C' },
      stdio: [pair.helper.descriptor, 'pipe', 'pipe'],
    });
  } catch (cause) {
    pair.parent.close();
    pair.helper.close();
    throw cause;
  }
  pair.helper.close();
  const drain = async (stream: ReadableStream<Uint8Array>, maximum: number) => {
    const reader = stream.getReader();
    let bytes = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) return;
        bytes += chunk.value.length;
        if (bytes > maximum) throw new Error('Unexpected maintenance helper diagnostics');
      }
    } finally {
      reader.releaseLock();
    }
  };
  const diagnostics = Promise.all([drain(child.stdout, 0), drain(child.stderr, 65536)]);
  const diagnosticFailure = diagnostics.then(() => new Promise<never>(() => undefined));
  let ended = false;
  const fail = async (cause: unknown): Promise<never> => {
    // EOF asks root to stop/reap; UID59001 never attempts to signal root descendants.
    pair.parent.close();
    try {
      await bounded(Promise.all([child.exited, diagnostics]), 30000);
    } catch (cleanup) {
      throw new AggregateError(
        [cause, cleanup],
        'Maintenance helper cleanup is unconfirmed; recovery required',
        { cause: cleanup },
      );
    }
    throw cause;
  };
  try {
    const channel = await Promise.race([
      authenticateMaintenanceChannel(pair.parent, session.authorityDescriptor),
      diagnosticFailure,
    ]);
    // Proof: transport tests observed request dispatch before preparation; preparation failure now sends no token.
    if (action === 'backup-reconcile') await session.prepareBackupReconciliation();
    const attempt = RegistryBackupAction.allows(action)
      ? await session.prepareBackup(action, channel.guardianPid)
      : undefined;
    await channel.request({
      action,
      operationId: owned.operationId,
      owner: owned.owner,
      token: owned.token,
    });
    const next = (milliseconds: number) =>
      Promise.race([channel.frame(AbortSignal.timeout(milliseconds)), diagnosticFailure]);
    const finish = async () => {
      const [code] = await bounded(Promise.all([child.exited, diagnostics]), 30000);
      if (code !== 0) throw new Error('Maintenance helper cleanup is unconfirmed');
      // Proof: removing terminal EOF validation makes the trailing-frame negative settle and resolve.
      await channel.end();
      pair.parent.close();
      ended = true;
    };
    const first = await next(3610000);
    if (first.kind === 'failed') {
      if (
        !['backup-budget-unavailable', 'recovery-target-unenrolled', 'effect-failed'].includes(
          first.receipt,
        )
      )
        throw new Error('Unknown maintenance helper failure code');
      throw new Error(`Registry maintenance refused: ${first.receipt}; recovery required`);
    }
    if (first.kind === 'complete') {
      const completion =
        attempt === undefined
          ? undefined
          : RegistryBackupCompletion.assert(JSON.parse(first.receipt));
      if (completion !== undefined && completion.attemptId !== attempt?.id)
        throw new Error('Backup completion differs from durable attempt');
      const reconciled =
        action === 'backup-reconcile'
          ? RegistryBackupLockRecovery.assert(JSON.parse(first.receipt))
          : undefined;
      await finish();
      if (scope !== undefined && clientPlan !== undefined) {
        const journal = session.read();
        const backup = journal.maintenanceEvidence?.backup;
        if (backup === null || backup === undefined)
          throw new Error('Missing client backup lineage');
        const receipt = requireRegistryClientCompletion(JSON.parse(first.receipt), {
          plan: clientPlan,
          owner: {
            operationId: owned.operationId,
            registryId: journal.enrollment.registryId,
            snapshotId: backup.snapshotId,
            scope,
          },
          now: new Date().toISOString(),
        });
        // Proof: removing settlement resolves the actual transport positive without its required post-EOF durable acknowledgement.
        await session.settleClient(receipt, clientPlan);
      }
      if (reconciled !== undefined) await session.reconcileBackups(reconciled);
      // Proof: missing/foreign/extra/trailing root completion cannot settle ownership in host transport tests.
      if (completion !== undefined)
        await session.settleBackup(completion.attemptId, completion.receipt);
      return { receipt: completion?.receipt ?? first.receipt, close: () => Promise.resolve() };
    }
    if (
      first.kind !== 'ready' ||
      !['serve-readonly', 'serve-deletion', 'serve-recovery'].includes(action)
    )
      throw new Error('Unexpected maintenance helper readiness');
    return {
      receipt: first.receipt,
      close: async () => {
        if (ended) throw new Error('Maintenance helper connection already closed');
        try {
          await channel.cancel();
          const terminal = await next(30000);
          if (terminal.kind !== 'cancelled')
            throw new Error('Unexpected maintenance helper terminal frame');
          await finish();
        } catch (cause) {
          await fail(cause);
        }
      },
    };
  } catch (cause) {
    return fail(cause);
  }
}
