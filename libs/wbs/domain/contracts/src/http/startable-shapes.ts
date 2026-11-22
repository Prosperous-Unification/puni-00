import { type } from 'arktype';

import { directoryTotals } from './directory-totals';
import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';
import { hiddenHolderUnits, occupancyHolder } from './work-item-shapes';

const readPolicies = [{ kind: 'identity', require: 'signed-in' }] as const;
const person = type({ personId: 'string', name: 'string' });
const address = {
  workItemId: 'string',
  number: 'string',
  numberIsFrozen: 'boolean',
  name: 'string',
} as const;
const leafSteps = {
  ...address,
  stepIds: 'string[]',
  assignees: type({ stepId: 'string', personId: 'string', name: 'string' }).array(),
  teams: type({ teamId: 'string', name: 'string', fromId: 'string' }).array(),
  unfinishedPredecessorIds: 'string[]',
  subtreeClaim: type({
    claimId: 'string',
    workItemId: 'string',
    holder: person,
    runId: 'string | null',
    parentClaimId: 'string | null',
  }).or('null'),
} as const;
// `fits`, `doesNotFit`, `resources` and `occupancyScope` (`wbs-resources` R6)
// are optional on the wire although this release always sends them: mid-swap a
// new fe-01 or MCP client is answered by an outgoing be-01 that knows no fit.
// be-01's own answer is held to them by startable-organization.controller.db.test.ts.
const prerequisite = type({
  workItemId: 'string',
  stepId: 'string | null',
  type: "'FS' | 'SS' | 'FF'",
  provenance: "'workflow' | 'legacy' | 'authored'",
  relationshipId: 'string | null',
});
const stepPrerequisites = type({
  workItemId: 'string',
  stepId: 'string',
  started: 'boolean',
  canStart: 'boolean',
  canFinish: 'boolean',
  startBlockers: prerequisite.array(),
  finishBlockers: prerequisite.array(),
});
const startableLeaf = type({ ...leafSteps, 'fits?': 'true' });
const shortfall = {
  resourceId: 'string',
  name: 'string',
  unitLabel: 'string',
  asked: 'number',
  free: 'number',
  shortfall: 'number',
} as const;
const exhaustion = type({
  ...shortfall,
  'scope?': "'work_package' | 'organization'",
  // A previous release sends neither. Explicit optional-never fields maintain
  // this branch under the response validator's additive-field compatibility.
  // Proof: without these optional-never keys, the compatibility case accepted half a pair.
  'holders?': 'never',
  'hiddenHolders?': 'never',
}).or(
  type({
    ...shortfall,
    scope: "'work_package' | 'organization'",
    holders: occupancyHolder.array(),
    hiddenHolders: hiddenHolderUnits,
  }),
);
const unfitLeaf = type({
  ...leafSteps,
  fits: 'false',
  exhausted: exhaustion,
});
const resourceFreeFields = {
  resourceId: 'string',
  name: 'string',
  unitLabel: 'string',
  kind: "'exclusive' | 'divisible'",
  capacity: 'number',
  occupied: 'number',
  free: 'number',
} as const;
const resourceFree = type({
  ...resourceFreeFields,
  // Proof: removing these optional-never fields let a partial pair validate.
  'occupancyScope?': 'never',
  'directory?': 'never',
})
  .or(type({ ...resourceFreeFields, occupancyScope: "'work_package'", directory: 'null' }))
  .or(
    type({ ...resourceFreeFields, occupancyScope: "'organization'", directory: directoryTotals }),
  );
const claimedStep = type({
  ...address,
  stepId: 'string',
  claimId: 'string',
  holder: person,
  assignee: person.or('null'),
  runId: 'string | null',
  parentClaimId: 'string | null',
  claimedAt: 'number',
  leaseExpiresAt: 'number | null',
});
const heldSubtree = type({
  ...address,
  claimId: 'string',
  holder: person,
  runId: 'string | null',
  parentClaimId: 'string | null',
  claimedAt: 'number',
  leaseExpiresAt: 'number | null',
});

/**
 * The **Startable** steps of a work package, grouped by leaf in tree order, and apart
 * the claimed steps of the same leaves, each with its assignee, and every
 * subtree claim of the work package (`wbs-team-claims`, spec `startable-work`).
 * With `wbs-resources` R6 a leaf's steps are in `leaves` only when its demand
 * fits within the applicable work package and directory capacities; otherwise in
 * `doesNotFit` with the first exhausted resource and its shortfall. The
 * resource summary includes work package capacities and shared resources demanded
 * by its leaves, with the scope and totals of each.
 * `team` narrows the first two to one team's allotment. A caller
 * the tree read refuses is refused alike: an organization's viewer reads it,
 * a foreign or absent work package is 404 `not_found`.
 */
export const readStartableWork = defineEndpointShape({
  method: 'GET',
  path: '/api/work-packages/:id/startable',
  operationId: 'getApiWorkPackagesByIdStartable',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params: requestSchema(type({ id: 'string' })),
  query: requestSchema(type({ 'team?': 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          'prerequisites?': stepPrerequisites.array(),
          leaves: startableLeaf.array(),
          'doesNotFit?': unfitLeaf.array(),
          claimed: claimedStep.array(),
          subtreeClaims: heldSubtree.array(),
          'resources?': resourceFree.array(),
          'occupancyScope?': "'work_package'",
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
    { status: 404, schema: responseSchema(type({ error: "'unknown_team'" })) },
    organizationRefusal,
    organizationContextRefusal,
  ],
  document: {
    summary: 'List the steps a team may claim now, and the steps already claimed.',
    // Proof: reverting this resource-summary block failed the connected listTools description assertion.
    description:
      'Startable: the leaf is not blocked, on hold, blocked by proxy or done, the step is not done, and no claim holds it. Each leaf carries its id, its frozen number (numberIsFrozen) or else its derived one, the startable step ids with their assignees, the teams in force and the row that states them, unfinished predecessor leaves, and the nearest subtree claim above it. `claimed` lists the claimed steps of the same leaves with holder, assignee, run, parent claim, write instant and lease expiry (null for a claim no agent renews); `subtreeClaims` lists every subtree claim of the work package with its holder, write instant and lease expiry. A leaf is listed under `leaves` only when its resource demand fits now, exactly as a claim would decide: within the work package’s stated capacities, and, for a resource with a directory capacity (the units that exist for the whole organization, set by setDirectoryCapacity), within what every work package of the organization holds too; otherwise under `doesNotFit` with `exhausted` naming the resource, the units asked and free, the shortfall, and, for a resource with a directory capacity, `scope` (`work_package` or `organization`: which count bound it). `resources` lists every capacity stated by this work package and every resource with a directory capacity that a leaf of this work package demands. Each entry’s `occupied` counts this work package’s leaves; its `capacity` is the work package capacity when stated or the directory capacity otherwise. For a shared resource, entry `occupancyScope` is `organization`, `directory` gives organization-wide capacity, occupied and free units, and `free` is directory free limited by work package free when the work package states a capacity. For a resource limited to the work package, entry `occupancyScope` is `work_package`, `directory` is null and `free` is work package free. Top-level `occupancyScope` stays `work_package`. Give `team` (a team id from getApiTeams) for one team’s allotment; address work items by id, then claim with postApiWorkPackagesByIdCommands kind claimWorkItem.',
  },
});
