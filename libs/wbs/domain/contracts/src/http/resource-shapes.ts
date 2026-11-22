import { PERMISSIONS } from '@wbs/domain/access-role';
import { type } from 'arktype';

import { capacityReport, providerKind } from './compute-provider-shapes';
import { directoryTotals } from './directory-totals';
import { defineEndpointShape } from './endpoint-shape';
import { capacityLimitCrossed } from './organization-limits-shapes';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

const readPolicies = [{ kind: 'identity', require: 'signed-in' }] as const;

const catalogResource = {
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
} as const;
const resourceWithDirectory = type({
  ...catalogResource,
  // An outgoing server may omit directoryCapacity or send it without totals.
  'directoryCapacity?': 'number.integer >= 0 | null',
  // Proof: accepting directory here let a clear validate without directoryCapacity.
  'directory?': 'never',
})
  .or(type({ ...catalogResource, directoryCapacity: 'null', directory: 'null' }))
  .or(
    type({
      ...catalogResource,
      directoryCapacity: 'number.integer >= 0',
      directory: directoryTotals,
    }),
  );

/**
 * One work package's resources (`wbs-resources`): the resources the caller's
 * directory holds (the organization's own, under their local names, after
 * activation), the work package's stated capacities, and every demand on its work
 * items. A caller the tree read refuses is refused alike: a viewer reads it, a
 * foreign or absent work package is 404 `not_found`. Each resource with a directory
 * capacity includes the organization's aggregate occupied and free units.
 *
 * Each resource carries the provider instance that fulfils it, or null
 * (`compute-providers` P3); one that names an instance carries its kind and
 * name for every reader, never its locator (task 5.3), its latest
 * capacity report, when there is one, and `measurement`: this work package's
 * declared units beside the measured ones and the report's state (P7).
 * `hostJobs`, present only when there is one, lists the host jobs that instance's
 * resource authority published and has not seen returned (`dash-host-jobs` J10),
 * the names beside a report's `reservedUnits`.
 * None of these is ever a planning input: `capacities` alone is.
 */
