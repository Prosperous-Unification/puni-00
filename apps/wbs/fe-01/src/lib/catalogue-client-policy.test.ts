import {
  bindCatalogueStep,
  listStepCatalogue,
  patchStepDefinition,
  readProjectStepManifest,
  readProjectSteps,
  readProjectStepUsage,
  reorderCatalogueBindings,
  retireStepDefinition,
  unbindCatalogueStep,
} from '@wbs/contracts';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { browserClient } from './http';
import type { ResourceScope } from './organization-context';

const shapes = [
  listStepCatalogue,
  bindCatalogueStep,
  patchStepDefinition,
  retireStepDefinition,
  unbindCatalogueStep,
  reorderCatalogueBindings,
  readProjectSteps,
  readProjectStepUsage,
  readProjectStepManifest,
] as const;
const definition = {
  id: 'step-dev',
  organizationId: 'org-a',
  code: 'dev',
  name: 'Development',
  position: 10,
  defaultEstimateUnit: 'minutes',
  defaultAllowanceBps: 1234,
  definedAt: { scopeKind: 'organization', scopeId: 'org-a' },
  origin: 'authored',
};
const binding = {
  bindingId: 'binding-dev',
  organizationId: 'org-a',
  stepId: 'step-dev',
  scopeKind: 'organization',
  scopeId: 'org-a',
  workItemTypeId: null,
  position: 10,
  origin: 'authored',
};

beforeEach(() => vi.stubGlobal('location', { origin: 'http://wbs.test' }));
afterEach(() => vi.unstubAllGlobals());

for (const operation of [
  'list',
  'bind',
  'patch',
  'retire',
  'preview',
  'unbind',
  'reorder',
  'project',
  'usage',
  'manifest',
] as const) {
  it('catalogue browser client carries its captured organization for ' + operation, async () => {
    const refuse = vi.fn();
    const scope: ResourceScope = {
      organization: { kind: 'active', organizationId: 'org-a' },
      isCurrent: () => true,
      refuse,
    };
    const fetched = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() => {
      switch (operation) {
        case 'list':
          return Promise.resolve(Response.json({ definitions: [definition], bindings: [binding] }));
        case 'bind':
          return Promise.resolve(Response.json({ binding }, { status: 201 }));
        case 'patch':
          return Promise.resolve(Response.json({ definition }));
        case 'retire':
          return Promise.resolve(new Response(null, { status: 204 }));
        case 'preview':
          return Promise.resolve(Response.json({ wouldRefuse: null }));
        case 'unbind':
          return Promise.resolve(new Response(null, { status: 204 }));
        case 'reorder':
          return Promise.resolve(new Response(null, { status: 204 }));
        case 'project':
          return Promise.resolve(Response.json({ steps: [] }));
        case 'usage':
          return Promise.resolve(Response.json({ count: 0, pairs: [] }));
        case 'manifest':
          return Promise.resolve(
            Response.json({
              version: 1,
              project: { id: 'project-a', revision: 7 },
              default: [],
              types: [],
            }),
          );
      }
    });
    vi.stubGlobal('fetch', fetched);
    const client = browserClient(shapes, scope);
    const reply = await (async () => {
      switch (operation) {
        case 'list':
          return await client.listStepCatalogue({});
        case 'bind':
          return await client.bindCatalogueStep({
            body: {
              stepId: 'step-dev',
              scopeKind: 'organization',
              scopeId: 'org-a',
              workItemTypeId: null,
              position: 10,
            },
          });
        case 'patch':
          return await client.patchStepDefinition({
            params: { stepId: 'step-dev' },
            body: { defaultAllowanceBps: 1234 },
          });
        case 'retire':
          return await client.retireStepDefinition({ params: { stepId: 'step-dev' } });
        case 'preview':
          return await client.unbindCatalogueStep({
            params: { bindingId: 'binding-dev' },
            body: { dryRun: true },
          });
        case 'unbind':
          return await client.unbindCatalogueStep({
            params: { bindingId: 'binding-dev' },
            body: { dryRun: false },
          });
        case 'reorder':
          return await client.reorderCatalogueBindings({
            body: { scopeKind: 'project', scopeId: 'project-a', ids: ['binding-b', 'binding-a'] },
          });
        case 'project':
          return await client.readProjectSteps({
            params: { id: 'project-a' },
            query: { type: 'type-a' },
          });
        case 'usage':
          return await client.readProjectStepUsage({
            params: { id: 'project-a' },
            query: { stepId: 'step-dev' },
          });
        case 'manifest':
          return await client.readProjectStepManifest({ params: { id: 'project-a' }, query: {} });
      }
    })();
    // Actual shape request and response decoding must succeed before the selected expectation oracle.
    expect(reply.kind).toBe('success');
    expect(fetched).toHaveBeenCalledTimes(1);
    const call = fetched.mock.calls.at(0);
    expect(call).toBeDefined();
    if (call === undefined)
      throw new Error('catalogue transport did not record its successful request');
    const [url, request] = call;
    const expectedPath =
      operation === 'manifest'
        ? '/api/projects/project-a/step-manifest'
        : operation === 'usage'
          ? '/api/projects/project-a/step-nodes-in-use?stepId=step-dev'
          : operation === 'project'
            ? '/api/projects/project-a/steps?type=type-a'
            : operation === 'list'
              ? '/api/organization/steps'
              : operation === 'bind'
                ? '/api/organization/step-bindings'
                : operation === 'reorder'
                  ? '/api/organization/step-bindings/reorder'
                  : operation === 'preview' || operation === 'unbind'
                    ? '/api/organization/step-bindings/binding-dev'
                    : '/api/organization/steps/step-dev';
    expect(url).toBe(expectedPath);
    expect(request?.method).toBe(
      operation === 'list' ||
        operation === 'project' ||
        operation === 'usage' ||
        operation === 'manifest'
        ? 'GET'
        : operation === 'bind' || operation === 'reorder'
          ? 'POST'
          : operation === 'patch'
            ? 'PATCH'
            : 'DELETE',
    );
    if (operation === 'preview' || operation === 'unbind' || operation === 'reorder') {
      const body = request?.body;
      expect(typeof body).toBe('string');
      if (typeof body !== 'string') throw new Error('Expected a serialized catalogue request body');
      if (operation === 'reorder')
        expect(JSON.parse(body)).toEqual({
          scopeKind: 'project',
          scopeId: 'project-a',
          ids: ['binding-b', 'binding-a'],
        });
      else expect(JSON.parse(body)).toEqual({ dryRun: operation === 'preview' });
    }
    expect(refuse).not.toHaveBeenCalled();
    expect(new Headers(request?.headers).get('X-WBS-Expected-Organization')).toBe('org-a');
  });
}

