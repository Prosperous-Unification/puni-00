import { expect, it } from 'vitest';

import { WbsRequestError } from '@/lib/wbs-api';

import { failureText, refusalSentence } from './plan-refusal';

it('asks for a project when creating a work package without a destination', () => {
  const refusal = new WbsRequestError({
    kind: 'refusal',
    operation: 'postApiWorkPackages',
    refusal: { error: 'project_required' },
  });
  expect(failureText(refusal, 'unknown')).toBe('project_required');
  expect(refusalSentence(refusal)).toBe('Choose a project before creating a work package.');
});

it('asks for another project when the creation destination is unavailable', () => {
  const refusal = new WbsRequestError({
    kind: 'refusal',
    operation: 'postApiWorkPackages',
    refusal: { error: 'not_found' },
  });
  expect(failureText(refusal, 'unknown')).toBe('not_found');
  expect(refusalSentence(refusal)).toBe(
    'That project is no longer available. Choose another project.',
  );
});

it.each(['invalid_json', 'not_a_member'] as const)(
  'reads the project-list %s refusal through its actual operation',
  (error) => {
    const refusal = new WbsRequestError({
      kind: 'refusal',
      operation: 'getApiProjects',
      refusal: { error },
    });
    expect(failureText(refusal, 'unknown')).toBe(error);
  },
);

it.each([
  { error: 'invalid_query' },
  { error: 'invalid_params' },
  { error: 'invalid_json' },
  { error: 'invalid_body' },
  { error: 'unauthenticated' },
  { error: 'invalid_origin' },
  { error: 'insufficient_scope' },
  { error: 'organization_context_changed' },
  { error: 'no_active_organization' },
  { error: 'not_a_member' },
  { error: 'sso_required', organizationId: 'org', login: '/login', link: true },
  { error: 'reauthentication_required', organizationId: 'org', reason: 'max_session', login: '/login' },
  { error: 'name_taken' },
  { error: 'abbreviation_taken' },
  { error: 'abbreviation_exhausted' },
] as const)('reads the project-create $error refusal through its actual operation', (body) => {
  const refusal = new WbsRequestError({
    kind: 'refusal', operation: 'postApiProjects', refusal: body,
  });
  expect(failureText(refusal, 'unknown')).toBe(body.error);
});

it('describes a project-create permission refusal using organization authority', () => {
  const refusal = new WbsRequestError({
    kind: 'refusal',
    operation: 'postApiProjects',
    refusal: { error: 'forbidden', permission: 'organization.create_project' },
  });
  expect(failureText(refusal, 'unknown')).toBe('forbidden');
  expect(refusalSentence(refusal)).toBe(
    'You do not have permission to create a project in this organization.',
  );
});

it('asks for another project name after a project-create name collision', () => {
  const refusal = new WbsRequestError({
    kind: 'refusal',
    operation: 'postApiProjects',
    refusal: { error: 'name_taken' },
  });
  expect(refusalSentence(refusal)).toBe(
    'A project with that name already exists. Choose another name.',
  );
});
