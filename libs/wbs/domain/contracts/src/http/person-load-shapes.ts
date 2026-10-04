import { type } from 'arktype';

import { defineEndpointShape } from './endpoint-shape';
import { organizationRefusal } from './organization-refusal';
import { requestSchema, responseSchema } from './schema-shape';

const policies = [{ kind: 'identity', require: 'signed-in' }] as const;
const day = type('string').matching(/^\d{4}-\d{2}-\d{2}$/);
/**
 * The window both load reads take. The shape admits any two dates; the order,
 * calendar validity and 182-day cap are the route's, answered as the same
 * `invalid_query`.
 */
const query = requestSchema(type({ from: day, to: day }));
const refusals = [
  {
    status: 400,
    schema: responseSchema(type({ error: "'invalid_query' | 'invalid_params' | 'invalid_body'" })),
  },
  { status: 401, schema: responseSchema(type({ error: "'unauthenticated'" })) },
  organizationRefusal,
] as const;
const namedProject = type({ projectId: 'string', name: 'string' });
const unavailableProject = namedProject.and({
  reason: "'engine_unavailable' | 'cycle' | 'calendar_range'",
});
const bookingRef = type({ projectId: 'string', workItemId: 'string', stepId: 'string | null' });

/**
 * One person's bookings across every project the caller can open, and where
 * they overlap. Projects the caller cannot open are omitted entirely.
 */
export const readPersonLoad = defineEndpointShape({
  method: 'GET',
  path: '/api/people/:personId/load',
  operationId: 'getApiPeopleByPersonIdLoad',
  policies,
  params: requestSchema(type({ personId: 'string' })),
  query,
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          person: type({ id: 'string', name: 'string' }),
          projects: namedProject
            .and({
              rank: 'number',
              engine: "'fast' | 'optimized'",
              bookings: type({
                workItemId: 'string',
                number: 'string',
                name: 'string',
                stepId: 'string | null',
                startsOn: 'string',
                endsOn: 'string',
                width: 'number',
              }).array(),
            })
            .array(),
          overlaps: type({
            startsOn: 'string',
            endsOn: 'string',
            bookings: bookingRef.array(),
          }).array(),
          undated: namedProject.array(),
          unavailable: unavailableProject.array(),
        }),
      ),
    },
  ],
  refusals: [...refusals, { status: 404, schema: responseSchema(type({ error: "'not_found'" })) }],
  document: {
    summary:
      'Read one person’s bookings across every readable project between two dates, with overlaps.',
  },
});

/** Every person's booked and overlapping workdays per week, across readable projects. */
export const readOrganizationLoad = defineEndpointShape({
  method: 'GET',
  path: '/api/people/load',
  operationId: 'getApiPeopleLoad',
  policies,
  query,
  responses: [
    {
      kind: 'json',
      status: 200,
      schema: responseSchema(
        type({
          people: type({
            id: 'string',
            name: 'string',
            weeks: type({ weekOf: 'string', booked: 'number', overlapping: 'number' }).array(),
          }).array(),
          undated: namedProject.array(),
          unavailable: unavailableProject.array(),
        }),
      ),
    },
  ],
  refusals,
  document: {
    summary: 'Read every person’s booked and overlapping workdays per week between two dates.',
  },
});
