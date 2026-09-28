import { expect, test } from 'bun:test';
import { generateKeyPair } from 'jose';

import { OrganizationHarness } from '../testing/organization-harness';

test('context route stays inert before activation and production binding', async () => {
  const harness = OrganizationHarness.open();
  try {
    await harness.register('ada');
    harness.organization('org-a');
    harness.member('org-a', 'ada', 'member');
    expect(
      await harness.call('ada', 'POST', '/api/auth/context', { organizationId: 'org-a' }),
    ).toEqual({
      status: 403,
      body: { error: 'context_inactive' },
    });
    harness.activate();
    expect(
      await harness.call('ada', 'POST', '/api/auth/context', {
        organizationId: 'org-a',
        audience: 'wbs-be-01/via-mcp-01',
      }),
    ).toEqual({ status: 400, body: { error: 'invalid_body' } });
    expect(await harness.call('ada', 'POST', '/api/auth/context', { organizationId: '' })).toEqual({
      status: 400,
      body: { error: 'invalid_body' },
    });
    expect(
      await harness.call('ada', 'POST', '/api/auth/context', { organizationId: 'org-a' }),
    ).toEqual({
      status: 403,
      body: { error: 'context_inactive' },
    });
  } finally {
    harness.close();
  }
});

test('issues a native direct context only for its own current membership', async () => {
  const keys = await generateKeyPair('RS256');
  const harness = OrganizationHarness.open(keys.publicKey, keys.privateKey);
  try {
    await harness.register('ada');
    await harness.register('bob');
    harness.organization('org-a');
    harness.organization('org-b');
    harness.member('org-a', 'ada', 'member');
    harness.member('org-b', 'bob', 'member');
    harness.activate();
    expect(
      await harness.callWith('other', 'POST', '/api/auth/context', { organizationId: 'org-a' }),
    ).toEqual({ status: 401, body: { error: 'invalid_binding' } });
    expect(
      await harness.callWith(
        harness.token('ada'),
        'POST',
        '/api/auth/context',
        { organizationId: 'org-a' },
        { cookie: `__Host-wbs_access=${harness.token('bob')}` },
      ),
    ).toEqual({ status: 401, body: { error: 'invalid_binding' } });
    for (const cookie of [
      '__Host-wbs_access=%E0%A4%A',
      `__Host-wbs_access=${harness.token('bob')}; __Host-wbs_access=${harness.token('ada')}`,
    ]) {
      expect(
        await harness.callWith(
          harness.token('ada'),
          'POST',
          '/api/auth/context',
          { organizationId: 'org-a' },
          { cookie },
        ),
      ).toEqual({
        status: 401,
        body: { error: 'invalid_binding' },
      });
    }
    expect(
      await harness.call('ada', 'POST', '/api/auth/context', { organizationId: 'org-b' }),
    ).toEqual({
      status: 403,
      body: { error: 'forbidden' },
    });
    expect(
      await harness.callWith(
        harness.token('ada'),
        'POST',
        '/api/auth/context',
        { organizationId: 'org-a' },
        { 'x-wbs-organization': 'org-b' },
      ),
    ).toMatchObject({ status: 200 });
    const directClient = await harness.app.handle(
      new Request('http://localhost/api/auth/context', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${harness.token('ada')}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ organizationId: 'org-a' }),
      }),
    );
    expect(directClient.status).toBe(200);
    const foreignBrowser = await harness.app.handle(
      new Request('http://localhost/api/auth/context', {
        method: 'POST',
        headers: {
          cookie: `__Host-wbs_access=${harness.token('ada')}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ organizationId: 'org-a' }),
      }),
    );
    expect(foreignBrowser.status).toBe(403);
    const browser = await harness.app.handle(
      new Request('http://localhost/api/auth/context', {
        method: 'POST',
        headers: {
          cookie: `__Host-wbs_access=${harness.token('ada')}`,
          origin: 'http://localhost',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ organizationId: 'org-a' }),
      }),
    );
    expect(browser.status).toBe(200);
    const answer = await harness.call('ada', 'POST', '/api/auth/context', {
      organizationId: 'org-a',
    });
    expect(answer.status).toBe(200);
    if (
      typeof answer.body !== 'object' ||
      answer.body === null ||
      !('token' in answer.body) ||
      typeof answer.body.token !== 'string'
    )
      throw new Error('context token missing');
    const aProject = await harness.callWith(answer.body.token, 'POST', '/api/projects', {
      name: 'A project',
    });
    expect(aProject.status).toBe(200);
    const listed = await harness.callWith(answer.body.token, 'GET', '/api/projects', undefined, {
      'x-wbs-organization': 'org-b',
    });
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).toContain('A project');
    const userId = harness.userId('ada');
    harness.sqlite.run(
      'DELETE FROM organization_membership WHERE organization_id = ? AND user_id = ?',
      ['org-a', userId],
    );
    expect((await harness.callWith(answer.body.token, 'GET', '/api/projects')).status).toBe(403);
    harness.sqlite.run('DROP TABLE organization_activation');
    expect(
      (await harness.call('ada', 'POST', '/api/auth/context', { organizationId: 'org-a' })).status,
    ).toBe(500);
  } finally {
    harness.close();
  }
});

test('enabled context issuance reports inactive before activation', async () => {
  const keys = await generateKeyPair('RS256');
  const harness = OrganizationHarness.open(keys.publicKey, keys.privateKey);
  try {
    await harness.register('ada');
    harness.organization('org-a');
    harness.member('org-a', 'ada', 'member');
    expect(
      await harness.call('ada', 'POST', '/api/auth/context', {
        organizationId: 'org-a',
      }),
    ).toEqual({ status: 403, body: { error: 'context_inactive' } });
  } finally {
    harness.close();
  }
});
