import { type } from 'arktype';

import { dependencyClientRefusal } from '../dependency-client';
import { defineEndpointShape } from './endpoint-shape';
import { responseSchema } from './schema-shape';

/** Fresh compatibility admission is applied by the authenticated typed mount. */
export const gatewayDependencyAdmission = defineEndpointShape({
  method: 'POST',
  path: '/internal/gateway/dependency-admission',
  operationId: 'postInternalGatewayDependencyAdmission',
  // Proof: removing only internal identity made gateway-dependency.db.test.ts:95 fail expected 401 / received 204 with --timeout=10000 (2026-10-23).
  policies: [{ kind: 'identity', require: 'internal' }, { kind: 'organization-control' }],
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    dependencyClientRefusal,
    { status: 401, schema: responseSchema(type({ error: "'unauthorized'" })) },
    { status: 400, schema: responseSchema(type({ error: "'invalid_query' | 'invalid_body'" })) },
  ],
  // Proof: removing only default headers made gateway-dependency.db.test.ts:99 fail expected "no-store" / received null with --timeout=10000 (2026-10-23).
  defaultResponseHeaders: [['cache-control', 'no-store']],
  document: { summary: 'Admit one gateway upgrade against current dependency authority' },
});
