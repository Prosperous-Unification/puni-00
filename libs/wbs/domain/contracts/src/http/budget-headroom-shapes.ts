import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';
import { mixedBases } from './work-item-response';

/**
 * One measure's tightest budget over a step (`wbs-measure-budgets` D41): the
 * reading of the work item whose budget it is, the step's own or an
 * ancestor's. `spent` is that subtree's facts in the measure; where the
 * budget states a hold, `holdPerAttempt` is it and `held` what its running
 * attempts of unknown usage hold; `remaining` is the cap less both, negative
 * past the cap.
 */
const boundingBudget = type({
  cap: 'number',
  policy: "'strict' | 'advisory'",
  source: "'stated' | 'derived'",
  spent: 'number',
  'holdPerAttempt?': 'number',
  'held?': 'number',
  remaining: 'number',
  exceeded: 'boolean',
  workItemId: 'string',
});

/** A budget a rate-card mix keeps from being read: who states it, the two bases, its source. */
const blockedBound = type({
  workItemId: 'string',
  bases: mixedBases,
  source: "'stated' | 'derived'",
});

/**
 * One measure over one step (design D46, D52): the tightest readable strict
 * budget of the chain and apart the tightest readable advisory or derived
 * one, with the nearest budget of each policy that a sum across two bases
 * keeps from being read in `blocked` (design D44). The coordinator refuses
 * when `strict.remaining <= 0` or `blocked.strict` is present; advisory
 * budgets, read or blocked, never refuse.
 */
const measureHeadroom = type({
  'strict?': boundingBudget,
  'advisory?': boundingBudget,
  'blocked?': type({ 'strict?': blockedBound, 'advisory?': blockedBound }),
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
 * Never refused for a rate-card mix: that is named on its step and key. Not
 * a snapshot: the startable steps and the budgets are read apart, so a write
 * between them can pair a step with budgets a moment newer (design D50).
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
      'For each step getApiProjectsByIdStartable lists (startable steps first, fitting or not, then claimed ones), budgets maps a measure key to the budgets of the step’s work item and its ancestors: strict, the readable strict budget with the least remaining, and advisory, the readable advisory or derived one with the least remaining; each names the workItemId that states it. Coordinator rule: refuse the next attempt when strict.remaining <= 0 or blocked.strict is present; advisory budgets, read or blocked, never refuse. cap, spent, holdPerAttempt, held and remaining are in the measure’s unit and scale (getApiMeasures; cost is micro-units of its currency). source derived is the subtree’s pessimistic estimates times the project’s budgetFactor. spent is the subtree’s recorded facts; holdPerAttempt and held are present only where the budget states a hold, held being holdPerAttempt times the running attempts whose usage is not recorded yet; remaining is cap minus spent minus held, negative past the cap; exceeded is spent above cap. blocked.strict and blocked.advisory name the nearest budget of each policy that cannot be read because its subtree prices money under two bases (currency and rate card digest; null is unpriced): its workItemId, the first two bases and its source. Treat a blocked measure as unknown, never unbounded. A step with no budget above it has empty budgets. The read is not a snapshot: steps and budgets are read apart, so recheck before acting on a value at the edge. Give team (a team id from getApiTeams) for one team’s allotment. Set budgets with postApiProjectsByIdCommands kinds setBudget and clearBudget.',
  },
});
