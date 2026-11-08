import type { RegistryClientCompletion } from './registry-client-completion';
import { assertRegistryClientContext } from './registry-client-context';
import { readRegistryClientInput } from './registry-client-input';
import { requireRegistryClientRecovery } from './registry-client-lineage';
import { prepareRegistryClientNamespace } from './registry-client-namespace';
import { verifyRegistryClientImages } from './registry-client-verification';
import {
  RegistryMaintenanceCancellation,
  superviseRegistryMaintenance,
} from './registry-maintenance-control';
import {
  readRegistryMaintenanceInstallation,
  requireRegistryClientInstallation,
} from './registry-maintenance-installation';
import { installMaintenanceReaper } from './registry-maintenance-process';
import { completeRegistryOperation } from './registry-operation-completion';

/**
 * Fixed no-argument internal root PID1 worker. The launcher creates private mount/net/PID
 * namespaces with fresh procfs and a bounded scope before execution, and passes the same FD3.
 * The sole owned input pipe carries the root parent's namespace origin and the existing strict
 * authority request/cancellation protocol. Bootstrap precedes actual pulls; teardown proof and
 * authentication of this terminal frame remain obligations of the outside root launcher.
 */
export async function runRegistryClientWorkerMain(): Promise<RegistryClientCompletion> {
  await assertRegistryClientContext(new AbortController().signal);
  if (process.argv.length !== 2)
    throw new Error('Client worker requires its fixed no-argument installation');
  const installed = await readRegistryMaintenanceInstallation();
  const client = requireRegistryClientInstallation(installed);
  installMaintenanceReaper();
  const channel = await readRegistryClientInput(Bun.stdin.stream());
  const interrupted = new AbortController();
  const interrupt = () => {
    interrupted.abort(new Error('Fixed client worker interrupted'));
  };
  process.on('SIGINT', interrupt);
  return completeRegistryOperation(
    () =>
      superviseRegistryMaintenance({
        directory: installed.journalPath,
        uid: 59001,
        descriptor: 3,
        input: channel.input,
        deadlineMs: 3600000,
        interrupt: interrupted.signal,
        execute: async (request, signal, journal) => {
          if (request.action !== 'verify-images' && request.action !== 'verify-recovery-images')
            throw new Error('Unsupported fixed client action');
          const scope = request.action === 'verify-recovery-images' ? 'recovery' : 'current';
          if (scope === 'recovery') requireRegistryClientRecovery(journal, installed);
          await prepareRegistryClientNamespace({ origin: channel.origin, client }, signal);
          return verifyRegistryClientImages(
            { installed, journal, scope, descriptor: 3, scratch: client.scratch },
            signal,
          );
        },
      }),
    async () => {
      process.off('SIGINT', interrupt);
      await channel.close();
    },
  );
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify({ kind: 'complete', receipt: await runRegistryClientWorkerMain() }));
  } catch (cause) {
    if (cause instanceof RegistryMaintenanceCancellation) {
      console.log(JSON.stringify({ kind: 'cancelled', receipt: 'owned-effects-terminated' }));
    } else {
      console.log(JSON.stringify({ kind: 'failed', code: 'effect-failed' }));
      process.exitCode = 1;
    }
  }
}
