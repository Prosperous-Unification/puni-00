import { type } from 'arktype';

import { requiresDependencyOperation } from './dependency-claim';
import type { EndpointShape } from './http/endpoint-shape';
import type { Refusal } from './http/refusal';
import { responseSchema } from './http/schema-shape';

export {
  DEPENDENCY_SEMANTICS,
  DEPENDENCY_SEMANTICS_HEADER,
  DEPENDENCY_WEBSOCKET_PROTOCOL,
} from './dependency-claim';

/** Exact admission refusal, excluding the general transport's optimizer retry variants. */
export type DependencyClientRefusal = Extract<
  Refusal<'client_dependency_incompatible'>,
  { error: 'client_dependency_incompatible' }
>;

/** Shape-bound resource admission uses the shared operation classification. */
export function requiresDependencyClient(shape: EndpointShape): boolean {
  return requiresDependencyOperation(shape.operationId);
}

/** Shared transport refusal; a claim alone never grants binary support. */
export const dependencyClientRefusal = {
  status: 409,
  schema: responseSchema(
    type({
      error: "'client_dependency_incompatible'",
      required: "'cross-project-dependencies-v1'",
    }),
  ),
} as const;