for (const specimen of [
  { name: 'bounded protected preview', size: 200, count: 201, fact: 'estimate', valid: true },
  { name: 'oversized protected preview', size: 201, count: 201, fact: 'estimate', valid: false },
  { name: 'unknown protected fact', size: 1, count: 1, fact: 'unknown_fact', valid: false },
]) {
  it(
    'catalogue unbind client decodes ' + specimen.name + ' at its real response boundary',
    async () => {
      const refuse = vi.fn();
      const scope: ResourceScope = {
        organization: { kind: 'active', organizationId: 'org-a' },
        isCurrent: () => true,
        refuse,
      };
      const pairs = Array.from({ length: specimen.size }, (_, index) => ({
        id: 'leaf-' + String(index),
        name: 'Leaf ' + String(index),
        workPackageId: 'package-a',
        stepId: 'step-dev',
        facts: [specimen.fact],
      }));
      const fetched = vi.fn(() =>
        Promise.resolve(
          Response.json({ wouldRefuse: 'step_nodes_in_use', count: specimen.count, pairs }),
        ),
      );
      vi.stubGlobal('fetch', fetched);
      const client = browserClient([unbindCatalogueStep] as const, scope);
      const reply = await client.unbindCatalogueStep({
        params: { bindingId: 'binding-dev' },
        body: { dryRun: true },
      });
      expect(fetched).toHaveBeenCalledTimes(1);
      if (specimen.valid)
        expect(reply).toMatchObject({
          kind: 'success',
          status: 200,
          body: { wouldRefuse: 'step_nodes_in_use', count: 201, pairs },
        });
      else
        expect(reply).toMatchObject({
          kind: 'failure',
          failure: { code: 'invalid_response', reason: 'schema', status: 200 },
        });
      expect(refuse).not.toHaveBeenCalled();
    },
  );
}

