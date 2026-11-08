import { invokeRegistryCallback } from './registry-callback';
import type { RegistryBackupAdmissionPort } from './registry-maintenance-backup';
import { RegistryMaintenanceRefusal } from './registry-maintenance-failure';
/** Task9 supplies provider physical accounting/retention admission here. A staged Task8 installation cannot create snapshots until that required authority adapter is implemented and verified. */
export const admitRegistryBackup: RegistryBackupAdmissionPort = () =>
  invokeRegistryCallback(() => {
    throw new RegistryMaintenanceRefusal('backup-budget-unavailable');
  });
