import { readlink } from 'node:fs/promises';

import { type } from 'arktype';

import { selectRegistryAuthorityStorage } from './registry-authority-host';
import { measureVerifiedFilesystem } from './registry-capacity';
import {
  RegistryClientCompletion,
  requireRegistryClientCompletion,
} from './registry-client-completion';
import { runRegistryClientCustody } from './registry-client-custody';
import { requireRegistryClientRecovery } from './registry-client-lineage';
import { planRegistryClientPulls } from './registry-client-plan';
import type { RegistryMaintenanceJournal } from './registry-journal';
import type { RegistryMaintenanceHostRequest } from './registry-maintenance-control';
import {
  type RegistryMaintenanceInstallation,
  requireRegistryClientInstallation,
  verifyRegistryHostArtifact,
} from './registry-maintenance-installation';
import { awaitMaintenanceChild } from './registry-maintenance-process';
import { completeRegistryOperation } from './registry-operation-completion';
import { readRegistryBytes } from './registry-stream';

const Frame = type({ kind: "'complete'", receipt: RegistryClientCompletion, '+': 'reject' })
  .or({ kind: "'cancelled'", receipt: "'owned-effects-terminated'", '+': 'reject' })
  .or({ kind: "'failed'", code: "'effect-failed'", '+': 'reject' });

/**
 * Fixed outside-root launcher. Its dispatcher first proves stopped writers/controllers and target
 * mounts. Compute an independent physical plan, preserve the authority open description through
 * a fresh finite systemd scope and unshare worker, and authenticate terminal output by that owned
 * child capability. Only return completion after owned process groups, all pipes and the scope
 * are terminal. Cancellation first uses the kept control pipe, then escalates after five seconds.
 * No caller command/path/environment or reusable cache enters the worker.
 */
