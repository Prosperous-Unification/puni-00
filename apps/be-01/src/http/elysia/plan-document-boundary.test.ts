import { defineEndpointShape, planDocumentRequest, responseSchema } from '@wbs/contracts';
import { classifyPlanDocument } from '@wbs/core';
import { type } from 'arktype';
import { expect, test } from 'bun:test';

import { bind, EMPTY, type IdentityResolver, type RequestFailure } from '../endpoint';
import { mountEndpoints } from './mount';

const boundary = defineEndpointShape({
  method: 'POST',
  path: '/api/projects/import',
  operationId: 'testPlanDocumentBoundary',
  policies: [],
  body: planDocumentRequest,
  bodyMedia: ['application/json'],
  responses: [{ kind: 'empty', status: 204 }],
  refusals: [
    {
      status: 400,
      // Section 4 publishes the import endpoint. This local production-adapter
      // harness observes the classifier path through the established tolerant
      // response boundary without claiming that route ahead of that slice.
      schema: responseSchema(type({ error: "'invalid_body' | 'unsupported_version'" })),
    },
  ],
  document: { summary: 'Exercise the import document boundary before persistence exists.' },
});

const unusedIdentity: IdentityResolver = () => {
  throw new Error('the boundary has no identity policy');
};

async function refused(input: unknown) {
  const classified = await classifyPlanDocument(input);
  if (classified.ok) throw new Error('a rejected request passed its own classifier');
  return {
    ok: false,
    status: 400,
    body: { error: classified.code, path: classified.path },
  } as const;
}

function mounted() {
  return mountEndpoints(
    [
      bind(
        boundary,
        async ({ body }) => {
          const classified = await classifyPlanDocument(body);
          return classified.ok
            ? { ok: true, status: 204, body: EMPTY }
            : {
                ok: false,
                status: 400,
                body: { error: classified.code, path: classified.path },
              };
        },
        {
          classifyRequestFailure: (failure: RequestFailure) => refused(failure.rejected),
        },
      ),
    ],
    { appOrigin: 'https://app.example', resolveIdentity: unusedIdentity },
  );
}

function documentBody() {
  const row = {
    id: 'row-1',
    parentId: null,
    position: 10,
    name: 'Ship',
    notes: '',
    frozenNumber: null,
    startNoEarlierThan: null,
    startNoEarlierThanReason: null,
    deadline: null,
    factStart: null,
    factEnd: null,
    priority: 3,
    serviceTeamId: null,
    serviceId: null,
    maxParallel: 1,
    teamIds: [],
    tagIds: [],
    serviceIds: [],
    typeIds: [],
    externalRefs: [],
    estimates: {},
    actuals: {},
    progress: {},
    measures: {},
    dependsOn: [],
    assignees: {},
  };
  return {
    document: { format: 'wbs-plan', version: 1, exportedAt: '2026-09-13T12:30:00.000Z' },
    settings: {
      name: 'Plan',
      restricted: false,
      estimateMethod: 'pert',
      depReach: 'whole-item',
      pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
      estimateRounding: 'ceil',
      startDate: null,
      solutionRef: null,
      optimizationEnabled: false,
      scheduleEngine: 'fast',
      scheduleObjective: 'pri',
    },
    capacity: [],
    priorityBands: [],
    calendarMarkers: [],
    directory: {
      teams: [],
      people: [],
      tags: [],
      services: [],
      types: [],
      externalSystems: [],
    },
    workItems: Array.from({ length: 4 }, () => structuredClone(row)),
    steps: [],
    derivedFutureField: 'deleted',
  };
}

test('mounted malformed priority names workItems[3].priority', async () => {
  const supplied = documentBody();
  Reflect.set(supplied.workItems[3] ?? {}, 'priority', 'high');
  const response = await mounted().handle(
    new Request('https://backend.example/api/projects/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(supplied),
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: 'invalid_body',
    path: 'workItems[3].priority',
  });
});

test('mounted unknown version precedes version-specific validation', async () => {
  const supplied = documentBody();
  Reflect.set(supplied.document, 'version', 2);
  Reflect.set(supplied.workItems[3] ?? {}, 'priority', 'high');
  const response = await mounted().handle(
    new Request('https://backend.example/api/projects/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(supplied),
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: 'unsupported_version',
    path: 'document.version',
  });
});
