import { expect, test } from 'bun:test';

import {
  completeAuth0Link,
  completeOidcLogin,
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
  ).toEqual([400, 401, 409, 500, 503]);
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
