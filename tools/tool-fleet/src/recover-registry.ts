import { registryMaintenanceMain } from './registry-maintenance-cli';

if (import.meta.main) {
  try {
    await registryMaintenanceMain('recover');
  } catch (cause) {
    console.error(
      cause instanceof Error
        ? cause.message
        : 'Registry recovery failed; inspect durable operation',
    );
    process.exitCode = 1;
  }
}
