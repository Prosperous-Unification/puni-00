import type { WorkPackageAddressApi } from '@/lib/wbs-api';

/** An explicit fixture boundary: unconfigured discovery refuses authentication; endpoint access is never fabricated. */
export function createRefusingAddressApi(): WorkPackageAddressApi {
  return {
    workPackages: () =>
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
