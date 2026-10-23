import { type } from 'arktype';

import { dependencyClientRefusal } from '../dependency-client';
import { defineEndpointShape } from './endpoint-shape';
import { responseSchema } from './schema-shape';

/** Fresh compatibility admission is applied by the authenticated typed mount. */
export const gatewayDependencyAdmission = defineEndpointShape({
  method: 'POST',
  path: '/internal/gateway/dependency-admission',
  operationId: 'postInternalGatewayDependencyAdmission',
  // Proof: removing internal identity returned204 for a wrong secret in gateway-dependency.db.test.ts.
  policies: [{ kind: 'identity', require: 'internal' }, { kind: 'organization-control' }],
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    dependencyClientRefusal,
    { status: 401, schema: responseSchema(type({ error: "'unauthorized'" })) },
    { status: 400, schema: responseSchema(type({ error: "'invalid_query' | 'invalid_body'" })) },
  ],
  // Proof: removing no-store returned a null cache-control header in gateway-dependency.db.test.ts.
  defaultResponseHeaders: [['cache-control', 'no-store']],
  document: { summary: 'Admit one gateway upgrade against current dependency authority' },
});