export async function runRegistryClientWorker(input: {
  installed: RegistryMaintenanceInstallation;
  journal: RegistryMaintenanceJournal;
  request: RegistryMaintenanceHostRequest;
  signal: AbortSignal;
  descriptor: number;
  beforeLaunch: () => Promise<void>;
}): Promise<string> {
  if (input.request.action !== 'verify-images' && input.request.action !== 'verify-recovery-images')
    throw new Error('Unsupported fixed client launcher action');
  const client = requireRegistryClientInstallation(input.installed);
  for (const artifact of [
    client.scope,
    client.control,
    client.worker,
    {
      path: '/usr/bin/unshare',
      sha256: '41c65e55107cbbb1a1f6994784a938dd7dbbe255d1fea6b7a58ec96eabe382ef',
    },
    {
      path: '/usr/local/libexec/puni-registry-authority/bun',
      sha256: '10702245766b225e70bbf6235fd6b47214fd94b4760d00ffaed8ab0df57ac235',
    },
  ])
    await verifyRegistryHostArtifact(artifact);
  const scope = input.request.action === 'verify-recovery-images' ? 'recovery' : 'current';
  const storage =
    scope === 'recovery'
      ? requireRegistryClientRecovery(input.journal, input.installed).target
      : selectRegistryAuthorityStorage(input.journal.enrollment, input.installed);
  const scratch = await measureVerifiedFilesystem(client.scratch.path, client.scratch.receiptPath);
  const journal: RegistryMaintenanceJournal = {
    ...input.journal,
    enrollment: {
      ...input.journal.enrollment,
      storageId: storage.storageId,
      registryPath: storage.path,
      maximumBytes: storage.maximumBytes,
    },
  };
  const plan = await planRegistryClientPulls(journal, scratch.allocationUnitBytes, input.signal);
  const backup = input.journal.maintenanceEvidence?.backup;
  if (backup === null || backup === undefined)
    throw new Error('Client launcher lacks verified snapshot lineage');
  const control = async (argv: string[]): Promise<string> => {
    const interrupted = new AbortController();
    const signal = AbortSignal.any([AbortSignal.timeout(10000), interrupted.signal]);
    const child = Bun.spawn([client.control.path, ...argv], {
      env: { PATH: '/usr/bin:/bin', LANG: 'C' },
      stdio: ['ignore', 'pipe', 'pipe', input.descriptor],
      detached: true,
    });
    const receive = async (stream: ReadableStream<Uint8Array>) => {
      try {
        return await readRegistryBytes(stream, 65536, 'Client scope control output');
      } catch (cause) {
        interrupted.abort(cause);
        throw cause;
      }
    };
    const outcomes = await Promise.allSettled([
      awaitMaintenanceChild(child, signal),
      receive(child.stdout),
      receive(child.stderr),
    ]);
    for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
    const output = outcomes.at(1);
    if (output?.status !== 'fulfilled' || !(output.value instanceof Uint8Array))
      throw new Error('Missing client scope control output');
    return new TextDecoder('utf8', { fatal: true }).decode(output.value);
  };
  const inactive = async (unit: string) => {
    const state = await control(['show', unit, '--property=LoadState,ActiveState,ControlGroup']);
    return (
      state.trimEnd().split('\n').sort().join('\n') ===
      'ActiveState=inactive\nControlGroup=\nLoadState=not-found'
    );
  };
  return runRegistryClientCustody({
    ...input,
    scope,
    plan,
    allocationUnitBytes: scratch.allocationUnitBytes,
    assertInactive: async (unit) => {
      if (!(await inactive(unit))) throw new Error('Client attempt scope is not terminal');
    },
    execute: async (attempt) => {
      const unit = attempt.unit;
      const origin = {
        mount: await readlink('/proc/self/ns/mnt'),
        network: await readlink('/proc/self/ns/net'),
        pid: await readlink('/proc/self/ns/pid'),
      };
      input.signal.throwIfAborted();
      const child = Bun.spawn(
        [
          client.scope.path,
          '--scope',
          '--quiet',
          '--collect',
          '--unit=' + unit,
          '--property=MemoryMax=512M',
          '--property=TasksMax=128',
          '--property=RuntimeMaxSec=3600',
          '/usr/bin/unshare',
          '--mount',
          '--net',
          '--pid',
          '--fork',
          '--kill-child=KILL',
          '--mount-proc',
          '--',
          '/usr/local/libexec/puni-registry-authority/bun',
          client.worker.path,
        ],
        {
          env: { PATH: '/usr/bin:/bin', LANG: 'C' },
          stdio: ['pipe', 'pipe', 'pipe', input.descriptor],
          detached: true,
        },
      );
      const interrupted = new AbortController();
      let escalation: ReturnType<typeof setTimeout> | undefined;
      let cancellation:
        Promise<{ state: 'sent' } | { state: 'failed'; cause: unknown }> | undefined;
      const cancel = () => {
        escalation = setTimeout(() => {
          interrupted.abort(input.signal.reason);
        }, 5000);
        cancellation = (async () => {
          await child.stdin.write('cancel\n');
          await child.stdin.flush();
        })().then(
          () => ({ state: 'sent' as const }),
          (cause: unknown) => {
            interrupted.abort(cause);
            return { state: 'failed' as const, cause };
          },
        );
      };
      const receive = async (stream: ReadableStream<Uint8Array>, maximumBytes: number) => {
        try {
          return await readRegistryBytes(stream, maximumBytes, 'Fixed client worker output');
        } catch (cause) {
          interrupted.abort(cause);
          throw cause;
        }
      };
      const send = async () => {
        try {
          await child.stdin.write(
            JSON.stringify(origin) + '\n' + JSON.stringify(input.request) + '\n',
          );
          await child.stdin.flush();
        } catch (cause) {
          interrupted.abort(cause);
          throw cause;
        }
      };
      const finish = async () => {
        input.signal.addEventListener('abort', cancel, { once: true });
        if (input.signal.aborted) cancel();
        const outcomes = await Promise.allSettled([
          awaitMaintenanceChild(child, interrupted.signal),
          receive(child.stdout, 16384),
          receive(child.stderr, 65536),
          send(),
        ]);
        const cancelled = await cancellation;
        const failures: unknown[] = input.signal.aborted ? [input.signal.reason] : [];
        if (cancelled?.state === 'failed') failures.push(cancelled.cause);
        for (const outcome of outcomes)
          if (outcome.status === 'rejected') {
            const cause: unknown = outcome.reason;
            failures.push(cause);
          }
        const distinct = [...new Set(failures)];
        // Proof: concurrent cancel-pipe, child, stdout, stderr and send negatives lose the owner or secondary cause without this aggregation.
        if (distinct.length > 1)
          throw new AggregateError(distinct, 'Client worker completion failed', {
            cause: distinct[0],
          });
        if (distinct.length === 1) throw distinct[0];
        input.signal.throwIfAborted();
        const output = outcomes.at(1);
        if (output?.status !== 'fulfilled' || !(output.value instanceof Uint8Array))
          throw new Error('Missing fixed client worker completion');
        const frame = Frame.assert(
          JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(output.value)),
        );
        if (frame.kind !== 'complete') throw new Error('Fixed client worker did not complete');
        const current = await planRegistryClientPulls(
          journal,
          scratch.allocationUnitBytes,
          input.signal,
        );
        if (JSON.stringify(current) !== JSON.stringify(plan))
          throw new Error('Parent client census changed during verification');
        return JSON.stringify(
          requireRegistryClientCompletion(frame.receipt, {
            plan,
            owner: {
              operationId: input.request.operationId,
              registryId: input.installed.registryId,
              snapshotId: backup.snapshotId,
              scope,
            },
            now: new Date().toISOString(),
          }),
        );
      };
      const receipt = await completeRegistryOperation(finish, async () => {
        input.signal.removeEventListener('abort', cancel);
        if (escalation !== undefined) clearTimeout(escalation);
        await completeRegistryOperation(
          () => child.stdin.end(),
          async () => {
            const deadline = Date.now() + 5000;
            while (!(await inactive(unit))) {
              if (Date.now() >= deadline)
                throw new Error('Client scope teardown is not independently verified');
              await Bun.sleep(25);
            }
          },
        );
      });
      input.signal.throwIfAborted();
      return receipt;
    },
  });
}
