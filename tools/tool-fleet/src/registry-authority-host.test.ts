import { expect, test } from 'bun:test';

import { selectRegistryAuthorityStorage } from './registry-authority-host';
import type { RegistryEnrollment } from './registry-journal';
import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';

const ordinary = {
  path: '/var/lib/puni-registry/registry/contents',
  storageId: 'ordinary',
  maximumBytes: 50,
  identityReceipt: '/fixed/ordinary.receipt',
};
const recovered = {
  path: '/var/lib/puni-registry/recovery/registry/contents',
  storageId: 'recovered',
  maximumBytes: 50,
  identityReceipt: '/fixed/recovered.receipt',
  state: 'enrolled',
};
const installed = {
  registryId: 'owned',
  journalMaximumBytes: 10,
  ordinary,
  recovery: recovered,
} as unknown as RegistryMaintenanceInstallation;
const enrollment = (storage: typeof ordinary) =>
  ({
    registryId: 'owned',
    rootPath: '/',
    journalMaximumBytes: 10,
    registryPath: storage.path,
    storageId: storage.storageId,
    maximumBytes: storage.maximumBytes,
  }) as RegistryEnrollment;
test('shared ordinary authority ports select recovered receipt only from verified canonical enrollment and fixed installation', () => {
  expect(selectRegistryAuthorityStorage(enrollment(ordinary), installed) === ordinary).toBe(true);
  expect(selectRegistryAuthorityStorage(enrollment(recovered), installed).identityReceipt).toBe(
    recovered.identityReceipt,
  );
});
for (const fault of [
  'unenrolled',
  'path',
  'identity',
  'capacity',
  'journal',
  'registry',
] as const) {
  test(`ordinary authority refuses ${fault} rebind identity drift`, () => {
    const configured = structuredClone(installed);
    const current = enrollment(recovered);
    if (fault === 'unenrolled') configured.recovery = { state: 'unenrolled' };
    if (fault === 'path') current.registryPath = '/caller/path';
    if (fault === 'identity') current.storageId = 'stale';
    if (fault === 'capacity') current.maximumBytes++;
    if (fault === 'journal') current.journalMaximumBytes++;
    if (fault === 'registry') current.registryId = 'foreign';
    expect(() => selectRegistryAuthorityStorage(current, configured)).toThrow();
  });
}
