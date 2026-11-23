import { expect, it, vi } from 'vitest';

import type { ResourceScope } from '@/lib/organization-context';
import type { WorkPackageAddressApi } from '@/lib/wbs-api';
import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
import { fakeWorkPackageApi } from '@/testing/fake-work-package-api';
import { SILENT_STREAM } from '@/testing/silent-stream';

import { type Credential, credentialOf } from './credential';
import { createSessionOwner } from './session-runtime';

it('opens address lookup with the session credential/scope and retires it on organization replacement', async () => {
  const workPackageClientFor = vi.fn((_credential: Credential, _scope?: ResourceScope) =>
    fakeWorkPackageApi(),
  );
  const scopes: (ResourceScope | undefined)[] = [];
  const ports: WorkPackageAddressApi[] = [];
  const addressClientFor = vi.fn(
    (_credential: Credential, scope?: ResourceScope): WorkPackageAddressApi => {
      scopes.push(scope);
      const port: WorkPackageAddressApi = {
        workPackages: vi.fn().mockResolvedValue({
          kind: 'success',
          representation: 'json',
          status: 200,
          headers: new Headers(),
          body: { workPackages: [], nextCursor: null },
        }),
        candidates: vi.fn(),
        resolve: vi.fn(),
      };
      ports.push(port);
      return port;
    },
  );
  const owner = createSessionOwner({
    clientFor: fakeDirectoryApi,
    workPackageClientFor,
    addressClientFor,
    streamDeps: SILENT_STREAM,
  });
  const credential = credentialOf('secret');
  await owner.open({
    userId: 'u1',
    credential,
    organization: { kind: 'active', organizationId: 'org-a' },
  });
  const first = owner.snapshot();
  if (first.status !== 'live') throw new Error('Missing first session');
  await first.services.workPackages.open('p1');
  const opened = first.services.workPackages.snapshot();
  if (opened.status !== 'live') throw new Error('Missing first work package');
  expect(ports[0]?.workPackages).not.toHaveBeenCalled();
  await opened.services.dependencyLookup.discoverWorkPackages('PUNI', null);
  await owner.open({
    userId: 'u1',
    credential,
    organization: { kind: 'active', organizationId: 'org-b' },
  });
  expect(await opened.services.dependencyLookup.discoverWorkPackages('PUNI', null)).toEqual({
    kind: 'cancelled',
  });
  expect(ports[0]?.workPackages).toHaveBeenCalledTimes(1);
  expect(addressClientFor.mock.calls.map((call) => call[0])).toEqual([credential, credential]);
  expect(scopes.map((scope) => scope?.organization)).toEqual([
    { kind: 'active', organizationId: 'org-a' },
    { kind: 'active', organizationId: 'org-b' },
  ]);
  expect(scopes[0]).toBe(workPackageClientFor.mock.calls[0]?.[1]);
  expect(scopes[1]).toBe(workPackageClientFor.mock.calls[1]?.[1]);
  await owner.leave();
});
