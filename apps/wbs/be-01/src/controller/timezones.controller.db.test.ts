import { isTimezone } from '@wbs/domain';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * `GET /api/timezones` over be-01's production composition (`step-node-attempts`
 * D3): the zones the project PATCH validates against, so Settings offers only
 * zones this server accepts.
 */
let h: OrganizationHarness;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  await h.register('ada');
});

afterEach(() => {
  h.close();
});

describe('the timezone list', () => {
  /** Proof: the route's spread left out of `app.ts` made this answer 404; watched 2026-10-12. */
  it('serves the zones the PATCH accepts, UTC and Europe/Kyiv included', async () => {
    const answer = await h.call('ada', 'GET', '/api/timezones');

    expect(answer.status).toBe(200);
    const zones = (answer.body as { timezones: string[] }).timezones;
    expect(zones).toContain('UTC');
    expect(zones).toContain('Europe/Kyiv');
    expect(zones).not.toContain('Kyiv');
    expect(zones.every(isTimezone)).toBe(true);
  });

  it('refuses a caller who is not signed in', async () => {
    expect((await h.call('nobody', 'GET', '/api/timezones')).status).toBe(401);
  });
});
