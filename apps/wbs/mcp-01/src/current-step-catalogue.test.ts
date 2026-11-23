import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { JsonSchemaType } from '@modelcontextprotocol/sdk/validation';
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/cfworker';
import { documentFromShapes, httpShapes } from '@wbs/contracts';
import { expect, test } from 'bun:test';

import type { McpConfig } from './config';
import {
  type DerivedTool,
  humanOnlyOperationsOf,
  type OpenApiDocument,
  readDocument,
  toolsFromDocument,
} from './openapi-tools';
import { buildRequest, ToolInputRefused } from './wbs-client';

const CONFIG: McpConfig = {
  MCP_AUTH_MODE: 'standalone',
  WBS_API_URL: 'https://wbs.test',
  MCP_PUBLIC_URL: 'https://wbs.test/mcp',
  MCP_TRUSTED_PROXY_HOPS: 0,
};
const CALLER_HEADERS = {
  authorization: 'Bearer caller-token',
  'X-WBS-Dependency-Semantics': 'cross-project-dependencies-v1',
};
const CATALOGUE_NAMES = [
  'listStepCatalogue',
  'bindCatalogueStep',
  'patchStepDefinition',
  'retireStepDefinition',
  'unbindCatalogueStep',
  'reorderCatalogueBindings',
  'readProjectSteps',
  'readProjectStepUsage',
  'readProjectStepManifest',
];
const RETIRED_NAMES = [
  'postApiWorkPackagesByIdSteps',
  'patchApiWorkPackagesByIdStepsByStepId',
  'deleteApiWorkPackagesByIdStepsByStepId',
];

