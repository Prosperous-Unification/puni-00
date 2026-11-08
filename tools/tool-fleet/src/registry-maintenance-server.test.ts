import { expect, test } from 'bun:test';

import { parseRegistryMaintenanceConfiguration } from './registry-maintenance-server';

const configuration = {
  version: 0.1,
  log: { level: 'error' },
  storage: {
    filesystem: { rootdirectory: '/fixed/registry' },
    delete: { enabled: false },
    maintenance: { readonly: { enabled: true }, uploadpurging: { enabled: false } },
  },
  http: { addr: '127.0.0.1:5051' },
  auth: {
    htpasswd: {
      realm: 'puni-registry-maintenance',
      path: '/run/puni-registry-maintenance/auth.htpasswd',
    },
  },
};
test('isolated server requires exact authenticated loopback, filesystem, readonly and purge configuration', () => {
  expect(
    JSON.stringify(
      parseRegistryMaintenanceConfiguration(configuration, '/fixed/registry', 'readonly'),
    ),
  ).toBe(JSON.stringify(configuration));
});
for (const fault of [
  'path',
  'listener',
  'auth',
  'purger',
  'delete',
  'readonly',
  'middleware',
] as const) {
  test(`isolated server refuses ${fault} override`, () => {
    const changed = structuredClone(configuration);
    if (fault === 'path') changed.storage.filesystem.rootdirectory = '/foreign';
    if (fault === 'listener') changed.http.addr = ':5051';
    if (fault === 'auth') Reflect.deleteProperty(changed, 'auth');
    if (fault === 'purger') changed.storage.maintenance.uploadpurging.enabled = true;
    if (fault === 'delete') changed.storage.delete.enabled = true;
    if (fault === 'readonly') changed.storage.maintenance.readonly.enabled = false;
    if (fault === 'middleware') Object.assign(changed, { middleware: { storage: [] } });
    expect(() =>
      parseRegistryMaintenanceConfiguration(changed, '/fixed/registry', 'readonly'),
    ).toThrow();
  });
}
