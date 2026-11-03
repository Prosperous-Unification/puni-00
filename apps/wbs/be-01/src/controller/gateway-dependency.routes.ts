import { gatewayDependencyAdmission } from '@wbs/contracts';

import { bind, EMPTY } from '../http/endpoint';

/** No receipt or project observations escape this one-request admission boundary. */
export function gatewayDependencyRoutes() {
  return [
    bind(gatewayDependencyAdmission, () => Promise.resolve({ ok: true, status: 204, body: EMPTY })),
  ] as const;
}
