import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The project timezone through the project PATCH and read (`step-node-attempts`
 * D3), over real SQLite and the composed services: the zone is a column beside
 * the settings, and the refusal is decided against the runtime's own list.
 */
let h: OrganizationHarness;
let project: string;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  await h.register('ada');
  h.organization('org-a');
  h.member('org-a', 'ada', 'member');
  h.bind('ada', 'org-a');
  h.activate();
  const created = await h.call('ada', 'POST', '/api/projects', { name: 'Rewire the shed' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  project = (created.body as { project: { id: string } }).project.id;
});

afterEach(() => {
  h.close();
});

const zoneRead = async () =>
  (
    (await h.call('ada', 'GET', `/api/projects/${project}`)).body as {
      project: { timezone: string };
    }
  ).project.timezone;

describe('the project timezone', () => {
  it('reads UTC until set, stores Europe/Kyiv, and the read carries it', async () => {
    expect(await zoneRead()).toBe('UTC');

    expect(
      await h.call('ada', 'PATCH', `/api/projects/${project}`, { timezone: 'Europe/Kyiv' }),
    ).toMatchObject({ status: 200, body: { project: { timezone: 'Europe/Kyiv' } } });

    expect(await zoneRead()).toBe('Europe/Kyiv');
    expect(
      h.sqlite
        .query<{ timezone: string }, [string]>('SELECT timezone FROM project WHERE id = ?')
        .get(project),
    ).toEqual({ timezone: 'Europe/Kyiv' });
  });

  /**
   * Proof: the service's `isTimezone` check removed made the PATCH store `Kyiv`
   * and answer 500, its own read of the zone refusing it as trusted state
   * (`- "status": 422 / + "status": 500`); watched 2026-10-12.
   */
  it('refuses Kyiv 422 invalid_timezone and keeps the zone', async () => {
    await h.call('ada', 'PATCH', `/api/projects/${project}`, { timezone: 'Europe/Kyiv' });

    expect(await h.call('ada', 'PATCH', `/api/projects/${project}`, { timezone: 'Kyiv' })).toEqual({
      status: 422,
      body: { error: 'invalid_timezone' },
    });

    expect(await zoneRead()).toBe('Europe/Kyiv');
  });

  it('writes a zone with another setting in one PATCH', async () => {
    expect(
      await h.call('ada', 'PATCH', `/api/projects/${project}`, {
        name: 'Rewire the barn',
        timezone: 'America/New_York',
      }),
    ).toMatchObject({
      status: 200,
      body: { project: { name: 'Rewire the barn', timezone: 'America/New_York' } },
    });
  });
});
