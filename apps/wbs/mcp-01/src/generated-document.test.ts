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
  for (const kind of ['addTypedDependency', 'updateTypedDependency']) {
    const typed = commands.items.anyOf.find((arm) => arm.properties.kind.const === kind);
    expect((typed?.properties as { type?: { enum?: string[] } }).type?.enum).toEqual([
      'FF',
      'FS',
      'SS',
    ]);
    for (const field of ['predecessor', 'successor']) {
      const endpoint = (typed?.properties as Record<string, unknown> | undefined)?.[field] as
        { properties?: { projectId?: unknown } } | undefined;
      // Proof: removing projectId from the shared endpoint declaration made
      // this generated MCP contract assertion receive undefined for both scopes.
      expect(endpoint?.properties?.projectId).toEqual({ type: 'string' });
    }
  }
});

test('generated dependency tools publish local aliases, scoped identity rules and stable removal', () => {
  const tool = toolsFromDocument(readDocument()).find(
    (candidate) => candidate.name === 'postApiProjectsByIdCommands',
  );
  if (tool === undefined) throw new Error('Project command tool missing');
  const commands = tool.inputSchema.properties['commands'] as {
    items: {
      anyOf: {
        description: string;
        properties: Record<
          string,
          | {
              const?: string;
              type?: string;
              enum?: string[];
              properties?: Record<string, unknown>;
              required?: string[];
            }
          | undefined
        >;
        required: string[];
      }[];
    };
  };
  for (const kind of ['addTypedDependency', 'updateTypedDependency']) {
    const arm = commands.items.anyOf.find(
      (candidate) => candidate.properties['kind']?.const === kind,
    );
    if (arm === undefined) throw new Error(`Missing ${kind}`);
    expect(arm.description).toContain('projectId');
    expect(arm.description).toContain('workItemRef');
    for (const side of ['predecessor', 'successor']) {
      const endpoint = arm.properties[side];
      expect(endpoint?.properties?.['scope']).toEqual({
        enum: ['descendant-step', 'node', 'whole'],
      });
      expect(endpoint?.properties?.['workItemRef']).toEqual({ type: 'string' });
      expect(endpoint?.required).toEqual(['scope']);
    }
  }
  const remove = commands.items.anyOf.find(
    (candidate) => candidate.properties['kind']?.const === 'removeTypedDependency',
  );
  expect(remove?.required).toEqual(['dependencyId', 'kind']);
  expect(remove?.properties['dependencyId']).toEqual({ type: 'string' });
  for (const kind of ['addDependency', 'removeDependency']) {
    const legacy = commands.items.anyOf.find(
      (candidate) => candidate.properties['kind']?.const === kind,
    );
    expect(legacy?.properties['predecessorRef']).toEqual({ type: 'string' });
  }
});

test('required exclusion drift remains a failure when operational routes are absent', () => {
  const document = documentFromShapes(httpShapes);
  for (const path of Object.keys(document.paths))
    if (path.startsWith('/internal/')) Reflect.deleteProperty(document.paths, path);
  expect(() => toolsFromDocument(document)).toThrow('exclusion list');
});

test('keeps browser organization selection out of the generated MCP tools', () => {
  const names = toolsFromDocument(readDocument()).map((tool) => tool.name);
  expect(names).not.toContain('getApiOrganizationMemberships');
  expect(names).not.toContain('postApiOrganizationActive');
  expect(names).not.toContain('getApiOrganizationActive');
});

test('keeps provisioning-token administration out of the generated MCP tools', () => {
  const names = toolsFromDocument(readDocument()).map((tool) => tool.name);
  for (const operation of [
    'getApiOrganizationProvisioningTokens',
    'postApiOrganizationProvisioningTokens',
    'postApiOrganizationProvisioningTokensByIdRotate',
    'deleteApiOrganizationProvisioningTokensById',
  ])
    expect(names).not.toContain(operation);
});

test('keeps machine credential administration out of the generated MCP tools', () => {
  const names = toolsFromDocument(readDocument()).map((tool) => tool.name);
  for (const operation of [
    'getApiOrganizationMachine-credentials',
    'postApiOrganizationMachine-credentials',
    'postApiOrganizationMachine-credentialsByIdRotate',
    'deleteApiOrganizationMachine-credentialsById',
  ])
    expect(names).not.toContain(operation);
});

test('keeps trusted issuer administration out of the generated MCP tools', () => {
  const names = toolsFromDocument(readDocument()).map((tool) => tool.name);
  for (const operation of [
    'getApiOrganizationTrusted-issuers',
    'postApiOrganizationTrusted-issuers',
    'deleteApiOrganizationTrusted-issuersById',
  ])
    expect(names).not.toContain(operation);
});

test('keeps compute provider administration and capacity reports out of the generated MCP tools', () => {
  const names = toolsFromDocument(readDocument()).map((tool) => tool.name);
  for (const operation of [
    'getApiOrganizationCompute-providers',
    'postApiOrganizationCompute-providers',
    'patchApiOrganizationCompute-providersById',
    'deleteApiOrganizationCompute-providersById',
    'putApiCompute-providersByProviderIdResourcesByResourceIdCapacity-report',
  ])
    expect(names).not.toContain(operation);
});

