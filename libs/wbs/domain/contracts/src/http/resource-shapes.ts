import { type } from 'arktype';

import { capacityReport, providerKind } from './compute-provider-shapes';
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
 *
 * Each resource carries the provider instance that fulfils it, or null
 * (`compute-providers` P3); one that names an instance carries its kind and
 * name for every reader, never its locator (task 5.3), its latest
 * capacity report, when there is one, and `measurement`: this project's
 * declared units beside the measured ones and the report's state (P7).
 * `hostJobs`, present only when there is one, lists the host jobs that instance's
 * resource authority published and has not seen returned (`dash-host-jobs` J10),
 * the names beside a report's `reservedUnits`.
 * None of these is ever a planning input: `capacities` alone is.
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
            providerId: 'string | null',
            'provider?': type({ kind: providerKind, name: 'string' }),
            'report?': capacityReport,
            'measurement?': type({
              declared: 'number | null',
              measured: 'number | null',
              measuredAt: 'number | null',
              state: "'no_report' | 'measured' | 'unreachable' | 'stale'",
            }),
            'hostJobs?': type({
              useId: 'string',
              label: 'string',
              type: 'string',
              host: 'string',
              reservations: type({ dimension: 'string', units: 'number' }).array(),
            }).array(),
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
      'resources: every resource the caller’s directory holds, with its kind (exclusive: identical units demanded one at a time; divisible: demanded k at a time), unit label, and providerId (the compute provider instance that fulfils it, or null); one with a providerId also carries provider (that instance’s kind and name, never its locator), its latest capacity report, if any, and measurement (declared units of this project, measured units, measuredAt, and state no_report, measured, unreachable or stale past three report cadences), and hostJobs (the host jobs that instance’s resource authority published and has not seen returned: label, type, host and reservations per dimension, beside the report’s reservedUnits), shown only, never used to plan. capacities: the stated pairs of this project, in resource-id order; a resource absent here is unstated and constrains nothing, and a stated 0 means the plan may use none. demands: what each work item needs of each resource while any of its steps runs, never inherited down the tree. Write them with postApiDirectoryCommands kinds createResource, patchResource, deleteResource and postApiProjectsByIdCommands kinds setResourceCapacity, setDemand.',
  },
});
