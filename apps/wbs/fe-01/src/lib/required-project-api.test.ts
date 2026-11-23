import type { PlanDocumentRequest } from '@wbs/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { httpWorkPackageApi, WbsRequestError } from './wbs-api';

const workPackage = {
  id: 'package-new',
  projectId: 'project-a',
  name: 'Plan',
  abbreviation: 'PLAN',
  restricted: false,
  estimateMethod: 'pert',
  depReach: 'whole-item',
  pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
  estimateRounding: 'ceil',
  startDate: null,
  solutionRef: null,
  revision: 0,
  createdAt: 1,
  optimizationEnabled: false,
  scheduleEngine: 'fast',
  scheduleObjective: 'pri',
  budgetFactor: 1,
};
const document: PlanDocumentRequest = {
  document: { format: 'wbs-plan', version: 1, exportedAt: '2026-09-14T09:00:00.000Z' },
  settings: {
    name: 'Imported exact',
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
  directory: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
  workItems: [],
  steps: [],
};
beforeEach(() => vi.stubGlobal('location', { origin: 'http://wbs.test' }));
afterEach(() => vi.unstubAllGlobals());

describe('explicit current project destination', () => {
  it('sends the chosen parent and name to the real generated create request', async () => {
    const sending = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response(JSON.stringify({ workPackage, steps: [] }), { status: 200 })),
    );
    vi.stubGlobal('fetch', sending);
    const outcome: unknown = await httpWorkPackageApi('token')
      .createWorkPackage('project-a', 'Plan')
      .catch((cause: unknown) => cause);
    expect(sending).toHaveBeenCalledTimes(1);
    expect(sending.mock.calls[0]?.[0]).toBe('/api/work-packages');
    const body = sending.mock.calls[0]?.[1]?.body;
    expect(typeof body).toBe('string');
    if (typeof body !== 'string') throw new Error('Expected a JSON request body');
    expect(JSON.parse(body)).toEqual({
      projectId: 'project-a',
      name: 'Plan',
    });
    expect(outcome).toMatchObject({ id: 'package-new', projectId: 'project-a', name: 'Plan' });
  });

  it('wraps the unchanged archival document in the chosen destination envelope', async () => {
    const summary = {
      workPackageId: 'package-new',
      rows: 0,
      created: { teams: [], people: [], tags: [], services: [], types: [], externalSystems: [] },
      solutionRef: 'none',
    };
    const sending = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response(JSON.stringify(summary), { status: 201 })),
    );
    vi.stubGlobal('fetch', sending);
    const before = structuredClone(document);
    const outcome: unknown = await httpWorkPackageApi('token')
      .importPlan('project-a', document, { defineMissing: false })
      .catch((cause: unknown) => cause);
    expect(sending).toHaveBeenCalledTimes(1);
    expect(sending.mock.calls[0]?.[0]).toBe('/api/work-packages/import');
    const body = sending.mock.calls[0]?.[1]?.body;
    expect(typeof body).toBe('string');
    if (typeof body !== 'string') throw new Error('Expected a JSON request body');
    expect(JSON.parse(body)).toEqual({
      projectId: 'project-a',
      document: before,
      defineMissing: false,
    });
    expect(outcome).toEqual(summary);
    expect(document).toEqual(before);
  });
});

describe('actual project catalog transport', () => {
  it('reads validated project summaries through the same authenticated client', async () => {
    const projects = [
      {
        id: 'project-a',
        organizationId: 'org-a',
        spaceId: null,
        spacePosition: null,
        name: 'Project A',
        revision: 1,
        createdAt: 1,
        updatedAt: null,
        createdBy: null,
        workPackageCount: 0,
      },
    ];
    const sending = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(Response.json({ projects })),
    );
    vi.stubGlobal('fetch', sending);
    expect(await httpWorkPackageApi('token').listProjects()).toEqual(projects);
    expect(sending).toHaveBeenCalledTimes(1);
    expect(sending.mock.calls[0]?.[0]).toBe('/api/projects');
    expect(new Headers(sending.mock.calls[0]?.[1]?.headers).get('x-wbs-token')).toBe('token');
  });

  it('refuses malformed project summaries rather than presenting an empty catalog', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        Response.json({
          projects: [
            {
              id: 'project-a',
              organizationId: 'org-a',
              spaceId: null,
              spacePosition: null,
              name: 'Project A',
              revision: 0,
              createdAt: 'yesterday',
              updatedAt: null,
              createdBy: null,
              workPackageCount: 0,
            },
          ],
        }),
      ),
    );
    await expect(httpWorkPackageApi('token').listProjects()).rejects.toMatchObject({
      problem: { kind: 'failure', failure: { code: 'invalid_response' } },
    });
  });
});

const combinedProjectReply = {
  project: {
    id: 'project-created',
    organizationId: 'org-a',
    spaceId: null,
    spacePosition: null,
    name: 'New mission',
    revision: 0,
    createdAt: 1,
    updatedAt: null,
    createdBy: 'creator-a',
    workPackageCount: 1,
  },
  workPackage: { ...workPackage, projectId: 'project-created', name: 'First delivery' },
  steps: [],
};