test('current MCP imports preserve optional definition mode and grouped unknown-code refusals', () => {
  runCurrentDocumentCase((captured, emitted) => {
    const tool = readTool(toolsFromDocument(captured), 'postApiWorkPackagesImport');
    expect(tool.locations).toEqual({
      projectId: 'body',
      document: 'body',
      defineMissing: 'body',
    });
    expect(tool.inputSchema.required).toEqual(['document', 'projectId']);
    const validator = new CfWorkerJsonSchemaValidator();
    const validate = validator.getValidator(tool.inputSchema as JsonSchemaType);
    const base = { projectId: 'project-a', document: { archival: true } };
    for (const additions of [{}, { defineMissing: false }, { defineMissing: true }]) {
      const body = { ...base, ...additions };
      expect(validate(body).valid).toBe(true);
      expect(buildRequest(tool, body, CONFIG, 'caller-token')).toEqual({
        method: 'POST',
        url: 'https://wbs.test/api/work-packages/import',
        headers: { ...CALLER_HEADERS, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    for (const defineMissing of ['true', 1, null, [], {}])
      expect(validate({ ...base, defineMissing }).valid).toBe(false);
    expect(validate({ ...base, typo: true }).valid).toBe(false);
    const refusalSchema =
      emitted.paths['/api/work-packages/import']?.['post']?.responses['422']?.content?.[
        'application/json'
      ]?.schema;
    if (refusalSchema === undefined)
      throw new Error('Current import semantic refusal schema is absent');
    const validateRefusal = validator.getValidator(refusalSchema as JsonSchemaType);
    expect(validateRefusal({ error: 'retired_step_codes', codes: ['impl'] }).valid).toBe(true);
    expect(validateRefusal({ error: 'retired_step_codes' }).valid).toBe(false);
    expect(validateRefusal({ error: 'unknown_step_codes', codes: ['qa', 'impl'] }).valid).toBe(
      true,
    );
    expect(validateRefusal({ error: 'unknown_step_codes' }).valid).toBe(false);
    for (const codes of [null, 'impl', [1]])
      expect(validateRefusal({ error: 'unknown_step_codes', codes }).valid).toBe(false);
  });
}, 10000);

/** Actual current declarations and public disk reader, independently of any retained/default generated artifact epoch. */
function runCurrentDocumentCase<Value>(
  observe: (captured: OpenApiDocument, emitted: ReturnType<typeof documentFromShapes>) => Value,
): Value {
  const emitted = documentFromShapes(httpShapes);
  expect(emitted.paths['/api/organization/steps']?.['get']?.operationId).toBe('listStepCatalogue');
  expect(emitted.paths['/api/organization/step-bindings']?.['post']?.operationId).toBe(
    'bindCatalogueStep',
  );
  expect(emitted.paths['/api/organization/steps/{stepId}']?.['patch']?.operationId).toBe(
    'patchStepDefinition',
  );
  expect(emitted.paths['/api/organization/steps/{stepId}']?.['delete']?.operationId).toBe(
    'retireStepDefinition',
  );
  expect(emitted.paths['/api/work-packages/{id}/steps/{stepId}']?.['patch']?.operationId).toBe(
    'patchWorkPackageStepValues',
  );
  expect(emitted.paths['/api/work-packages/{id}/steps']?.['post']).toBeUndefined();
  expect(emitted.paths['/api/work-packages/{id}/steps/{stepId}']?.['delete']).toBeUndefined();
  const directory = mkdtempSync(join(tmpdir(), 'puni current MCP catalogue ')),
    path = join(directory, 'current-openapi.json');
  let observed: { ok: true; value: Value } | { ok: false; cause: unknown };
  try {
    writeFileSync(path, JSON.stringify(emitted));
    const captured = readDocument(path);
    expect(JSON.stringify(captured)).toBe(JSON.stringify(emitted));
    observed = { ok: true, value: observe(captured, emitted) };
  } catch (cause: unknown) {
    observed = { ok: false, cause };
  }
  try {
    rmSync(directory, { recursive: true });
  } catch (cleanup: unknown) {
    if (!observed.ok)
      throw new AggregateError(
        [observed.cause, cleanup],
        'current MCP catalogue observation and fixture cleanup failed',
        { cause: cleanup },
      );
    throw cleanup;
  }
  if (!observed.ok) throw observed.cause;
  return observed.value;
}

function readTool(tools: readonly DerivedTool[], name: string): DerivedTool {
  const selected = tools.find((tool) => tool.name === name);
  if (selected === undefined) throw new Error('current generated MCP tool is absent: ' + name);
  return selected;
}
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function readRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error(label + ' must be an object');
  return value;
}

test('current MCP derives the nine catalogue tools and addressed package values without retired step mutations', () => {
  runCurrentDocumentCase((captured) => {
    // Current descriptor/disk-reader premises above precede the actual production derivation boundary.
    const tools = toolsFromDocument(captured),
      names = tools.map((tool) => tool.name);
    expect(
      tools
        .filter((tool) => CATALOGUE_NAMES.includes(tool.name))
        .map(({ name, method, path }) => ({ name, method, path }))
        .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0)),
    ).toEqual([
      { name: 'bindCatalogueStep', method: 'post', path: '/api/organization/step-bindings' },
      { name: 'listStepCatalogue', method: 'get', path: '/api/organization/steps' },
      { name: 'patchStepDefinition', method: 'patch', path: '/api/organization/steps/{stepId}' },
      {
        name: 'readProjectStepManifest',
        method: 'get',
        path: '/api/projects/{id}/step-manifest',
      },
      {
        name: 'readProjectStepUsage',
        method: 'get',
        path: '/api/projects/{id}/step-nodes-in-use',
      },
      { name: 'readProjectSteps', method: 'get', path: '/api/projects/{id}/steps' },
      {
        name: 'reorderCatalogueBindings',
        method: 'post',
        path: '/api/organization/step-bindings/reorder',
      },
      {
        name: 'retireStepDefinition',
        method: 'delete',
        path: '/api/organization/steps/{stepId}',
      },
      {
        name: 'unbindCatalogueStep',
        method: 'delete',
        path: '/api/organization/step-bindings/{bindingId}',
      },
    ]);
    expect(names).toContain('patchWorkPackageStepValues');
    for (const name of RETIRED_NAMES) expect(names).not.toContain(name);
    const humanOnly = humanOnlyOperationsOf(captured).map((operation) => operation.operationId);
    for (const name of CATALOGUE_NAMES) expect(humanOnly).not.toContain(name);
    const listed = readTool(tools, 'listStepCatalogue');
    expect(listed.locations).toEqual({});
    expect(listed.inputSchema.properties).toEqual({});
    expect(listed.inputSchema.required).toBeUndefined();
    expect(listed.inputSchema.additionalProperties).toBe(false);
  });
}, 10000);

test('current MCP retains the catalogue binding body union and both actual request alternatives', () => {
  runCurrentDocumentCase((captured, emitted) => {
    const body = readRecord(
      emitted.paths['/api/organization/step-bindings']?.['post']?.requestBody?.content[
        'application/json'
      ]?.schema,
      'current binding body',
    );
    const constraints = ['anyOf', 'oneOf', 'allOf', 'not'].filter((keyword) =>
      Object.hasOwn(body, keyword),
    );
    expect(constraints.length).toBeGreaterThan(0);
    const tool = readTool(toolsFromDocument(captured), 'bindCatalogueStep');
    expect(tool.locations).toEqual({
      scopeKind: 'body',
      scopeId: 'body',
      position: 'body',
      workItemTypeId: 'body',
      stepId: 'body',
      define: 'body',
    });
    expect(Object.keys(tool.inputSchema.properties).sort()).toEqual([
      'define',
      'position',
      'scopeId',
      'scopeKind',
      'stepId',
      'workItemTypeId',
    ]);
    expect(tool.inputSchema.type).toBe('object');
    expect(tool.inputSchema.additionalProperties).toBe(false);
    const input = readRecord(tool.inputSchema, 'derived binding input');
    for (const keyword of constraints) expect(input[keyword]).toEqual(body[keyword]);
    const existing = {
      scopeKind: 'project',
      scopeId: 'project-a',
      position: 20,
      workItemTypeId: null,
      stepId: 'shared-step',
    };
    const defined = {
      scopeKind: 'organization',
      scopeId: 'org-a',
      position: 10,
      workItemTypeId: null,
      define: {
        code: 'new-step',
        name: 'New step',
        position: 30,
        defaultEstimateUnit: 'minutes',
        defaultAllowanceBps: 1234,
      },
    };
    for (const body of [existing, defined])
      expect(buildRequest(tool, body, CONFIG, 'caller-token')).toEqual({
        method: 'POST',
        url: 'https://wbs.test/api/organization/step-bindings',
        headers: { ...CALLER_HEADERS, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
  });
}, 10000);

test('current MCP forwards package-specific unit and allowance at their two-key path and refuses definition fields', () => {
  runCurrentDocumentCase((captured) => {
    const tool = readTool(toolsFromDocument(captured), 'patchWorkPackageStepValues');
    expect({ method: tool.method, path: tool.path, locations: tool.locations }).toEqual({
      method: 'patch',
      path: '/api/work-packages/{id}/steps/{stepId}',
      locations: { id: 'path', stepId: 'path', estimateUnit: 'body', allowanceBps: 'body' },
    });
    expect(tool.inputSchema.required).toEqual(['id', 'stepId']);
    expect(Object.keys(tool.inputSchema.properties).sort()).toEqual([
      'allowanceBps',
      'estimateUnit',
      'id',
      'stepId',
    ]);
    expect(tool.inputSchema.properties['estimateUnit']).toEqual({
      enum: ['minutes', 'workdays'],
    });
    expect(tool.inputSchema.additionalProperties).toBe(false);
    for (const values of [
      { estimateUnit: 'minutes' },
      { allowanceBps: 1234 },
      { estimateUnit: 'workdays', allowanceBps: 2500 },
    ]) {
      expect(
        buildRequest(
          tool,
          { id: 'package-a', stepId: 'shared-step', ...values },
          CONFIG,
          'caller-token',
        ),
      ).toEqual({
        method: 'PATCH',
        url: 'https://wbs.test/api/work-packages/package-a/steps/shared-step',
        headers: { ...CALLER_HEADERS, 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
    }
    let refused: unknown;
    try {
      buildRequest(
        tool,
        { id: 'package-a', stepId: 'shared-step', name: 'Not a package value' },
        CONFIG,
        'caller-token',
      );
    } catch (cause: unknown) {
      refused = cause;
    }
    expect(refused).toBeInstanceOf(ToolInputRefused);
  });
}, 10000);

test('current MCP catalogue metadata and retirement calls preserve their actual methods paths and caller credential', () => {
  runCurrentDocumentCase((captured) => {
    const tools = toolsFromDocument(captured),
      listed = readTool(tools, 'listStepCatalogue'),
      patched = readTool(tools, 'patchStepDefinition'),
      retired = readTool(tools, 'retireStepDefinition');
    expect(buildRequest(listed, {}, CONFIG, 'caller-token')).toEqual({
      method: 'GET',
      url: 'https://wbs.test/api/organization/steps',
      headers: CALLER_HEADERS,
    });
    expect(patched.locations).toEqual({
      stepId: 'path',
      name: 'body',
      defaultEstimateUnit: 'body',
      defaultAllowanceBps: 'body',
    });
    expect(patched.inputSchema.required).toEqual(['stepId']);
    const body = {
      name: 'Renamed shared definition',
      defaultEstimateUnit: 'minutes',
      defaultAllowanceBps: 4500,
    };
    expect(
      buildRequest(patched, { stepId: 'shared-step', ...body }, CONFIG, 'caller-token'),
    ).toEqual({
      method: 'PATCH',
      url: 'https://wbs.test/api/organization/steps/shared-step',
      headers: { ...CALLER_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(retired.locations).toEqual({ stepId: 'path' });
    expect(buildRequest(retired, { stepId: 'shared-step' }, CONFIG, 'caller-token')).toEqual({
      method: 'DELETE',
      url: 'https://wbs.test/api/organization/steps/shared-step',
      headers: CALLER_HEADERS,
    });
  });
}, 10000);

test('current MCP binding tool preserves the real SDK validator truth table for existing versus defined steps', () => {
  runCurrentDocumentCase((captured, emitted) => {
    const schema =
      emitted.paths['/api/organization/step-bindings']?.['post']?.requestBody?.content[
        'application/json'
      ]?.schema;
    if (schema === undefined) throw new Error('actual binding body schema is absent');
    const common = {
      scopeKind: 'project',
      scopeId: 'project-a',
      position: 10,
      workItemTypeId: null,
    };
    const define = {
      code: 'dev',
      name: 'Development',
      position: 10,
      defaultEstimateUnit: 'minutes',
      defaultAllowanceBps: 1234,
    };
    const inputs = [
      { ...common, stepId: 'step-a' },
      { ...common, define },
      { ...common, stepId: 'step-a', define },
      common,
      { ...common, stepId: 'step-a', unknown: true },
    ];
    const validator = new CfWorkerJsonSchemaValidator();
    const original = validator.getValidator(schema as JsonSchemaType);
    expect(inputs.map((input) => original(input).valid)).toEqual([true, true, false, false, false]);
    const tool = readTool(toolsFromDocument(captured), 'bindCatalogueStep');
    const derived = validator.getValidator(tool.inputSchema as JsonSchemaType);
    expect(inputs.map((input) => derived(input).valid)).toEqual([true, true, false, false, false]);
  });
}, 10000);

test('current MCP forwards engagement-project creation with its optional first work package', () => {
  runCurrentDocumentCase((captured) => {
    const tool = readTool(toolsFromDocument(captured), 'postApiProjects');
    const body = { name: 'Roadmap', workPackage: { name: 'Delivery' } };
    expect(tool.locations).toEqual({ name: 'body', workPackage: 'body' });
    const validate = new CfWorkerJsonSchemaValidator().getValidator(
      tool.inputSchema as JsonSchemaType,
    );
    expect(validate(body).valid).toBe(true);
    expect(validate({ name: 'Roadmap', workPackage: {} }).valid).toBe(false);
    expect(buildRequest(tool, body, CONFIG, 'caller-token')).toEqual({
      method: 'POST',
      url: 'https://wbs.test/api/projects',
      headers: { ...CALLER_HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  });
}, 10000);

test('current MCP unbind carries explicit preview/apply mode on the stored binding address', () => {
  runCurrentDocumentCase((captured) => {
    const tool = readTool(toolsFromDocument(captured), 'unbindCatalogueStep');
    expect(tool.locations).toEqual({ bindingId: 'path', dryRun: 'body' });
    expect(tool.inputSchema.required).toEqual(['bindingId', 'dryRun']);
    const validate = new CfWorkerJsonSchemaValidator().getValidator(
      tool.inputSchema as JsonSchemaType,
    );
    expect(validate({ bindingId: 'binding-a' }).valid).toBe(false);
    expect(validate({ bindingId: 'binding-a', dryRun: 'true' }).valid).toBe(false);
    for (const dryRun of [true, false]) {
      expect(validate({ bindingId: 'binding-a', dryRun }).valid).toBe(true);
      expect(
        buildRequest(tool, { bindingId: 'binding-a', dryRun }, CONFIG, 'caller-token'),
      ).toEqual({
        method: 'DELETE',
        url: 'https://wbs.test/api/organization/step-bindings/binding-a',
        headers: { ...CALLER_HEADERS, 'content-type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
    }
  });
}, 10000);

test('current MCP reorder advertises complete scope census and preserves the caller request', () => {
  runCurrentDocumentCase((captured) => {
    const tool = readTool(toolsFromDocument(captured), 'reorderCatalogueBindings');
    expect(tool.locations).toEqual({ scopeKind: 'body', scopeId: 'body', ids: 'body' });
    expect(tool.inputSchema.required?.slice().sort()).toEqual(['ids', 'scopeId', 'scopeKind']);
    const validate = new CfWorkerJsonSchemaValidator().getValidator(
      tool.inputSchema as JsonSchemaType,
    );
    for (const input of [
      { scopeKind: 'project', scopeId: 'project-a' },
      { scopeKind: 'work_package', scopeId: 'project-a', ids: [] },
      { scopeKind: 'project', scopeId: 'project-a', ids: [3] },
      { scopeKind: 'project', scopeId: 'project-a', ids: [''] },
    ])
      expect(validate(input).valid).toBe(false);
    for (const scopeKind of ['organization', 'space', 'project'])
      for (const ids of [[], ['binding-b', 'binding-a']]) {
        const body = { scopeKind, scopeId: 'scope-a', ids };
        expect(validate(body).valid).toBe(true);
        expect(buildRequest(tool, body, CONFIG, 'caller-token')).toEqual({
          method: 'POST',
          url: 'https://wbs.test/api/organization/step-bindings/reorder',
          headers: { ...CALLER_HEADERS, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
  });
}, 10000);

test('current MCP project steps preserves optional type lookup on the actual project address', () => {
  runCurrentDocumentCase((captured) => {
    const tool = readTool(toolsFromDocument(captured), 'readProjectSteps');
    expect(tool.locations).toEqual({ id: 'path', type: 'query' });
    expect(tool.inputSchema.required).toEqual(['id']);
    const validate = new CfWorkerJsonSchemaValidator().getValidator(
      tool.inputSchema as JsonSchemaType,
    );
    expect(validate({ id: 'project-a' }).valid).toBe(true);
    expect(validate({ id: 'project-a', type: 'type-a' }).valid).toBe(true);
    for (const input of [
      { type: 'type-a' },
      { id: 'project-a', type: '' },
      { id: 'project-a', type: 3 },
    ])
      expect(validate(input).valid).toBe(false);
    expect(buildRequest(tool, { id: 'project-a' }, CONFIG, 'caller-token')).toEqual({
      method: 'GET',
      url: 'https://wbs.test/api/projects/project-a/steps',
      headers: CALLER_HEADERS,
    });
    expect(buildRequest(tool, { id: 'project-a', type: 'type-a' }, CONFIG, 'caller-token')).toEqual(
      {
        method: 'GET',
        url: 'https://wbs.test/api/projects/project-a/steps?type=type-a',
        headers: CALLER_HEADERS,
      },
    );
  });
}, 10000);

test('current MCP project usage requires its step query and preserves the actual project address', () => {
  runCurrentDocumentCase((captured) => {
    const tool = readTool(toolsFromDocument(captured), 'readProjectStepUsage');
    expect(tool.locations).toEqual({ id: 'path', stepId: 'query' });
    expect(tool.inputSchema.required?.slice().sort()).toEqual(['id', 'stepId']);
    const validate = new CfWorkerJsonSchemaValidator().getValidator(
      tool.inputSchema as JsonSchemaType,
    );
    for (const input of [
      { id: 'project-a' },
      { stepId: 'step-a' },
      { id: 'project-a', stepId: '' },
      { id: 'project-a', stepId: 3 },
    ])
      expect(validate(input).valid).toBe(false);
    expect(validate({ id: 'project-a', stepId: 'step-a' }).valid).toBe(true);
    expect(
      buildRequest(tool, { id: 'project-a', stepId: 'step-a' }, CONFIG, 'caller-token'),
    ).toEqual({
      method: 'GET',
      url: 'https://wbs.test/api/projects/project-a/step-nodes-in-use?stepId=step-a',
      headers: CALLER_HEADERS,
    });
  });
}, 10000);

test('current MCP project manifest preserves its actual project address without accepting revision or type arguments', () => {
  runCurrentDocumentCase((captured) => {
    const tool = readTool(toolsFromDocument(captured), 'readProjectStepManifest');
    expect(tool.locations).toEqual({ id: 'path' });
    expect(tool.inputSchema.required).toEqual(['id']);
    const validate = new CfWorkerJsonSchemaValidator().getValidator(
      tool.inputSchema as JsonSchemaType,
    );
    expect(validate({ id: 'project-a' }).valid).toBe(true);
    for (const input of [
      {},
      { id: '' },
      { id: 'project-a', type: 'type-a' },
      { id: 'project-a', revision: 7 },
    ])
      expect(validate(input).valid).toBe(false);
    expect(buildRequest(tool, { id: 'project-a' }, CONFIG, 'caller-token')).toEqual({
      method: 'GET',
      url: 'https://wbs.test/api/projects/project-a/step-manifest',
      headers: CALLER_HEADERS,
    });
  });
}, 10000);
