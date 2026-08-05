import { describe, expect, it } from 'bun:test';

import { buildApp } from '../app';
import { testAuthService } from '../testing/auth-fixture';
import { testProjectService } from '../testing/project-fixture';
import { testWorkItemService } from '../testing/work-item-fixture';

const TEST_SECRET = 'x'.repeat(32);

describe('POST /api/smoke/echo', () => {
  it('returns the validated message', async () => {
    const app = buildApp({
      auth: testAuthService(),
      projects: testProjectService(),
      workItems: testWorkItemService(),
      internalAuthSecret: TEST_SECRET,
      migrationsApplied: true,
    });
    const res = await app.handle(
      new Request('http://localhost/api/smoke/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'hi' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { echoed: string };
    expect(body.echoed).toBe('hi');
  });

  it('rejects invalid body with 400', async () => {
    const app = buildApp({
      auth: testAuthService(),
      projects: testProjectService(),
      workItems: testWorkItemService(),
      internalAuthSecret: TEST_SECRET,
      migrationsApplied: true,
    });
    const res = await app.handle(
      new Request('http://localhost/api/smoke/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ wrong: true }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
