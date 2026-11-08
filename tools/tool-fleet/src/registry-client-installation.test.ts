import { expect, test } from 'bun:test';

import { RegistryClientInstallation } from './registry-maintenance-installation';
const artifact = (path: string) => ({ path, sha256: 'a'.repeat(64) });
const profile = () => ({
  state: 'enrolled',
  worker: artifact('/usr/local/libexec/puni-registry-maintenance/client-worker.js'),
  scope: artifact('/usr/bin/systemd-run'),
  control: artifact('/usr/bin/systemctl'),
  mount: artifact('/usr/bin/mount'),
  ip: artifact('/usr/bin/ip'),
  scratch: {
    path: '/var/lib/puni-registry/pulls/contents',
    receiptPath: '/var/lib/puni-registry/journal/identities/pulls.receipt',
    storageId: '11111111-1111-4111-8111-111111111111',
    maximumBytes: 1024 ** 3,
    maximumInodes: 10000,
  },
});
test('client installation admits only an explicit fixed worker profile', () => {
  const enrolled = profile();
  expect(RegistryClientInstallation.assert(enrolled).state).toBe('enrolled');
  expect(RegistryClientInstallation.assert({ state: 'unenrolled' })).toEqual({
    state: 'unenrolled',
  });
});
for (const name of ['worker', 'scope', 'control', 'mount', 'ip'] as const)
  test('client installation refuses alternate ' + name + ' path', () => {
    const input = profile();
    input[name].path = '/tmp/other';
    expect(() => RegistryClientInstallation.assert(input)).toThrow();
  });
for (const name of ['path', 'receiptPath'] as const)
  test('client installation refuses alternate scratch ' + name, () => {
    const input = profile();
    input.scratch[name] = '/tmp/other';
    expect(() => RegistryClientInstallation.assert(input)).toThrow();
  });
test('client installation refuses request commands and an unbounded cache', () => {
  expect(() => RegistryClientInstallation.assert({ ...profile(), argv: ['sh'] })).toThrow();
  const input = profile();
  input.scratch.maximumBytes = 0;
  expect(() => RegistryClientInstallation.assert(input)).toThrow();
});
