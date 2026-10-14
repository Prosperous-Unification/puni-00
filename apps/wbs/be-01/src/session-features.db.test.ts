import { afterEach, expect, it } from 'bun:test';

import { BOOTED_ORIGIN, BootedBrowserProcess } from './testing/booted-browser-process';

const opened: BootedBrowserProcess[] = [];

afterEach(async () => {
  for (const be of opened.splice(0)) await be.close();
});

async function readFeatures(be: BootedBrowserProcess, token?: string): Promise<unknown> {
  const response = await be.app.handle(
    new Request(`${BOOTED_ORIGIN}/api/auth/me`, {
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    }),
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { features?: unknown }).features;
}

// Proof (2026-10-14): answering `onboarding: true` whatever the marker said
// failed both pre-activation rows (2 pass, 3 fail with the broken-marker case);
// answering `organizations` from the marker alone failed the activated
// `disabled` row, which has no selection composition (4 pass, 1 fail).
for (const [authority, activated, expected] of [
  ['disabled', false, { onboarding: false, organizations: false }],
  ['enabled', false, { onboarding: false, organizations: false }],
  ['disabled', true, { onboarding: true, organizations: false }],
  ['enabled', true, { onboarding: true, organizations: true }],
] as const) {
  it(`reports ${JSON.stringify(expected)} with the ${authority} authority ${activated ? 'after' : 'before'} activation`, async () => {
    const be = await BootedBrowserProcess.open(authority);
    opened.push(be);
    if (activated) be.activate();
    await be.register('ada');

    expect(await readFeatures(be)).toEqual(expected);
    expect(await readFeatures(be, be.token('ada'))).toEqual(expected);
  });
}

it('fails the session read when the activation marker is broken', async () => {
  const be = await BootedBrowserProcess.open('enabled');
  opened.push(be);
  be.sqlite.run('DELETE FROM organization_activation');

  const response = await be.app.handle(new Request(`${BOOTED_ORIGIN}/api/auth/me`));

  // Proof (2026-10-14): catching the marker's refusal in `readSessionFeatures`
  // and reporting `onboarding: false` made this answer `Received: 200`.
  expect(response.status).toBe(500);
});

it('refuses an invalid bearer 401 even when the activation marker is broken', async () => {
  const be = await BootedBrowserProcess.open('enabled');
  opened.push(be);
  be.sqlite.run('DELETE FROM organization_activation');

  const response = await be.app.handle(
    new Request(`${BOOTED_ORIGIN}/api/auth/me`, { headers: { authorization: 'Bearer invalid' } }),
  );

  // Proof (2026-10-14): reading the features before the invalid-token refusal
  // made this case receive 500.
  expect(response.status).toBe(401);
});
