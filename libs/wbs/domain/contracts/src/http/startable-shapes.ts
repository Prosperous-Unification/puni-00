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
const startableLeaf = type({
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
          leaves: startableLeaf.array(),
          claimed: claimedStep.array(),
          subtreeClaims: heldSubtree.array(),
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
      'Startable: the leaf is not blocked, on hold, blocked by proxy or done, the step is not done, and no claim holds it. Each leaf carries its id, its frozen number (numberIsFrozen) or else its derived one, the startable step ids with their assignees, the teams in force and the row that states them, unfinished predecessor leaves, and the nearest subtree claim above it. `claimed` lists the claimed steps of the same leaves with holder, assignee, run, parent claim and write instant; `subtreeClaims` lists every subtree claim of the project with its holder and write instant. Give `team` (a team id from getApiTeams) for one team’s allotment; address work items by id, then claim with postApiProjectsByIdCommands kind claimWorkItem.',
  },
});
