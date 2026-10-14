import { renderHook } from '@testing-library/react';
import { listTeams } from '@wbs/contracts';
import { afterEach, expect, it, vi } from 'vitest';

import {
  OrganizationResourcesProvider,
  useResourceClient,
  useResourceScope,
} from './organization-resources';

afterEach(() => vi.unstubAllGlobals());
it('refuses resource panels without an owning runtime provider', () => {
  expect(() => renderHook(useResourceScope)).toThrow(
    'Organization resources require their runtime provider',
  );
});
it('every panel client carries its owning runtime expectation', async () => {
  const headers: (string | null)[] = [];
  vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
    headers.push(new Headers(init.headers).get('X-WBS-Expected-Organization'));
    return Promise.resolve(Response.json({ teams: [] }));
  });
  const { result } = renderHook(() => useResourceClient([listTeams]), {
    wrapper: ({ children }) => (
      <OrganizationResourcesProvider
        scope={{
          organization: { kind: 'active', organizationId: 'org-a' },
          isCurrent: () => true,
          refuse: () => undefined,
        }}
      >
        {children}
      </OrganizationResourcesProvider>
    ),
  });
  await result.current.getApiTeams({});
  expect(headers).toEqual(['org-a']);
});
