import { executeRegistryHostAction } from './registry-maintenance-actions';
import { acceptMaintenanceChannel } from './registry-maintenance-channel';
import {
  RegistryMaintenanceCancellation,
  superviseRegistryMaintenance,
} from './registry-maintenance-control';
import { RegistryMaintenanceRefusal } from './registry-maintenance-failure';
import { readRegistryMaintenanceInstallation } from './registry-maintenance-installation';
import { installMaintenanceReaper } from './registry-maintenance-process';

/** No-argument root entrypoint installed behind the fixed sudo wrapper; authority tokens arrive only after the direct socket and current root sender are authenticated. */
async function main(): Promise<void> {
  if (process.argv.length !== 2 || process.getuid?.() !== 0 || process.getgid?.() !== 0)
    throw new Error('Maintenance host helper requires its fixed root installation');
  const installed = await readRegistryMaintenanceInstallation();
  installMaintenanceReaper();
  const channel = await acceptMaintenanceChannel(installed.journalPath, 59001);
  const frame = channel.frame;
  try {
    const receipt = await superviseRegistryMaintenance({
      directory: installed.journalPath,
      uid: 59001,
      descriptor: channel.descriptor,
      input: channel.input,
      deadlineMs: 3600000,
      execute: (request, signal, journal) =>
        executeRegistryHostAction({
          installed,
          request,
          signal,
          journal,
          descriptor: channel.descriptor,
          ready: (receipt) => frame('ready', receipt),
        }),
    });
    await frame('complete', receipt);
  } catch (cause) {
    if (!(cause instanceof RegistryMaintenanceCancellation)) {
      await frame(
        'failed',
        cause instanceof RegistryMaintenanceRefusal ? cause.code : 'effect-failed',
      );
      throw cause;
    }
    // The action returned only after its exact owned child groups and ephemeral credentials were cleaned.
    await frame('cancelled', 'owned-effects-terminated');
  } finally {
    channel.close();
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch {
    // Journal/control credentials and Kubernetes/provider diagnostics never enter logs.
    console.error('Registry maintenance host action failed; recovery required');
    process.exitCode = 1;
  }
}