export const readWorkPackageResources = defineEndpointShape({
  method: 'GET',
  path: '/api/work-packages/:id/resources',
  operationId: 'getApiWorkPackagesByIdResources',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params: requestSchema(type({ id: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          resources: resourceWithDirectory.array(),
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
    summary: 'List the resources, this work package’s resource capacities, and its demands.',
    // Proof: reverting this resource-summary block failed the connected listTools description assertion.
    description:
      'resources: every resource the caller’s directory holds, with its kind (exclusive: identical units demanded one at a time; divisible: demanded k at a time), unit label, and providerId (the compute provider instance that fulfils it, or null); one with a providerId also carries provider (that instance’s kind and name, never its locator), its latest capacity report, if any, and measurement (declared units of this work package, measured units, measuredAt, and state no_report, measured, unreachable or stale past three report cadences), and hostJobs (the host jobs that instance’s resource authority published and has not seen returned: label, type, host and reservations per dimension, beside the report’s reservedUnits), shown only, never used to plan. capacities: the stated pairs of this work package, in resource-id order; an absent work package capacity constrains nothing only when the resource also has no directory capacity, and a stated 0 means the plan may use none. Each resource carries `directoryCapacity` and `directory`, both null when unstated; otherwise `directory` gives the organization’s capacity, occupied and free units without naming holders. demands: what each work item needs of each resource while any of its steps runs, never inherited down the tree. Write them with postApiDirectoryCommands kinds createResource, patchResource, deleteResource and postApiWorkPackagesByIdCommands kinds setResourceCapacity, setDemand.',
  },
});

/**
 * What stating, lowering or clearing a resource's directory capacity would
 * leave (`wbs-shared-occupancy` S12), for an organization admin or
 * super-admin, writing nothing: the units before and after, each work package the
 * caller may read that uses the resource with the units it holds, the others
 * counted, the free units after the change (below 0 when held units exceed
 * it; null when it would be unstated) and the refusal the write would meet.
 */
export const previewDirectoryCapacity = defineEndpointShape({
  method: 'POST',
  path: '/api/organization/resources/:resourceId/directory-capacity/preview',
  operationId: 'postApiOrganizationResourcesByResourceIdDirectory-capacityPreview',
  // Write scope although it writes nothing: mcp-01 asks write scope of every
  // non-GET tool, and be-01 holds the same line (`server.test.ts`, "marks every
  // non-GET tool of the real document as needing be-01 write scope").
  // Proof: with `signed-in` here, that test failed on this route; watched 2026-11-01.
  policies: [
    { kind: 'origin', when: 'always-unsafe-with-session-cookie' },
    { kind: 'identity', require: 'write-scope' },
    { kind: 'organization-resource', operation: 'read' },
  ],
  params: requestSchema(type({ resourceId: 'string' })),
  body: requestSchema(type({ units: 'number | null' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          resourceId: 'string',
          before: 'number | null',
          after: 'number | null',
          workPackages: type({ workPackageId: 'string', name: 'string', units: 'number' }).array(),
          hiddenWorkPackages: type({ count: 'number', units: 'number' }),
          free: 'number | null',
          refusal: type({ error: "'capacity_limit'", ...capacityLimitCrossed }).or('null'),
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
    // Proof: with only invalid_origin here, `guards every registered user-facing
    // mutation with write scope` (oidc.integration.test.ts) answered 500 for a
    // read-only cookie; watched 2026-11-01.
    {
      status: 403,
      schema: responseSchema(type({ error: "'invalid_origin' | 'insufficient_scope'" })),
    },
    // A member, a viewer or any agent: only an admin previews an organization act.
    {
      status: 403,
      schema: responseSchema(
        type({
          error: "'forbidden'",
          'permission?': type.enumerated(...PERMISSIONS.map(({ id }) => id)),
        }),
      ),
    },
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    organizationRefusal,
    organizationContextRefusal,
  ],
  document: {
    summary: 'Preview a change of a resource’s directory capacity, writing nothing.',
    description:
      'Organization admins and super-admins only; anyone else, and every agent, is refused forbidden. units is a whole number from 0, or null to preview clearing it. Answers before and after, the work packages holding units of it (workPackageId, name, units; those the caller may not read only counted in hiddenWorkPackages), free after the change (below 0 when more is held than would exist; lowering never releases a held unit, new claims are refused until it drains) and refusal: what setDirectoryCapacity would be refused with, or null.',
  },
});

/** The holding claims on an organization resource, for its own organization administrators. */
export const readResourceOccupancy = defineEndpointShape({
  method: 'GET',
  path: '/api/organization/resources/:resourceId/occupancy',
  operationId: 'getApiOrganizationResourcesByResourceIdOccupancy',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params: requestSchema(type({ resourceId: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          resourceId: 'string',
          directoryCapacity: 'number | null',
          occupied: 'number',
          free: 'number | null',
          workPackages: type({
            workPackageId: 'string',
            name: 'string',
            restricted: 'boolean',
            units: 'number',
            claims: type({
              claimId: 'string',
              personId: 'string',
              personName: 'string',
              runId: 'string | null',
              workItemId: 'string',
              claimedAt: 'number',
              leaseExpiresAt: 'number | null',
              releasableBy: "'claimant_or_admin' | 'claimant'",
            }).array(),
          }).array(),
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
    { status: 403, schema: responseSchema(type({ error: "'forbidden'" })) },
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    organizationRefusal,
    organizationContextRefusal,
  ],
  document: {
    summary: 'List the holding claims on an organization resource.',
    description:
      'Organization admins and super-admins acting as themselves only. Each readable holding work package shows its held units and each claim, including its claimant’s organization-local name, run, work item, write instant and nullable lease expiry. releasableBy is claimant_or_admin for unrestricted work packages and claimant for restricted work packages. When directory capacity is stated, occupied and free cover the entire organization, even where work package details are withheld. With no stated directory capacity, free and directoryCapacity are null.',
  },
});
