import type { ProjectAddressApi } from '@/lib/wbs-api';

/** An explicit fixture boundary: unconfigured discovery refuses authentication; endpoint access is never fabricated. */
export function createRefusingAddressApi(): ProjectAddressApi {
  return {
    projects: () =>
      Promise.resolve({
        kind: 'refusal' as const,
        representation: 'json' as const,
        status: 401 as const,
        body: { error: 'unauthenticated' as const },
        headers: new Headers(),
      }),
    candidates: () => Promise.reject(new Error('Unexpected endpoint address search')),
    resolve: () => Promise.reject(new Error('Unexpected address resolution')),
  };
}
