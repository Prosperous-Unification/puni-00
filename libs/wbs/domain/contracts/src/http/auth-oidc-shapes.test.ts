import { expect, test } from 'bun:test';

import { AUTH_METHODS } from '../auth-methods';
import {
  completeAuth0Link,
  completeOidcLogin,
  listAuthMethods,
  logoutOidcSession,
  refreshOidcSession,
  startAuth0Link,
  startOidcLogin,
} from './auth-oidc-shapes';
import { documentFromShapes } from './document-from-shapes';

test('declares four OIDC operations, open provider queries and empty redirects', () => {
  const shapes = [startOidcLogin, completeOidcLogin, refreshOidcSession, logoutOidcSession];
  expect(shapes.map((shape) => shape.operationId)).toEqual([
    'getApiAuthLogin',
    'getApiAuthOktaCallback',
    'postApiAuthRefresh',
    'postApiAuthLogout',
  ]);
  expect(completeOidcLogin.queryMode).toBe('arbitrary-singleton');
  expect(startOidcLogin.responses).toEqual([{ kind: 'empty', status: 302 }]);
  expect(refreshOidcSession.responses).toEqual([{ kind: 'empty', status: 204 }]);
  expect(
    completeOidcLogin.refusals.filter((refusal) => 'kind' in refusal).map(({ status }) => status),
  ).toEqual([400, 401, 500, 503]);
  const callback = documentFromShapes(shapes).paths['/api/auth/okta/callback']?.['get'];
  expect(callback?.responses['500']).toEqual({ description: 'Refusal' });
  expect(callback?.responses['503']).toEqual({ description: 'Refusal' });
  expect(callback?.parameters).toMatchObject([{ in: 'query', style: 'form', explode: true }]);
});

test('declares a JSON link start and a callback whose outcomes are all redirects', () => {
  const paths = documentFromShapes([startAuth0Link, completeAuth0Link]).paths;
  expect(startAuth0Link.path).toBe('/api/auth/link/auth0');
  expect(completeAuth0Link.path).toBe('/api/auth/link/auth0/callback');
  expect(paths['/api/auth/link/auth0']?.['post']?.responses).toHaveProperty('200');
  expect(paths['/api/auth/link/auth0']?.['post']?.responses).not.toHaveProperty('302');
  expect(paths['/api/auth/link/auth0']?.['post']?.responses).toHaveProperty('401');
  expect(paths['/api/auth/link/auth0']?.['post']?.responses).toHaveProperty('403');
  // Handler outcomes are 302s to `/?auth_link=`; only pre-handler refusals remain.
  expect(completeAuth0Link.refusals.map(({ status }) => status)).toEqual([400, 400, 405]);
  expect(paths['/api/auth/link/auth0/callback']?.['get']?.responses).not.toHaveProperty('409');
});

test('declares the public method list and the login method hint', () => {
  const paths = documentFromShapes([startOidcLogin, listAuthMethods]).paths;
  expect(listAuthMethods.policies).toEqual([]);
  expect(paths['/api/auth/methods']?.['get']?.responses).toHaveProperty('200');
  const methods = { methods: [{ id: 'google', label: 'Continue with Google' }] };
  expect(
    listAuthMethods.responses[0].schema.validator['~standard'].validate(methods),
  ).not.toHaveProperty('issues');
  const hint = startOidcLogin.query.validator['~standard'];
  expect(hint.validate({ method: 'github' })).toEqual({ value: { method: 'github' } });
  expect(hint.validate({})).toEqual({ value: {} });
  expect(hint.validate({ method: 'facebook' })).toHaveProperty('issues');
  for (const { id } of AUTH_METHODS)
    expect(hint.validate({ method: id })).not.toHaveProperty('issues');
  const parameters = paths['/api/auth/login']?.['get']?.parameters ?? [];
  expect(parameters.find(({ name }) => name === 'method')?.schema).toMatchObject({
    enum: AUTH_METHODS.map(({ id }) => id).sort(),
  });
  expect(
    parameters
      .map(({ name, required }) => ({ name, required }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  ).toEqual([
    { name: 'email', required: false },
    { name: 'method', required: false },
    { name: 'organization', required: false },
  ]);
});

test('declares the enterprise login hints with the slug grammar', () => {
  const hint = startOidcLogin.query.validator['~standard'];
  expect(hint.validate({ organization: 'acme-corp' })).toEqual({
    value: { organization: 'acme-corp' },
  });
  expect(hint.validate({ email: 'bob@acme.test' })).toEqual({ value: { email: 'bob@acme.test' } });
  for (const organization of ['ac', 'Acme', 'acme_corp', 'a'.repeat(64)])
    expect(hint.validate({ organization })).toHaveProperty('issues');
});

test('lets a link start carry a method and omit the password', () => {
  const start = startAuth0Link.body.validator['~standard'];
  expect(start.validate({ method: 'google' })).toEqual({ value: { method: 'google' } });
  expect(start.validate({ password: 'p', method: 'email' })).toEqual({
    value: { password: 'p', method: 'email' },
  });
  expect(start.validate({ method: 'facebook' })).toHaveProperty('issues');
});