describe('atomic project and first package transport', () => {
  it('sends one exact authenticated POST and returns the complete correlated creation', async () => {
    const sending = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(Response.json(combinedProjectReply, { status: 201 })),
    );
    vi.stubGlobal('fetch', sending);
    const outcome: unknown = await httpWorkPackageApi('token')
      .createProjectWithWorkPackage('New mission', 'First delivery')
      .catch((cause: unknown) => cause);
    expect(sending).toHaveBeenCalledTimes(1);
    expect(sending.mock.calls[0]?.[0]).toBe('/api/projects');
    const request = sending.mock.calls[0]?.[1];
    expect(request?.method).toBe('POST');
    expect(new Headers(request?.headers).get('x-wbs-token')).toBe('token');
    if (typeof request?.body !== 'string') throw new Error('Expected the combined JSON body');
    expect(JSON.parse(request.body)).toEqual({
      name: 'New mission',
      workPackage: { name: 'First delivery' },
    });
    expect(outcome).toEqual(combinedProjectReply);
  });

  it.each(['empty', 'missing package', 'missing steps', 'malformed steps', 'foreign parent'])(
    'refuses a %s 201 while preserving its actual response status and headers',
    async (fault) => {
      const reply = structuredClone(combinedProjectReply);
      if (fault === 'empty') {
        Reflect.deleteProperty(reply, 'workPackage');
        Reflect.deleteProperty(reply, 'steps');
      }
      if (fault === 'missing package') Reflect.deleteProperty(reply, 'workPackage');
      if (fault === 'missing steps') Reflect.deleteProperty(reply, 'steps');
      if (fault === 'malformed steps') Reflect.set(reply, 'steps', null);
      if (fault === 'foreign parent') reply.workPackage.projectId = 'different-parent';
      const sending = vi.fn(() =>
        Promise.resolve(
          Response.json(reply, { status: 201, headers: { 'x-response-marker': 'retained' } }),
        ),
      );
      vi.stubGlobal('fetch', sending);
      const outcome: unknown = await httpWorkPackageApi('token')
        .createProjectWithWorkPackage('New mission', 'First delivery')
        .catch((cause: unknown) => cause);
      expect(sending).toHaveBeenCalledTimes(1);
      expect(outcome).toBeInstanceOf(WbsRequestError);
      if (!(outcome instanceof WbsRequestError) || outcome.problem.kind !== 'failure')
        throw new Error('Expected a correlated response failure');
      expect(outcome.problem.operation).toBe('postApiProjects');
      expect(outcome.problem.failure).toMatchObject({
        code: 'invalid_response',
        reason: 'schema',
        status: 201,
      });
      if (outcome.problem.failure.code !== 'invalid_response')
        throw new Error('Expected the response-validation failure');
      expect(outcome.problem.failure.headers.get('x-response-marker')).toBe('retained');
    },
  );

  it.each([
    [409, { error: 'name_taken' }],
    [409, { error: 'abbreviation_taken' }],
    [409, { error: 'abbreviation_exhausted' }],
    [403, { error: 'forbidden', permission: 'organization.create_project' }],
    [403, { error: 'insufficient_scope' }],
    [403, { error: 'invalid_origin' }],
    [403, { error: 'no_active_organization' }],
    [409, { error: 'organization_context_changed' }],
    [422, { error: 'invalid_body' }],
  ] as const)('retains the exact %i modeled refusal %j', async (status, refusal) => {
    const sending = vi.fn(() => Promise.resolve(Response.json(refusal, { status })));
    vi.stubGlobal('fetch', sending);
    const outcome: unknown = await httpWorkPackageApi('token')
      .createProjectWithWorkPackage('New mission', 'First delivery')
      .catch((cause: unknown) => cause);
    expect(sending).toHaveBeenCalledTimes(1);
    expect(outcome).toBeInstanceOf(WbsRequestError);
    if (!(outcome instanceof WbsRequestError))
      throw new Error('Expected the actual client refusal');
    expect(outcome.problem).toEqual({
      kind: 'refusal',
      operation: 'postApiProjects',
      refusal,
    });
  });

  it.each([
    [7, 'First delivery'],
    ['New mission', undefined],
    ['', 'First delivery'],
    ['New mission', ''],
  ])('sends no request for malformed names %j/%j', async (projectName, workPackageName) => {
    const sending = vi.fn(() => Promise.reject(new Error('Malformed request reached transport')));
    vi.stubGlobal('fetch', sending);
    // These values deliberately cross the typed caller boundary to exercise real request validation.
    const outcome: unknown = await httpWorkPackageApi('token')
      .createProjectWithWorkPackage(projectName as never, workPackageName as never)
      .catch((cause: unknown) => cause);
    expect(sending).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      problem: {
        kind: 'failure',
        operation: 'postApiProjects',
        failure: { code: 'invalid_request', part: 'body' },
      },
    });
  });

  it('preserves an uncertain transport outcome without sending a second POST', async () => {
    const lost = new Error('Connection lost after send');
    const sending = vi.fn(() => Promise.reject(lost));
    vi.stubGlobal('fetch', sending);
    const outcome: unknown = await httpWorkPackageApi('token')
      .createProjectWithWorkPackage('New mission', 'First delivery')
      .catch((cause: unknown) => cause);
    expect(sending).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({
      problem: {
        kind: 'failure',
        operation: 'postApiProjects',
        failure: { code: 'transport', cause: lost },
      },
    });
  });
});

it('accepts the actual list shell through the generated authenticated client without enriching its fields', async () => {
  const projects = [{ id: 'shell', name: 'Package-only parent' }];
  const sending = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(Response.json({ projects })),
  );
  vi.stubGlobal('fetch', sending);
  expect(await httpWorkPackageApi('token').listProjects()).toEqual(projects);
  expect(sending).toHaveBeenCalledTimes(1);
  expect(sending.mock.calls[0]?.[0]).toBe('/api/projects');
  expect(new Headers(sending.mock.calls[0]?.[1]?.headers).get('x-wbs-token')).toBe('token');
});

it('does not reinterpret partial full list metadata as a valid shell', async () => {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(
      Response.json({ projects: [{ id: 'p', name: 'Partial metadata', revision: 1 }] }),
    ),
  );
  await expect(httpWorkPackageApi('token').listProjects()).rejects.toMatchObject({
    problem: { kind: 'failure', failure: { code: 'invalid_response' } },
  });
});
