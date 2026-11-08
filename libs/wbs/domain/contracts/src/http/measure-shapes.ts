import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationContextRefusal, organizationRefusal } from './organization-refusal';
import { responseSchema } from './schema-shape';

/**
 * One measure definition as the list answers it (`wbs-measure-budgets` D1).
 * `currency` is present exactly on money; `derived` figures are computed on
 * read and never typed.
 */
export const measureDefinitionRow = type({
  id: 'string',
  key: 'string',
  name: 'string',
  unit: 'string',
  kind: "'duration' | 'count' | 'money'",
  scale: "'integer' | 'real'",
  threePoint: 'boolean',
  showByDefault: 'boolean',
  schedulesWork: 'boolean',
  derived: 'boolean',
  order: 'number',
  currency: 'string | null',
});

/**
 * The caller's organization's measure definitions in list order
 * (`wbs-measure-budgets` D1): the active organization's after activation, the
 * legacy organization's before it, refused 409 `organization_required` when
 * legacy access finds no legacy organization. Every role reads it.
 */
export const listMeasures = defineEndpointShape({
  method: 'GET',
  path: '/api/measures',
  operationId: 'getApiMeasures',
  policies: [
    { kind: 'identity', require: 'signed-in' },
    { kind: 'organization-resource', operation: 'read' },
  ],
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(type({ measures: measureDefinitionRow.array() })),
    },
  ],
  refusals: [
    {
      status: 400,
      schema: responseSchema(
        type({ error: "'invalid_query' | 'invalid_params' | 'invalid_body'" }),
      ),
    },
    { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
    organizationRefusal,
    organizationContextRefusal,
    { status: 409, schema: responseSchema(type({ error: "'organization_required'" })) },
  ],
  document: {
    summary: 'List the measure definitions of the organization.',
    description:
      'Every measure definition the caller’s organization holds, ordered by order then key: the five seeded (time, the one that schedules work; tokens; hours; cost in micro-units of its currency; agent_minutes, derived from attempt spans) and any the organization defined. key is the metric a figure is addressed by and never changes. Write them with postApiDirectoryCommands kinds createMeasure, patchMeasure, deleteMeasure.',
  },
});