const projectVia = [
  { bindingId: 'binding-org', scopeKind: 'organization', scopeId: 'org-a', workItemTypeId: null },
  { bindingId: 'binding-space', scopeKind: 'space', scopeId: 'space-a', workItemTypeId: 'type-a' },
  {
    bindingId: 'binding-project',
    scopeKind: 'project',
    scopeId: 'project-a',
    workItemTypeId: null,
  },
];
for (const specimen of [
  { name: 'complete provenance', via: projectVia, valid: true },
  { name: 'empty provenance', via: [], valid: false },
  {
    name: 'work-package binding scope',
    via: [
      {
        bindingId: 'binding-package',
        scopeKind: 'work_package',
        scopeId: 'package-a',
        workItemTypeId: null,
      },
    ],
    valid: false,
  },
]) {
  it(
    'project steps client decodes ' + specimen.name + ' at its real response boundary',
    async () => {
      const refuse = vi.fn(),
        scope: ResourceScope = {
          organization: { kind: 'active', organizationId: 'org-a' },
          isCurrent: () => true,
          refuse,
        };
      const body = {
        steps: [{ stepId: 'step-dev', code: 'dev', name: 'Development', via: specimen.via }],
      };
      const fetched = vi.fn(() => Promise.resolve(Response.json(body)));
      vi.stubGlobal('fetch', fetched);
      const client = browserClient([readProjectSteps] as const, scope);
      const reply = await client.readProjectSteps({ params: { id: 'project-a' }, query: {} });
      expect(fetched).toHaveBeenCalledTimes(1);
      if (specimen.valid) expect(reply).toMatchObject({ kind: 'success', status: 200, body });
      else
        expect(reply).toMatchObject({
          kind: 'failure',
          failure: { code: 'invalid_response', reason: 'schema', status: 200 },
        });
      expect(refuse).not.toHaveBeenCalled();
    },
  );
}

for (const specimen of [
  { name: 'empty usage', count: 0, size: 0, valid: true },
  { name: 'bounded readable usage', count: 201, size: 200, valid: true },
  { name: 'oversized readable usage', count: 201, size: 201, valid: false },
  { name: 'negative usage count', count: -1, size: 0, valid: false },
]) {
  it(
    'project usage client decodes ' + specimen.name + ' at its real response boundary',
    async () => {
      const refuse = vi.fn(),
        scope: ResourceScope = {
          organization: { kind: 'active', organizationId: 'org-a' },
          isCurrent: () => true,
          refuse,
        };
      const body = {
        count: specimen.count,
        pairs: Array.from({ length: specimen.size }, (_, index) => ({
          id: 'leaf-' + String(index),
          name: 'Leaf ' + String(index),
          workPackageId: 'package-a',
          stepId: 'step-dev',
          facts: ['estimate'],
        })),
      };
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(Response.json(body))),
      );
      const reply = await browserClient(
        [readProjectStepUsage] as const,
        scope,
      ).readProjectStepUsage({ params: { id: 'project-a' }, query: { stepId: 'step-dev' } });
      if (specimen.valid) expect(reply).toMatchObject({ kind: 'success', status: 200, body });
      else
        expect(reply).toMatchObject({
          kind: 'failure',
          failure: { code: 'invalid_response', reason: 'schema', status: 200 },
        });
      expect(refuse).not.toHaveBeenCalled();
    },
  );
}

const manifestBody = {
  version: 1,
  project: { id: 'project-a', revision: 7 },
  default: ['dev'],
  types: [
    { workItemTypeId: 'story', codes: ['dev'] },
    { workItemTypeId: 'spike', codes: ['dev', 'research'] },
  ],
};
for (const specimen of [
  { name: 'typed mappings', body: manifestBody, valid: true },
  {
    name: 'empty mappings',
    body: { version: 1, project: { id: 'project-a', revision: 0 }, default: [], types: [] },
    valid: true,
  },
  { name: 'another version', body: { ...manifestBody, version: 2 }, valid: false },
  {
    name: 'negative revision',
    body: { ...manifestBody, project: { id: 'project-a', revision: -1 } },
    valid: false,
  },
  {
    name: 'fractional revision',
    body: { ...manifestBody, project: { id: 'project-a', revision: 1.5 } },
    valid: false,
  },
  {
    name: 'unsafe revision',
    body: { ...manifestBody, project: { id: 'project-a', revision: 9007199254740992 } },
    valid: false,
  },
  { name: 'empty code', body: { ...manifestBody, default: [''] }, valid: false },
  {
    name: 'malformed type identity',
    body: { ...manifestBody, types: [{ workItemTypeId: 3, codes: ['dev'] }] },
    valid: false,
  },
]) {
  it(
    'project manifest client decodes ' + specimen.name + ' at its real response boundary',
    async () => {
      const refuse = vi.fn(),
        scope: ResourceScope = {
          organization: { kind: 'active', organizationId: 'org-a' },
          isCurrent: () => true,
          refuse,
        };
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(Response.json(specimen.body))),
      );
      const reply = await browserClient(
        [readProjectStepManifest] as const,
        scope,
      ).readProjectStepManifest({ params: { id: 'project-a' }, query: {} });
      if (specimen.valid)
        expect(reply).toMatchObject({ kind: 'success', status: 200, body: specimen.body });
      else
        expect(reply).toMatchObject({
          kind: 'failure',
          failure: { code: 'invalid_response', reason: 'schema', status: 200 },
        });
      expect(refuse).not.toHaveBeenCalled();
    },
  );
}
