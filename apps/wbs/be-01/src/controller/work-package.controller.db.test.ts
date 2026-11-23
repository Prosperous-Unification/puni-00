import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The work package timezone through the work package PATCH and read (`step-node-attempts`
 * D3), over real SQLite and the composed services: the zone is an explicit
 * package settings override, and refusal uses the runtime's own zone list.
 */
let h: OrganizationHarness;
let workPackage: string;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  await h.register('ada');
  h.organization('org-a');
  h.member('org-a', 'ada', 'member', ['project-contributor', 'org-viewer']);
  h.grantPermissions('org-a', 'ada', ['organization.create_project', 'package.manage_settings']);
  h.bind('ada', 'org-a');
  h.activate();
  const parent = await h.call('ada', 'POST', '/api/projects', { name: 'Timezone engagement' });
  expect(parent.status).toBe(201);
  const projectId = (parent.body as { project: { id: string } }).project.id;
  const created = await h.call('ada', 'POST', '/api/work-packages', {
    name: 'Rewire the shed',
    projectId,
  });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  workPackage = (created.body as { workPackage: { id: string } }).workPackage.id;
});

afterEach(async () => {
  await h.closeComposed();
});

const zoneRead = async () =>
  (
    (await h.call('ada', 'GET', `/api/work-packages/${workPackage}`)).body as {
      workPackage: { timezone: string };
    }
  ).workPackage.timezone;

describe('the work package timezone', () => {
  it('reads UTC until set, stores Europe/Kyiv, and the read carries it', async () => {
    expect(await zoneRead()).toBe('UTC');

    expect(
      await h.call('ada', 'PATCH', `/api/work-packages/${workPackage}`, {
        timezone: 'Europe/Kyiv',
      }),
    ).toMatchObject({ status: 200, body: { workPackage: { timezone: 'Europe/Kyiv' } } });

    expect(await zoneRead()).toBe('Europe/Kyiv');
    expect(
      h.sqlite
        .query<{ value_json: string }, [string]>(
          "SELECT value_json FROM setting_value WHERE scope_kind='work_package' AND scope_id=? AND key='timezone'",
        )
        .get(workPackage),
    ).toEqual({ value_json: '"Europe/Kyiv"' });
  });

  /**
   * Proof: the service's `isTimezone` check removed made the PATCH store `Kyiv`
   * and answer 500, its own read of the zone refusing it as trusted state
   * (`- "status": 422 / + "status": 500`); watched 2026-10-12.
   */
  it('refuses Kyiv 422 invalid_timezone and keeps the zone', async () => {
    await h.call('ada', 'PATCH', `/api/work-packages/${workPackage}`, { timezone: 'Europe/Kyiv' });

    expect(
      await h.call('ada', 'PATCH', `/api/work-packages/${workPackage}`, { timezone: 'Kyiv' }),
    ).toEqual({
      status: 422,
      body: { error: 'invalid_timezone' },
    });

    expect(await zoneRead()).toBe('Europe/Kyiv');
  });

  it('writes a zone with another setting in one PATCH', async () => {
    expect(
      await h.call('ada', 'PATCH', `/api/work-packages/${workPackage}`, {
        name: 'Rewire the barn',
        timezone: 'America/New_York',
      }),
    ).toMatchObject({
      status: 200,
      body: { workPackage: { name: 'Rewire the barn', timezone: 'America/New_York' } },
    });
  });
});
