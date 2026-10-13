import { expect, test } from '@playwright/test';
import { importProject, preflightRequest } from '@wbs/contracts';

import { fixtureClient, fixtureSuccess } from './plan-fixture';

/**
 * The plan page with no project open, in a browser that remembers none.
 *
 * UI review 2026-10-13: F-019 (a blank page under the header) and F-027 (with
 * two or more projects, nothing opens on load). The local identity is shared by
 * every spec, so the account always holds several projects here — which is the
 * F-027 case — and nothing in this fresh browser context names one.
 */
const RUN_TOKEN = String(Date.now());

test('offers the account’s projects, Create and Import, and remembers the one opened', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  const client = fixtureClient(page);
  const name = `Home offer ${RUN_TOKEN}`;
  const created = fixtureSuccess(
    'postApiProjects',
    await client.postApiProjects({ body: { name } }),
  ).body;
  fixtureSuccess(
    'postApiProjects',
    await client.postApiProjects({ body: { name: `${name} sibling` } }),
  );
  // Opened once by this account, so be-01 orders it first among the account's projects.
  const opened = await page.evaluate(
    async (id) => (await fetch(`/api/projects/${id}/opened`, { method: 'POST' })).status,
    created.project.id,
  );
  expect(opened, 'be-01 did not record the open').toBeLessThan(300);

  await page.reload();
  const home = page.getByRole('region', { name: 'No project open' });
  // Proof: on 2026-10-13, before the empty state existed, this failed on `element(s) not
  // found` — the page under the header was blank.
  await expect(home).toBeVisible();
  await expect(home.getByRole('button', { name: 'Create new project' })).toBeVisible();
  await expect(home.getByLabel('Import JSON')).toBeAttached();
  const offered = home.getByRole('list', { name: 'Your projects' }).getByRole('button');
  await expect(offered.first()).toContainText(name);

  await offered.first().click();
  const picker = page.getByRole('combobox', { name: 'Project' });
  await expect(picker).toHaveValue(name);
  await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();
  await expect(home).toBeHidden();

  // The remembered half of F-027: the next load opens it with no click.
  await page.reload();
  await expect(picker).toHaveValue(name);
  await expect(home).toBeHidden();
});

test('imports a plan from the card and opens it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  const client = fixtureClient(page);
  const source = fixtureSuccess(
    'postApiProjects',
    await client.postApiProjects({ body: { name: `Home import source ${RUN_TOKEN}` } }),
  ).body;
  // A second project, so this fresh browser opens nothing on its own.
  fixtureSuccess(
    'postApiProjects',
    await client.postApiProjects({ body: { name: `Home import sibling ${RUN_TOKEN}` } }),
  );
  const exported: unknown = await page.evaluate(
    async (id) =>
      (await fetch(`/api/projects/${id}/export?format=json`)).json() as Promise<unknown>,
    source.project.id,
  );
  const checked = await preflightRequest(importProject, { body: exported });
  if (checked.kind !== 'ready')
    throw new Error(`export failed preflight: ${JSON.stringify(checked)}`);
  const importedName = `Imported from home ${RUN_TOKEN}`;
  const document = {
    ...checked.input.body,
    settings: { ...checked.input.body.settings, name: importedName },
  };

  await page.reload();
  const home = page.getByRole('region', { name: 'No project open' });
  await expect(home).toBeVisible();
  await home.getByLabel('Import JSON').setInputFiles({
    name: 'plan.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  });

  // Nothing was selected, so the import opens what it made, and the card gives way to it.
  const picker = page.getByRole('combobox', { name: 'Project' });
  await expect(picker).toHaveValue(importedName);
  await expect(home).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();
});
