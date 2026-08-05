import { describe, expect, it } from 'bun:test';

import { buildApp } from '../app';
import { testAuthService } from '../testing/auth-fixture';
import { testProjectService } from '../testing/project-fixture';
import { testWorkItemService } from '../testing/work-item-fixture';

const SECRET = 'test-secret-must-be-32-chars-at-least-!';

describe('POST /internal/forward', () => {
  it('rejects without X-Internal-Auth', async () => {
    const app = buildApp({
      auth: testAuthService(),
      projects: testProjectService(),
      workItems: testWorkItemService(),
      migrationsApplied: true,
      internalAuthSecret: SECRET,
    });
    const res = await app.handle(
      new Request('http://localhost/internal/forward', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: { type: 'ping' }, trace_id: 't' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('acks with auth + valid body', async () => {
    const app = buildApp({
      auth: testAuthService(),
      projects: testProjectService(),
      workItems: testWorkItemService(),
      migrationsApplied: true,
      internalAuthSecret: SECRET,
    });
    const res = await app.handle(
      new Request('http://localhost/internal/forward', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-auth': SECRET,
          'x-client-id': 'u-1',
          'x-connection-id': 'c-1',
        },
        body: JSON.stringify({ message: { type: 'ping' }, trace_id: 't-1' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ack: boolean };
    expect(body.ack).toBe(true);
  });

  it('returns 400 on missing trace_id', async () => {
    const app = buildApp({
      auth: testAuthService(),
      projects: testProjectService(),
      workItems: testWorkItemService(),
      migrationsApplied: true,
      internalAuthSecret: SECRET,
    });
    const res = await app.handle(
      new Request('http://localhost/internal/forward', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-auth': SECRET,
        },
        body: JSON.stringify({ message: { type: 'ping' } }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /internal/resume', () => {
  it('returns replaying status for known subscriptions', async () => {
    const app = buildApp({
      auth: testAuthService(),
      projects: testProjectService(),
      workItems: testWorkItemService(),
      migrationsApplied: true,
      internalAuthSecret: SECRET,
    });
    const res = await app.handle(
      new Request('http://localhost/internal/resume', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-auth': SECRET,
          'x-client-id': 'u-1',
          'x-connection-id': 'c-1',
        },
        body: JSON.stringify({
          resume_points: { 'doc:a': 0 },
          trace_id: 't-1',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, { status: string; count: number }>;
    expect(body['doc:a'].status).toBe('replaying');
  });
});
