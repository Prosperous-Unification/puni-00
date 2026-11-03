import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { documentFromShapes, type EndpointShape } from '@wbs/contracts';
import { expect, test } from 'bun:test';

import { readDocument, toolsFromDocument } from './openapi-tools';

function subset() {
  const declarations: EndpointShape[] = (
    [
      ['/api/auth/fixture', 'getAuth'],
      ['/internal/fixture', 'getInternal'],
      ['/api/smoke/echo', 'getSmoke'],
      ['/api/organization/active', 'getActive'],
      ['/api/organization/memberships', 'getMembers'],
      ['/api/fixture', 'getPublic'],
    ] as const
  ).map(([path, operationId]) => {
    return {
      method: 'GET',
      path,
      operationId,
      ...(operationId === 'getMembers' ? { humanOnly: true as const } : {}),
      policies: [],
      responses: [{ kind: 'empty', status: 204 }],
      refusals: [],
      document: { summary: operationId },
    };
  });
  return documentFromShapes(declarations);
}

test('generated subset policy excludes the protected operation through the artifact reader', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mcp-policy-owner-'));
  try {
    const path = join(directory, 'openapi.json');
    writeFileSync(path, JSON.stringify(subset()));
    expect(toolsFromDocument(readDocument(path)).map((tool) => tool.name)).toEqual(['getPublic']);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('otherwise derivable subset refuses missing and malformed policy before protected tools', () => {
  const document = subset();
  for (const policy of [
    undefined,
    null,
    {},
    [null],
    [{ method: 'get', path: '/api/organization/memberships', operationId: '' }],
  ]) {
    expect(() => toolsFromDocument({ ...document, 'x-wbs-human-only-operations': policy })).toThrow(
      'human-only operation policy',
    );
  }
});

test('malformed policy records receive the modeled record refusal at the consumer boundary', () => {
  for (const record of [null, 1, [], {}]) {
    expect(() =>
      toolsFromDocument({ ...subset(), 'x-wbs-human-only-operations': [record] }),
    ).toThrow('invalid human-only operation policy record');
  }
});

test('blank policy operation identity receives the modeled field refusal before derivation', () => {
  expect(() =>
    toolsFromDocument({
      ...subset(),
      'x-wbs-human-only-operations': [
        { method: 'get', path: '/api/organization/memberships', operationId: '' },
      ],
    }),
  ).toThrow('invalid human-only operation policy fields');
});

test('production derivation consumes the policy from its same emitted artifact', () => {
  const document = readDocument();
  const tools = toolsFromDocument(document);
  expect(tools.length).toBeGreaterThan(0);
  expect(tools.map((tool) => tool.name)).not.toContain('getApiOrganizationMemberships');
});

test('production derivation refuses absent or malformed same-artifact policy', () => {
  const document = readDocument();
  for (const policy of [
    undefined,
    null,
    {},
    [null],
    [{ method: 'GET', path: '/api/organization/memberships', operationId: 'members' }],
    [{ method: 'get', path: 1, operationId: 'members' }],
    [{ method: 'get', path: '/api/organization/memberships', operationId: '' }],
  ]) {
    expect(() => toolsFromDocument({ ...document, 'x-wbs-human-only-operations': policy })).toThrow(
      'human-only operation policy',
    );
  }
});
