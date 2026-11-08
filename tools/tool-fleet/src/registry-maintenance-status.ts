import { registryMaintenanceMain } from './registry-maintenance-cli';

if (import.meta.main) {
  try {
    await registryMaintenanceMain('status');
  } catch (cause) {
    console.error(
      cause instanceof Error ? cause.message : 'Registry maintenance status is unavailable',
    );
    process.exitCode = 1;
  }
}
