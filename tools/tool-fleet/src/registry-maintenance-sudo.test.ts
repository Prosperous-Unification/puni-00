import * as crypto from 'node:crypto';
import * as filesystem from 'node:fs/promises';

import { expect, spyOn, test } from 'bun:test';

import { invokeRegistryCallback } from './registry-callback';
import { verifyRegistryMaintenanceSudo } from './registry-maintenance-sudo';
import { requireRejection } from './registry-rejection.fixture';
// Root metadata/hash ports are modeled here; actual sudo/FD3 behavior belongs to the namespace drill.
for (const fault of [
  'none',
  'missing',
  'unreadable',
  'alias',
  'uid',
  'gid',
  'links',
  'mode',
  'kind',
  'size',
  'hash',
] as const) {
  test(`fixed sudo artifact ${fault === 'none' ? 'accepts reviewed identity' : `refuses ${fault}`}`, async () => {
    let closed = 0;
    const canonical = spyOn(filesystem, 'realpath').mockImplementation(((path: string) =>
      invokeRegistryCallback(() => {
        expect(path).toBe('/usr/bin/sudo.ws');
        if (fault === 'missing')
          throw Object.assign(new Error('missing executable'), { code: 'ENOENT' });
        return fault === 'alias' ? '/untrusted/sudo' : '/usr/bin/sudo.ws';
      })) as never);
    const opened = spyOn(filesystem, 'open').mockImplementation(() =>
      invokeRegistryCallback(() => {
        if (fault === 'unreadable')
          throw Object.assign(new Error('unreadable executable'), { code: 'EACCES' });
        return {
          stat: () =>
            invokeRegistryCallback(() => ({
              isFile: () => fault !== 'kind',
              uid: fault === 'uid' ? 59001 : 0,
              gid: fault === 'gid' ? 59001 : 0,
              nlink: fault === 'links' ? 2 : 1,
              mode: fault === 'mode' ? 0o755 : 0o104755,
              size: fault === 'size' ? 17 * 1024 ** 2 : 128,
            })),
          readFile: () => invokeRegistryCallback(() => Buffer.from('fixture binary')),
          close: () =>
            invokeRegistryCallback(() => {
              closed++;
            }),
        } as never;
      }),
    );
    const hashed = spyOn(crypto, 'createHash').mockReturnValue({
      update() {
        return this;
      },
      digest: () =>
        fault === 'hash'
          ? 'a'.repeat(64)
          : 'e53ac5247a956620a066ae8fcf5393138695fac109efb3ea15b6ae97e6d32442',
    } as never);
    try {
      if (fault === 'none') await verifyRegistryMaintenanceSudo();
      else expect((await requireRejection(verifyRegistryMaintenanceSudo())).throwCause).toThrow();
      expect(closed).toBe(['missing', 'unreadable', 'alias'].includes(fault) ? 0 : 1);
    } finally {
      hashed.mockRestore();
      opened.mockRestore();
      canonical.mockRestore();
    }
  });
}
