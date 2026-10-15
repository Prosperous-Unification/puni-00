import { readFile } from 'node:fs/promises';

import { expect, type Page, test } from '@playwright/test';
import { importProject, type PlanDocumentRequest, preflightRequest } from '@wbs/contracts';

import { fixtureClient, fixtureSuccess, openSeededPlan, seedPlan } from './plan-fixture';

const ROWS = 13;
const RUN_TOKEN = String(Date.now());

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const recipe = (name: string) => ({
  name,
  rows: Array.from({ length: ROWS }, (_, index) => ({
    ref: `row-${String(index)}`,
    name: `Import row ${String(index + 1)}`,
  })),
});

async function seededPlan(page: Page, name: string) {
  const info = test.info();
  const seeded = await seedPlan(page, recipe(name), {
    run: RUN_TOKEN,
    worker: info.workerIndex,
    test: info.title,
  });
  await openSeededPlan(page, seeded);
  await expect(page.getByRole('button', { name: 'Add work item' })).toBeVisible();
  return seeded;
}

async function downloadPlan(page: Page): Promise<unknown> {
  await page.locator('details[data-export] summary').click();
  const saving = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON' }).click();
  const download = await saving;
  return JSON.parse(await readFile(await download.path(), 'utf8')) as unknown;
}

async function validatedPlan(downloaded: unknown): Promise<PlanDocumentRequest> {
  const checked = await preflightRequest(importProject, { body: downloaded });
  if (checked.kind !== 'ready') {
    throw new Error(`downloaded plan failed generated preflight: ${JSON.stringify(checked)}`);
  }
  return checked.input.body;
}

async function projectCount(page: Page): Promise<number> {
  const projects = fixtureSuccess('getApiProjects', await fixtureClient(page).getApiProjects({}))
    .body.projects;
  return projects.length;
}

async function importFile(page: Page, document: PlanDocumentRequest): Promise<void> {
  await page.getByLabel('Import JSON').setInputFiles({
    name: 'plan.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(document)),
  });
}

test('downloads and imports a complete plan through the real chooser', async ({ page }) => {
  const seeded = await seededPlan(page, 'Plan import success');
  const downloaded = await validatedPlan(await downloadPlan(page));
  expect(downloaded.workItems).toHaveLength(ROWS);
  expect(new Set(downloaded.workItems.map((row) => row.id))).toEqual(
    new Set(Object.values(seeded.rowIds)),
  );

  const importedName = `Imported exact ${RUN_TOKEN}`;
  const tagName = `Created import tag ${RUN_TOKEN}`;
  const tagId = `file-tag-${RUN_TOKEN}`;
  const document: PlanDocumentRequest = {
    ...downloaded,
    settings: { ...downloaded.settings, name: importedName },
    directory: {
      ...downloaded.directory,
      tags: [...downloaded.directory.tags, { id: tagId, name: tagName }],
    },
    workItems: downloaded.workItems.map((row, index) =>
      index === 0 ? { ...row, tagIds: [...row.tagIds, tagId] } : row,
    ),
  };
  await validatedPlan(document);

  await importFile(page, document);

  const picker = page.getByRole('combobox', { name: 'Project' });
  await expect(picker).toHaveValue(importedName);
  const summary = `Imported “${importedName}” with ${String(ROWS)} work items. Added 1 tag (${tagName}).`;
  await expect(page.locator('[data-toast-text]')).toHaveCount(1);
  await expect(page.locator('[data-toast-text]')).toHaveText(summary);
  await picker.click();
  await picker.fill(importedName);
  await expect(
    page.getByRole('option', { name: new RegExp(`^${escaped(importedName)}\\b`) }),
  ).toBeVisible();
});

test('keeps the project and count when a dangling dependency is refused', async ({ page }) => {
  const seeded = await seededPlan(page, 'Plan import refusal');
  const downloaded = await validatedPlan(await downloadPlan(page));
  expect(downloaded.workItems.length).toBeGreaterThanOrEqual(ROWS);
  const row = downloaded.workItems.at(12);
  if (row === undefined) throw new Error('the downloaded plan has no workItems[12]');
  row.dependsOn[0] = 'missing-file-row';
  const before = await projectCount(page);

  await importFile(page, downloaded);

  await expect(page.locator('[data-toast-text]')).toHaveCount(1);
  await expect(page.locator('[data-toast-text]')).toHaveText(
    'This plan export refers to something it does not contain (workItems[12].dependsOn[0]).',
  );
  await expect(page.getByRole('combobox', { name: 'Project' })).toHaveValue(seeded.projectName);
  await expect.poll(() => projectCount(page)).toBe(before);
  // Proof: bypassing `firstDependencyRefusal` made this receive the generic
  // `Plan JSON import failed (http_500).` instead of the exact typed path
  // (the sentence then read that way; it is now `The server could not import
  // the plan. Try again.`).
  // Observed 2026-09-14 with the isolated browser stack.
});

test('words a broken file, then names and dates the re-import that replaces it', async ({
  page,
}) => {
  const seeded = await seededPlan(page, 'Plan import toasts');
  const downloaded = await validatedPlan(await downloadPlan(page));
  const toasts = page.locator('[data-toast-text]');
  const chooser = page.getByLabel('Import JSON');

  await chooser.setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"broken"'),
  });
  await expect(toasts).toHaveText(['This file is not JSON.']);
  await expect(page.getByRole('alert')).toHaveCount(1);

  await chooser.setInputFiles({
    name: 'other.json',
    mimeType: 'application/json',
    buffer: Buffer.from('[1, 2, 3]'),
  });
  // One refusal at a time: the second attempt's sentence replaces the first.
  await expect(toasts).toHaveText(['This JSON is not a plan export.']);
  // Proof: with the old `Plan JSON import failed (${code}).` sentences back, the
  // first toast read `Plan JSON import failed (invalid_json).`; with the
  // previous attempt's dismissal removed, this read both refusals, `This file
  // is not JSON.` still standing. Observed 2026-10-15.

  // The same plan again, under the name the account already uses.
  await importFile(page, downloaded);

  const dated = new RegExp(
    `^${escaped(seeded.projectName)} \\(imported \\d{1,2} [A-Z][a-z]{2}\\)$`,
  );
  const picker = page.getByRole('combobox', { name: 'Project' });
  await expect(picker).toHaveValue(dated);
  const importedName = await picker.inputValue();
  await expect(toasts).toHaveText([
    `Imported “${importedName}” with ${String(downloaded.workItems.length)} work items.`,
  ]);
  await expect(page.getByRole('alert')).toHaveCount(0);
  // Proof: with `distinctImportName` bypassed, the picker held the source's
  // own name, `Plan import toasts [<run>/w0/…]` with no `(imported …)`, a
  // second entry the list could not tell apart. Observed 2026-10-15.
});
