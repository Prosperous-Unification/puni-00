import { resetBrowserSession } from '@wbs/contracts';

import { bind, EMPTY } from '../http/endpoint';

/**
 * Expires three fixed cookie names without reading their unverified contents.
 * No authentication, provider or lifecycle authority enters this binding.
 * Origin and empty body/query admission belong to the shared shape and adapter.
 */
export function authResetEndpoints() {
  return [
    bind(resetBrowserSession, ({ request }) => {
      // Proof: removing either carrier check independently made mounted
      // `refuses API carriers without clearing browser cookies` answer 204 instead of 400.
      if (request.headers.has('authorization') || request.headers.has('x-wbs-token'))
        return Promise.resolve({
          ok: false,
          status: 400,
          body: { error: 'invalid_client' },
        } as const);
      return Promise.resolve({
        ok: true,
        status: 204,
        body: EMPTY,
        headers: [
          ['set-cookie', '__Host-wbs_access=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'],
          ['set-cookie', '__Host-wbs_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'],
          [
            'set-cookie',
            '__Host-wbs_organization=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
          ],
        ],
      } as const);
    }),
  ] as const;
}