test('pins every generated MCP operation name independently of the registry', () => {
  // Proof: removing importProject from httpShapes failed with
  // `postApiProjectsImport` as the one expected-only operation.
  expect(
    toolsFromDocument(readDocument())
      .map((tool) => tool.name)
      .sort(),
  ).toEqual([
    'deleteApiOrganizationDomainsById',
    'deleteApiOrganizationInvitationsById',
    'deleteApiOrganizationMembersByUserId',
    'deleteApiOrganizationSso-connectionsById',
    'deleteApiProjectsByIdCalendar-markersByMarkerId',
    'deleteApiProjectsByIdStepsByStepId',
    'deleteApiSaved-plansById',
    'deleteApiSpacesById',
    'deleteApiSpacesByIdProjectsByProjectId',
    'getApiExternal-systems',
    'getApiOnboarding',
    'getApiOrganization',
    'getApiOrganizationDomains',
    'getApiOrganizationInvitations',
    'getApiOrganizationJoinRequests',
    'getApiOrganizationLimits',
    'getApiOrganizationMembers',
    'getApiOrganizationProject-rank',
    'getApiOrganizationSession-policy',
    'getApiOrganizationSso-connections',
    'getApiPeople',
    'getApiPeopleByPersonIdLoad',
    'getApiPeopleLoad',
    'getApiProjectAddressesProjects',
    'getApiProjects',
    'getApiProjectsById',
    'getApiProjectsByIdAddressCandidates',
    'getApiProjectsByIdAddressReferences',
    'getApiProjectsByIdCalendar-markers',
    'getApiProjectsByIdExport',
    'getApiProjectsByIdHistory',
    'getApiProjectsByIdPeopleByPersonIdWork',
    'getApiProjectsByIdResources',
    'getApiProjectsByIdSaved-plans',
    'getApiProjectsByIdSaved-plansCompare',
    'getApiProjectsByIdStartable',
    'getApiProjectsByIdStep-references',
    'getApiProjectsByIdWork-item-rows',
    'getApiProjectsByIdWork-items',
    'getApiProjectsByIdWork-itemsByWorkItemId',
    'getApiSaved-plansById',
    'getApiServices',
    'getApiSpaces',
    'getApiSpacesById',
    'getApiSpacesByIdIn-progress',
    'getApiSpacesByIdRoll-ups',
    'getApiTags',
    'getApiTeams',
    'getApiTimezones',
    'getApiWork-item-types',
    'getPlansBy-solutionBySlug',
    'patchApiOrganization',
    'patchApiOrganizationMembersByUserId',
    'patchApiOrganizationSso-connectionsById',
    'patchApiProjectsById',
    'patchApiProjectsByIdCalendar-markersByMarkerId',
    'patchApiProjectsByIdStepsByStepId',
    'patchApiSaved-plansById',
    'patchApiSpacesById',
    'postApiDirectoryCommands',
    'postApiOnboardingEmailChallenges',
    'postApiOnboardingEmailChallengesConfirm',
    'postApiOnboardingInvitationsAccept',
    'postApiOnboardingJoinRequests',
    'postApiOnboardingOrganizations',
    'postApiOrganizationDomainsByIdRotate',
    'postApiOrganizationDomainsByIdVerify',
    'postApiOrganizationDomainsChallenges',
    'postApiOrganizationInvitations',
    'postApiOrganizationJoinRequestsByIdApprove',
    'postApiOrganizationJoinRequestsByIdDeny',
    'postApiOrganizationProjectsByIdRank',
    // Proof: removing approveSharedPeopleRestore only from production httpShapes made
    // this pin fail with this operation expected-only (0 pass, 1 fail), 2026-10-14.
    'postApiOrganizationSharedPeopleRestoreApprovals',
    'postApiOrganizationSso-connections',
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
    'postApiSpaces',
    'postApiSpacesByIdProjects',
    'postApiSpacesByIdProjectsByProjectIdMove',
    'putApiOrganizationSession-policy',
  ]);
});

test('refuses a generated operation whose name was lost before MCP derivation', () => {
  const document = documentFromShapes(httpShapes);
  const operation = document.paths['/api/projects']?.['post'];
  if (operation === undefined) throw new Error('project creation fixture missing');
  Reflect.deleteProperty(operation, 'operationId');
  expect(() => toolsFromDocument(document)).toThrow('no operationId');
});

test('keeps runtime dependency capability in the document and out of generated MCP tools', () => {
  const document = documentFromShapes(httpShapes);
  expect(document.paths['/api/runtime/dependency-capability']?.['get']?.operationId).toBe(
    'getDependencyCapability',
  );
  expect(toolsFromDocument(document).map((tool) => tool.name)).not.toContain(
    'getDependencyCapability',
  );
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

test('keeps browser current-context discovery out of generated MCP tools', () => {
  const names = toolsFromDocument(documentFromShapes(httpShapes)).map((tool) => tool.name);
  expect(names).not.toContain('getApiOrganizationActive');
});

test('generated command and startable documents expose execution prerequisites', () => {
  const document = readDocument();
  const paths = document.paths;
  if (paths === undefined) throw new Error('Generated document paths are missing');
  const serialized = JSON.stringify(paths['/api/projects/{id}/commands']);
  expect(serialized).toContain('prerequisites_unmet');
  expect(serialized).toContain('relationshipId');
  expect(JSON.stringify(paths['/api/projects/{id}/startable'])).toContain('finishBlockers');
});
