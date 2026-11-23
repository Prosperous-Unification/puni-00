import { expect, test } from './ordinary-test';
import { LONG_NAME, stubSpacesApi } from './spaces-stub';
for (const width of [375, 1280])
  for (const dark of [false, true])
    test(`space members at ${String(width)}px ${dark ? 'dark' : 'light'}`, async ({
      page,
    }, testInfo) => {
      const personIds = ['ana'],
        serviceTeamIds = ['ops'];
      const writes: {
        method: string;
        path: string;
        body: string | null;
        organization: string | undefined;
      }[] = [];
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
      await stubSpacesApi(page, {
        'GET /api/onboarding': {
          status: 200,
          body: {
            state: 'selection_required',
            memberships: [{ organizationId: 'org', name: 'Our organization', role: 'member' }],
          },
        },
        'GET /api/organization/active': {
          status: 200,
          body: { organizationId: 'org', name: 'Our organization', role: 'member' },
        },
        'GET /api/spaces/s': {
          status: 200,
          body: {
            space: {
              id: 's',
              name: 'Launch',
              virtual: false,
              projectCount: 0,
              workPackageCount: 0,
              revision: 1,
              createdById: 'u1',
              createdAt: 1,
            },
            writable: true,
            personIds,
            serviceTeamIds,
            projects: [],
          },
        },
        'GET /api/people': {
          status: 200,
          body: {
            people: [
              { id: 'ana', name: LONG_NAME, kind: 'person', teamIds: [] },
              { id: 'bot', name: 'Build agent', kind: 'agent', teamIds: [] },
            ],
          },
        },
        'GET /api/teams': {
          status: 200,
          body: {
            teams: [
              { id: 'ops', name: LONG_NAME, serviceIds: [] },
              { id: 'design', name: 'Design', serviceIds: [] },
            ],
          },
        },
        'GET /api/organization/steps': {
          status: 503,
          body: { error: 'fixture_steps_unavailable' },
        },
      });
      await page.route(/\/api\/spaces\/s\/(people|teams)\/[^/]+$/, async (route) => {
        const request = route.request(),
          path = new URL(request.url()).pathname,
          segments = path.split('/'),
          id = segments.at(-1);
        if (id === undefined) throw Error('Fixture lacks addressed membership');
        writes.push({
          method: request.method(),
          path,
          body: request.postData(),
          organization: request.headers()['x-wbs-expected-organization'],
        });
        const ids = path.includes('/people/') ? personIds : serviceTeamIds;
        if (request.method() === 'POST') ids.push(id);
        else if (request.method() === 'DELETE') ids.splice(ids.indexOf(id), 1);
        else throw Error('Unexpected membership method');
        await route.fulfill({ status: 204 });
      });
      await page.goto('/spaces/s');
      const people = page.getByRole('region', { name: 'People in this space' }),
        teams = page.getByRole('region', { name: 'Teams in this space' });
      await expect(people.getByText(LONG_NAME, { exact: true })).toBeVisible();
      await expect(teams.getByText(LONG_NAME, { exact: true })).toBeVisible();
      for (const panel of [people, teams]) {
        const sizes = await panel.locator('button,select').evaluateAll((controls) =>
          controls.map((control) => ({
            height: Math.round(control.getBoundingClientRect().height),
            radius: getComputedStyle(control).borderTopLeftRadius,
          })),
        );
        expect(sizes.length).toBeGreaterThan(2);
        expect(
          sizes.every((size) => size.height === (width === 375 ? 44 : 36) && size.radius === '6px'),
        ).toBe(true);
        expect(await panel.evaluate((section) => section.scrollWidth - section.clientWidth)).toBe(
          0,
        );
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBe(0);
      await people.getByLabel('Add a person', { exact: true }).selectOption('bot');
      await people.getByRole('button', { name: 'Add', exact: true }).click();
      await people
        .getByRole('button', { name: 'Remove person Build agent from this space' })
        .click();
      await expect(
        people.getByRole('button', { name: 'Remove person Build agent from this space' }),
      ).toHaveCount(0);
      await teams.getByLabel('Add a team', { exact: true }).selectOption('design');
      await teams.getByRole('button', { name: 'Add', exact: true }).click();
      await teams.getByRole('button', { name: 'Remove team Design from this space' }).click();
      await expect(
        teams.getByRole('button', { name: 'Remove team Design from this space' }),
      ).toHaveCount(0);
      expect(writes).toEqual([
        { method: 'POST', path: '/api/spaces/s/people/bot', body: null, organization: 'org' },
        { method: 'DELETE', path: '/api/spaces/s/people/bot', body: null, organization: 'org' },
        { method: 'POST', path: '/api/spaces/s/teams/design', body: null, organization: 'org' },
        { method: 'DELETE', path: '/api/spaces/s/teams/design', body: null, organization: 'org' },
      ]);
      await page.screenshot({ path: testInfo.outputPath('membership.png'), fullPage: true });
    });
