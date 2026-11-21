import {
  exportWorkPackage as exportWorkPackageShape,
  recordWorkPackageOpen as recordWorkPackageOpenShape,
} from '@wbs/contracts';
import { planDocumentRequest, validateSchema } from '@wbs/contracts';

import { readOrdinaryFixture, selectOrdinaryProject } from './ordinary-context';
import { expect, test } from './ordinary-test';
import { createOrdinaryHeaders } from './plan-fixture';
import { fixtureClient, fixtureSuccess } from './plan-fixture';

/**
 * The plan page with no work package open, in a browser that remembers none.
 *
 * UI review 2026-10-13: F-019 (a blank page under the header) and F-027 (with
 * two or more work packages, nothing opens on load). The local identity is shared by
 * every spec, so the account always holds several work packages here — which is the
 * F-027 case — and nothing in this fresh browser context names one.
 */
const RUN_TOKEN = String(Date.now());

test('offers the account’s work packages, Create and Import, and remembers the one opened', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  const { projectId } = readOrdinaryFixture();
  const client = fixtureClient(page);
  const name = `Home offer ${RUN_TOKEN}`;
  const created = fixtureSuccess(
    'postApiWorkPackages',
    await client.postApiWorkPackages({ body: { projectId, name } }),
  ).body;
  fixtureSuccess(
    'postApiWorkPackages',
    await client.postApiWorkPackages({ body: { projectId, name: `${name} sibling` } }),
  );
  // Opened once by this account, so be-01 orders it first among the account's work packages.
  const opened = await page.evaluate(
    async ({ requestHeaders, fixtureInput }) => {
      const id = fixtureInput;
      return (
        await fetch(`/api/work-packages/${id}/opened`, {
          headers: requestHeaders.recordWorkPackageOpen,
          method: 'POST',
        })
      ).status;
    },
    {
      requestHeaders: { recordWorkPackageOpen: createOrdinaryHeaders(recordWorkPackageOpenShape) },
      fixtureInput: created.workPackage.id,
    },
  );
  expect(opened, 'be-01 did not record the open').toBeLessThan(300);

  await page.reload();
  const home = page.getByRole('region', { name: 'No work package open' });
  // Proof: on 2026-10-13, before the empty state existed, this failed on `element(s) not
  // found` — the page under the header was blank.
  await expect(home).toBeVisible();
  await expect(home.getByRole('button', { name: 'Create new work package' })).toBeVisible();
  await expect(home.getByLabel('Import JSON')).toBeAttached();
  const offered = home.getByRole('list', { name: 'Your work packages' }).getByRole('button');
  await expect(offered.first()).toContainText(name);

  await offered.first().click();
  const picker = page.getByRole('combobox', { name: 'Work package' });
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
  const { projectId } = readOrdinaryFixture();
  const client = fixtureClient(page);
  const source = fixtureSuccess(
    'postApiWorkPackages',
    await client.postApiWorkPackages({
      body: { projectId, name: `Home import source ${RUN_TOKEN}` },
    }),
  ).body;
  // A second work package, so this fresh browser opens nothing on its own.
  fixtureSuccess(
    'postApiWorkPackages',
    await client.postApiWorkPackages({
      body: { projectId, name: `Home import sibling ${RUN_TOKEN}` },
    }),
  );
  const exported: unknown = await page.evaluate(
    async ({ requestHeaders, fixtureInput }) => {
      const id = fixtureInput;
      return (
        await fetch(`/api/work-packages/${id}/export?format=json`, {
          headers: requestHeaders.exportWorkPackage,
        })
      ).json() as Promise<unknown>;
    },
    {
      requestHeaders: { exportWorkPackage: createOrdinaryHeaders(exportWorkPackageShape) },
      fixtureInput: source.workPackage.id,
    },
  );
  const checked = await validateSchema(planDocumentRequest, exported);
  if (checked.issues !== undefined)
    throw new Error(`export failed preflight: ${JSON.stringify(checked)}`);
  const importedName = `Imported from home ${RUN_TOKEN}`;
  const document = {
    ...checked.value,
    settings: { ...checked.value.settings, name: importedName },
  };

  await page.reload();
  const home = page.getByRole('region', { name: 'No work package open' });
  await expect(home).toBeVisible();
  await selectOrdinaryProject(page);
  await home.getByLabel('Import JSON').setInputFiles({
    name: 'plan.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  });

  // Nothing was selected, so the import opens what it made, and the card gives way to it.
  const picker = page.getByRole('combobox', { name: 'Work package' });
  await expect(picker).toHaveValue(importedName);
  await expect(home).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();
});
