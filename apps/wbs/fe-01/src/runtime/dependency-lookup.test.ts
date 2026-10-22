import { expect, it, vi } from 'vitest';

import type { ResourceScope } from '@/lib/organization-context';
import type { ProjectAddressApi } from '@/lib/wbs-api';
import { fakeDirectoryApi } from '@/modules/directory/fake-directory-api';
import { fakeProjectApi } from '@/testing/fake-project-api';
import { SILENT_STREAM } from '@/testing/silent-stream';

import { type Credential, credentialOf } from './credential';
import { createSessionOwner } from './session-runtime';

it('opens address lookup with the session credential/scope and retires it on organization replacement', async () => {
  const projectClientFor = vi.fn((_credential: Credential, _scope?: ResourceScope) =>
    fakeProjectApi(),
  );
  const scopes: (ResourceScope | undefined)[] = [];
  const ports: ProjectAddressApi[] = [];
  const addressClientFor = vi.fn(
    (_credential: Credential, scope?: ResourceScope): ProjectAddressApi => {
      scopes.push(scope);
      const port: ProjectAddressApi = {
        projects: vi.fn().mockResolvedValue({
          kind: 'success',
          representation: 'json',
          status: 200,
          headers: new Headers(),
          body: { projects: [], nextCursor: null },
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
    projectClientFor,
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
  await first.services.projects.open('p1');
  const opened = first.services.projects.snapshot();
  if (opened.status !== 'live') throw new Error('Missing first project');
  expect(ports[0]?.projects).not.toHaveBeenCalled();
  await opened.services.dependencyLookup.discoverProjects('PUNI', null);
  await owner.open({
    userId: 'u1',
    credential,
    organization: { kind: 'active', organizationId: 'org-b' },
  });
  expect(await opened.services.dependencyLookup.discoverProjects('PUNI', null)).toEqual({
    kind: 'cancelled',
  });
  expect(ports[0]?.projects).toHaveBeenCalledTimes(1);
  expect(addressClientFor.mock.calls.map((call) => call[0])).toEqual([credential, credential]);
  expect(scopes.map((scope) => scope?.organization)).toEqual([
    { kind: 'active', organizationId: 'org-a' },
    { kind: 'active', organizationId: 'org-b' },
  ]);
  expect(scopes[0]).toBe(projectClientFor.mock.calls[0]?.[1]);
  expect(scopes[1]).toBe(projectClientFor.mock.calls[1]?.[1]);
  await owner.leave();
});
