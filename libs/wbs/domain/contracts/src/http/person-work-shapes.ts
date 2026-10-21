import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

const readPolicies = [{ kind: 'identity', require: 'signed-in' }] as const;
const address = {
  workItemId: 'string',
  number: 'string',
  numberIsFrozen: 'boolean',
  name: 'string',
} as const;

/**
 * One person's **Assignment**s and **Claim**s in one project, apart
 * (`wbs-resources` R7, spec `assignee-management`). A caller the tree read
 * refuses is refused alike: an organization's viewer reads it, a foreign or
 * absent project is 404 `not_found`; a person the caller's organization does
 * not hold is 404 `unknown_person`.
 */
export const readPersonWork = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/people/:personId/work',
  operationId: 'getApiProjectsByIdPeopleByPersonIdWork',
  policies: [...readPolicies, { kind: 'organization-resource', operation: 'read' }],
  params: requestSchema(type({ id: 'string', personId: 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          person: type({ personId: 'string', name: 'string' }),
          assignments: type({ ...address, stepId: 'string' }).array(),
          claims: type({
            ...address,
            stepId: 'string | null',
            claimId: 'string',
            runId: 'string | null',
            parentClaimId: 'string | null',
            claimedAt: 'number',
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
    { status: 404, schema: responseSchema(type({ error: "'not_found'" })) },
    { status: 404, schema: responseSchema(type({ error: "'unknown_person'" })) },
    organizationRefusal,
    organizationContextRefusal,
  ],
  document: {
    summary: 'List what one person is assigned to and what they hold claimed in a project.',
    description:
      'assignments: each step the person is assigned to, with the work item id, its frozen number (numberIsFrozen) or else its derived one, its name and the step id. claims: each claim the person holds, with the work item, the step (null for a subtree claim on a non-leaf), the claim id, run, parent claim and write instant. Both in tree order, then step order; an assignment and a claim on the same step are listed in each. Give personId from getApiPeople; assign a subtree with postApiProjectsByIdCommands kind assignSubtree, or claim and assign at once with claimWorkItem assign true.',
  },
});
