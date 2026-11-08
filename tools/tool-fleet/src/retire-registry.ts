import { registryMaintenanceMain } from './registry-maintenance-cli';

if (import.meta.main) {
  try {
    await registryMaintenanceMain('retirement');
  } catch (cause) {
    console.error(
      cause instanceof Error
        ? cause.message
        : 'Registry retirement failed; inspect durable operation',
    );
    process.exitCode = 1;
  }
}
