import { registryMaintenanceMain } from './registry-maintenance-cli';

if (import.meta.main) {
  try {
    await registryMaintenanceMain('activate');
  } catch (cause) {
    console.error(
      cause instanceof Error
        ? cause.message
        : 'Registry activation failed; inspect durable operation',
    );
    process.exitCode = 1;
  }
}
