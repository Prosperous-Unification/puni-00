import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';
import { mixedBases } from './work-item-response';

/**
 * One measure's tightest budget over a step (`wbs-measure-budgets` D41): the
 * reading of the work item whose budget it is, the step's own or an
 * ancestor's. `spent` is that subtree's facts in the measure, `held` (only
 * where the budget states a hold) what its running attempts of unknown usage
 * hold, `remaining` the cap less both, negative past the cap.
 */
const boundingBudget = type({
  cap: 'number',
  policy: "'strict' | 'advisory'",
  source: "'stated' | 'derived'",
  spent: 'number',
  'held?': 'number',
  remaining: 'number',
  exceeded: 'boolean',
  workItemId: 'string',
});

/**
 * One measure over one step (design D46): the tightest strict budget of the
 * chain, which a coordinator refuses on, and apart the tightest advisory or
 * derived one, which it only reports. `mixedRateCards` with `mixedAt` names a
 * budget in the chain that a sum across two bases keeps from being read
 * (design D44): the key is then unknown, never unbounded.
 */
const measureHeadroom = type({
  'strict?': boundingBudget,
  'advisory?': boundingBudget,
  'mixedRateCards?': mixedBases,
  'mixedAt?': 'string',
});

const stepHeadroom = type({
  workItemId: 'string',
  stepId: 'string',
  state: "'startable' | 'claimed'",
  budgets: type({ '[string]': measureHeadroom }),
});

/**
 * The remaining budget per measure of every startable and claimed step of a
 * project (`wbs-measure-budgets` task 4.1, design D41): what a coordinator
 * refuses the next attempt on. Admitted exactly as the startable read: an
 * organization's viewer reads it, a foreign or absent project is 404
 * `not_found`, a team the organization does not hold 404 `unknown_team`.
 * Never refused for a rate-card mix: that is named on its step and key.
 */
export const readBudgetHeadroom = defineEndpointShape({
  method: 'GET',
  path: '/api/projects/:id/budget-headroom',
  operationId: 'getApiProjectsByIdBudget-headroom',
  policies: [
    { kind: 'identity', require: 'signed-in' },
    { kind: 'organization-resource', operation: 'read' },
  ],
  params: requestSchema(type({ id: 'string' })),
  query: requestSchema(type({ 'team?': 'string' })),
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ steps: stepHeadroom.array() })),
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
    summary: 'Read the remaining budget per measure of every startable and claimed step.',
    description:
      'For each step getApiProjectsByIdStartable lists (startable steps first, fitting or not, then claimed ones), budgets maps a measure key to two budgets taken from the step’s work item and its ancestors: strict, the strict budget with the least remaining (the coordinator refuses the next attempt once nothing remains), and advisory, the advisory or derived one with the least remaining (only reported). Each names the workItemId that states it. cap, spent, held and remaining are in the measure’s unit and scale (getApiMeasures; cost is micro-units of its currency). source derived is the subtree’s pessimistic estimates times the project’s budgetFactor. spent is the subtree’s recorded facts; held is holdPerAttempt times the running attempts whose usage is not recorded yet (present only where the budget states a hold); remaining is cap minus spent minus held, negative past the cap; exceeded is spent above cap. A step with no budget above it has empty budgets. When a budget in the chain cannot be read because its subtree prices money under two bases (currency and rate card digest; null is unpriced), the key carries mixedRateCards naming the first two and mixedAt the work item whose budget is blocked: treat that measure as unknown, not unbounded. Give team (a team id from getApiTeams) for one team’s allotment. Set budgets with postApiProjectsByIdCommands kinds setBudget and clearBudget.',
  },
});
