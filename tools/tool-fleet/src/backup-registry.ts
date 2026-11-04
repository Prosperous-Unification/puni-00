import { registryMaintenanceMain } from './registry-maintenance-cli';

if (import.meta.main) {
  try {
    await registryMaintenanceMain('backup');
  } catch (cause) {
    console.error(
      cause instanceof Error ? cause.message : 'Registry backup failed; inspect durable operation',
    );
    process.exitCode = 1;
  }
}
