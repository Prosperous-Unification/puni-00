import { documentFromShapes, httpShapes } from '@wbs/contracts';
import { expect, test } from 'bun:test';

import { readDocument, toolsFromDocument } from './openapi-tools';

test('default MCP document is generated directly from the shared declarations', () => {
  expect(readDocument()).toEqual(documentFromShapes(httpShapes));
  const tools = toolsFromDocument(readDocument());
  expect(tools.map((tool) => tool.name)).toContain('postApiProjectsByIdCommands');
  expect(tools.map((tool) => tool.name)).toContain('getApiProjectsByIdSaved-plansCompare');
});

test('generated project command tool exposes addTypedDependency with endpoints', () => {
  const tool = toolsFromDocument(readDocument()).find(
    (candidate) => candidate.name === 'postApiProjectsByIdCommands',
  );
  if (tool === undefined) throw new Error('Project command tool missing');
  const commands = tool.inputSchema.properties['commands'] as {
    items: {
      anyOf: {
        properties: { kind: { const: string }; predecessor?: unknown; successor?: unknown };
        required: string[];
      }[];
    };
  };
  const add = commands.items.anyOf.find(
    (arm) => arm.properties.kind.const === 'addTypedDependency',
  );
  for (const field of ['kind', 'predecessor', 'successor', 'type'])
    expect(add?.required).toContain(field);
  expect(add?.properties.predecessor).toBeDefined();
  expect(add?.properties.successor).toBeDefined();
});

test('required exclusion drift remains a failure when operational routes are absent', () => {
  const document = documentFromShapes(httpShapes);
  for (const path of Object.keys(document.paths))
    if (path.startsWith('/internal/')) Reflect.deleteProperty(document.paths, path);
  expect(() => toolsFromDocument(document)).toThrow('exclusion list');
});

test('pins every generated MCP operation name independently of the registry', () => {
  // Proof: removing importProject from httpShapes failed with
  // `postApiProjectsImport` as the one expected-only operation.
  expect(
    toolsFromDocument(readDocument())
      .map((tool) => tool.name)
      .sort(),
  ).toEqual([
    'deleteApiOrganizationMembersByUserId',
    'deleteApiProjectsByIdCalendar-markersByMarkerId',
    'deleteApiProjectsByIdStepsByStepId',
    'deleteApiSaved-plansById',
    'getApiExternal-systems',
    'getApiOnboarding',
    'getApiPeople',
    'getApiProjects',
    'getApiProjectsById',
    'getApiProjectsByIdCalendar-markers',
    'getApiProjectsByIdExport',
    'getApiProjectsByIdHistory',
    'getApiProjectsByIdSaved-plans',
    'getApiProjectsByIdSaved-plansCompare',
    'getApiProjectsByIdStep-references',
    'getApiProjectsByIdWork-items',
    'getApiSaved-plansById',
    'getApiServices',
    'getApiTags',
    'getApiTeams',
    'getApiWork-item-types',
    'getPlansBy-solutionBySlug',
    'patchApiOrganizationMembersByUserId',
    'patchApiProjectsById',
    'patchApiProjectsByIdCalendar-markersByMarkerId',
    'patchApiProjectsByIdStepsByStepId',
    'patchApiSaved-plansById',
    'postApiDirectoryCommands',
    'postApiOnboardingJoinRequests',
    'postApiOnboardingOrganizations',
    'postApiProjects',
    'postApiProjectsByIdCalendar-markers',
    'postApiProjectsByIdCommands',
    'postApiProjectsByIdOpened',
    'postApiProjectsByIdOptimizationRetry',
    'postApiProjectsByIdRedo',
    'postApiProjectsByIdSaved-plans',
    'postApiProjectsByIdSteps',
    'postApiProjectsByIdUndo',
    'postApiProjectsImport',
  ]);
});

test('refuses a generated operation whose name was lost before MCP derivation', () => {
  const document = documentFromShapes(httpShapes);
  const operation = document.paths['/api/projects']?.['post'];
  if (operation === undefined) throw new Error('project creation fixture missing');
  Reflect.deleteProperty(operation, 'operationId');
  expect(() => toolsFromDocument(document)).toThrow('no operationId');
});

test('optional operational deny paths cannot become tools in external documents', () => {
  const document = documentFromShapes(httpShapes);
  document.paths['/health'] = {
    get: { operationId: 'getHealth', summary: 'Health', parameters: [], responses: {} },
  };
  document.paths['/metrics'] = {
    get: { operationId: 'getMetrics', summary: 'Metrics', parameters: [], responses: {} },
  };
  expect(toolsFromDocument(document).map((tool) => tool.name)).not.toContain('getHealth');
  expect(toolsFromDocument(document).map((tool) => tool.name)).not.toContain('getMetrics');
});
