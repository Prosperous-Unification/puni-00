import { afterEach, expect, test } from 'bun:test';

import { BOOTED_ORIGIN, BootedBrowserProcess } from './testing/booted-browser-process';

let be: BootedBrowserProcess | undefined;
afterEach(async () => {
  await be?.close();
  be = undefined;
});

test('boot composition refuses stale cookie context without effects', async () => {
  be = await BootedBrowserProcess.open('enabled');
  await be.register('ada');
  for (const organizationId of ['org-a', 'org-b']) {
    be.organization(organizationId);
    be.member(organizationId, 'ada', 'super_admin');
  }
  be.activate();
  const process = be;
  const send = (path: string, body: unknown, cookie?: string, expected?: string) =>
    process.app.handle(
      new Request(`${BOOTED_ORIGIN}${path}`, {
        method: 'POST',
        headers: {
          origin: BOOTED_ORIGIN,
          'content-type': 'application/json',
          ...(cookie === undefined
            ? { authorization: `Bearer ${process.token('ada')}` }
            : { cookie: `__Host-wbs_access=${process.token('ada')}; ${cookie}` }),
          ...(expected === undefined ? {} : { 'X-WBS-Expected-Organization': expected }),
        },
        body: JSON.stringify(body),
      }),
    );
  for (const organizationId of ['org-a', 'org-b']) {
    const selected = await send('/api/organization/active', { organizationId });
    expect(selected.status).toBe(200);
    if (organizationId === 'org-a') continue;
    const cookie = selected.headers.get('set-cookie')?.split(';')[0];
    if (cookie === undefined) throw new Error('booted selection cookie is absent');
    const snapshot = () =>
      [
        'project',
        'service_team',
        'command_journal',
        'organization_audit',
        'event_log',
        'event_sequencer',
      ].map((table) => process.sqlite.query(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before = snapshot();
    for (const [path, body] of [
      ['/api/projects', { name: 'stale project' }],
      ['/api/directory/commands', { commands: [{ kind: 'createTeam', name: 'stale team' }] }],
    ] as const) {
      const response = await send(path, body, cookie, 'org-a');
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'organization_context_changed' });
      expect(snapshot()).toEqual(before);
    }
    expect((await send('/api/projects', { name: 'current project' }, cookie, 'org-b')).status).toBe(
      200,
    );
  }
});
