import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

const readPolicies = [{ kind: 'identity', require: 'signed-in' }] as const;

/**
 * One project's resources (`wbs-resources`): the resources the caller's
 * directory holds (the organization's own, under their local names, after
 * activation), the project's stated capacities, and every demand on its work
 * items. A caller the tree read refuses is refused alike: a viewer reads it, a
 * foreign or absent project is 404 `not_found`.
 */
export const readProjectResources = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/resources',
  operationId: 'getApiProjectsByIdResources',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params: requestSchema(type({ id: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          resources: type({
            id: 'string',
            name: 'string',
            kind: "'exclusive' | 'divisible'",
            unitLabel: 'string',
          }).array(),
          capacities: type({ resourceId: 'string', units: 'number' }).array(),
          demands: type({ workItemId: 'string', resourceId: 'string', units: 'number' }).array(),
        }),
      ),
    },
  ],
  refusals: [
    {
      status: 400,
      schema: responseSchema(
        type({ error: "'invalid_params' | 'invalid_query' | 'invalid_body' | 'invalid_json'" }),
      ),
    },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    organizationRefusal,
    organizationContextRefusal,
  ],
  document: {
    summary: 'List the resources, this project’s resource capacities, and its demands.',
    description:
      'resources: every resource the caller’s directory holds, with its kind (exclusive: identical units demanded one at a time; divisible: demanded k at a time) and unit label. capacities: the stated pairs of this project, in resource-id order; a resource absent here is unstated and constrains nothing, and a stated 0 means the plan may use none. demands: what each work item needs of each resource while any of its steps runs, never inherited down the tree. Write them with postApiDirectoryCommands kinds createResource, patchResource, deleteResource and postApiProjectsByIdCommands kinds setResourceCapacity, setDemand.',
  },
});
