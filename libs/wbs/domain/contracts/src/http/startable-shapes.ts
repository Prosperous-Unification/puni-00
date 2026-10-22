import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

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
const unfitLeaf = type({
  ...leafSteps,
  fits: 'false',
  exhausted: type({
    resourceId: 'string',
    name: 'string',
    unitLabel: 'string',
    asked: 'number',
    free: 'number',
    shortfall: 'number',
  }),
});
const resourceFree = type({
  resourceId: 'string',
  name: 'string',
  unitLabel: 'string',
  kind: "'exclusive' | 'divisible'",
  capacity: 'number',
  occupied: 'number',
  free: 'number',
});
const claimedStep = type({
  ...address,
  stepId: 'string',
  claimId: 'string',
  holder: person,
  assignee: person.or('null'),
  runId: 'string | null',
  parentClaimId: 'string | null',
  claimedAt: 'number',
});
const heldSubtree = type({
  ...address,
  claimId: 'string',
  holder: person,
  runId: 'string | null',
  parentClaimId: 'string | null',
  claimedAt: 'number',
});

/**
 * The **Startable** steps of a project, grouped by leaf in tree order, and apart
 * the claimed steps of the same leaves, each with its assignee, and every
 * subtree claim of the project (`wbs-team-claims`, spec `startable-work`).
 * With `wbs-resources` R6 a leaf's steps are in `leaves` only when its demand
 * fits the project's free units now; otherwise in `doesNotFit` with the first
 * exhausted resource and its shortfall. `resources` lists every stated
 * capacity with its occupied and free units; an unstated capacity is not
 * listed and excludes nothing. Occupancy is counted within the project only.
 * `team` narrows the first two to one team's allotment. A caller
 * the tree read refuses is refused alike: an organization's viewer reads it,
 * a foreign or absent project is 404 `not_found`.
 */
export const readStartableWork = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/startable',
  operationId: 'getApiProjectsByIdStartable',
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
          'occupancyScope?': "'project'",
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
    description:
      'Startable: the leaf is not blocked, on hold, blocked by proxy or done, the step is not done, and no claim holds it. Each leaf carries its id, its frozen number (numberIsFrozen) or else its derived one, the startable step ids with their assignees, the teams in force and the row that states them, unfinished predecessor leaves, and the nearest subtree claim above it. `claimed` lists the claimed steps of the same leaves with holder, assignee, run, parent claim and write instant; `subtreeClaims` lists every subtree claim of the project with its holder and write instant. A leaf is listed under `leaves` only when its resource demand fits the project’s free units now; otherwise under `doesNotFit` with `exhausted` naming the resource, the units asked and free, and the shortfall. `resources` lists each resource the project states a capacity for with capacity, occupied and free units; an unstated capacity is not listed and constrains nothing. Occupancy is counted within this project only (`occupancyScope: project`): claims in other projects on the same host are not subtracted. Give `team` (a team id from getApiTeams) for one team’s allotment; address work items by id, then claim with postApiProjectsByIdCommands kind claimWorkItem.',
  },
});
