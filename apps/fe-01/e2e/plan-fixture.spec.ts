import { expect, test } from '@playwright/test';

import { openSeededPlan, seedPlan } from './plan-fixture';

const identity = (testName: string, worker: number) => ({
  run: 'section-1',
  worker,
  test: testName,
});

test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'wait' }));

test('resolves a predecessor in an earlier chunk', async ({ page }, testInfo) => {
  const chunkSizes: number[] = [];
  await page.route('**/api/projects/*/commands', async (route) => {
    const request = route.request().postDataJSON() as { commands: { kind: string }[] };
    if (request.commands.every((command) => command.kind === 'createWorkItem'))
      chunkSizes.push(request.commands.length);
    await route.continue();
  });
  const rows = Array.from({ length: 201 }, (_, index) => ({
    ref: `row-${String(index)}`,
    name: `Row ${String(index)}`,
    ...(index === 0 ? {} : { afterRef: `row-${String(index - 1)}` }),
  }));
  const seeded = await seedPlan(
    page,
    { name: 'Cross chunk', rows },
    identity('cross', testInfo.workerIndex),
  );
  expect(Object.keys(seeded.rowIds)).toHaveLength(201);
  expect(seeded.rowIds['row-200']).not.toBe(seeded.rowIds['row-199']);
  expect(chunkSizes).toEqual([200, 1]);
});

test('an unresolved earlier-chunk ref is refused before a tree sample', async ({
  page,
}, testInfo) => {
  // Proof: the second real batch was changed back to its batch-local afterRef;
  // be-01 refused command 0 as createWorkItem/unknown_ref before the tree GET.
  let creationBatch = 0;
  let postRefusalTreeReads = 0;
  await page.route('**/api/projects/*/work-items', async (route) => {
    if (creationBatch >= 2) postRefusalTreeReads += 1;
    await route.continue();
  });
  await page.route('**/api/projects/*/commands', async (route) => {
    const request = route.request().postDataJSON() as { commands: Record<string, unknown>[] };
    if (request.commands.every((command) => command['kind'] === 'createWorkItem')) {
      creationBatch += 1;
      if (creationBatch === 2) {
        const broken = request.commands.map((command) => ({
          ...command,
          afterId: undefined,
          afterRef: 'row-199',
        }));
        const response = await route.fetch({ postData: JSON.stringify({ commands: broken }) });
        await route.fulfill({ response });
        return;
      }
    }
    await route.continue();
  });
  const rows = Array.from({ length: 201 }, (_, index) => ({
    ref: `row-${String(index)}`,
    name: `Row ${String(index)}`,
    ...(index === 0 ? {} : { afterRef: `row-${String(index - 1)}` }),
  }));
  await expect(
    seedPlan(
      page,
      { name: 'Broken cross chunk', rows },
      identity('broken-cross', testInfo.workerIndex),
    ),
  ).rejects.toThrow(/"at":0,"kind":"createWorkItem","error":"unknown_ref"/);
  expect(creationBatch).toBe(2);
  expect(postRefusalTreeReads).toBe(0);
});

test('duplicate recipe refs fail before a write request', async ({ page }, testInfo) => {
  let projectWrites = 0;
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'POST') projectWrites += 1;
    await route.continue();
  });
  await expect(
    seedPlan(
      page,
      {
        name: 'Duplicate',
        rows: [
          { ref: 'same', name: 'First' },
          { ref: 'same', name: 'Second' },
        ],
      },
      identity('duplicate', testInfo.workerIndex),
    ),
  ).rejects.toThrow('duplicate recipe row ref: same');
  expect(projectWrites).toBe(0);
});

test('setup refuses a real backend refusal', async ({ page }, testInfo) => {
  await page.route('**/api/projects/*/commands', async (route) => {
    await route.continue({
      url: route
        .request()
        .url()
        .replace(
          /\/api\/projects\/[^/]+\/commands$/,
          '/api/projects/missing-fixture-project/commands',
        ),
    });
  });
  await expect(
    seedPlan(
      page,
      { name: 'Refused', rows: [{ ref: 'row', name: 'Refused' }] },
      identity('refusal', testInfo.workerIndex),
    ),
  ).rejects.toThrow(/postApiProjectsByIdCommands refused.*not_found/);
});

test('setup refuses a missing row id at the malformed response', async ({ page }, testInfo) => {
  await page.route('**/api/projects/*/commands', async (route) => {
    const response = await route.fetch();
    const answer = (await response.json()) as { results: Record<string, unknown>[] };
    delete answer.results[0]?.['id'];
    await route.fulfill({ response, json: answer });
  });
  await expect(
    seedPlan(
      page,
      { name: 'Malformed', rows: [{ ref: 'row', name: 'Malformed' }] },
      identity('malformed', testInfo.workerIndex),
    ),
  ).rejects.toThrow(/invalid_response|missing identity for row/);
});

test('verification catches one successfully omitted estimate', async ({ page }, testInfo) => {
  // Proof: one setEstimate was removed from the real authored batch while the
  // tag write still returned 200; the independent tree read named row/Dev.
  let omittedEstimates = 0;
  await page.route('**/api/projects/*/commands', async (route) => {
    const request = route.request().postDataJSON() as { commands: Record<string, unknown>[] };
    const retained = request.commands.filter((command) => command['kind'] !== 'setEstimate');
    if (retained.length !== request.commands.length) {
      omittedEstimates += request.commands.length - retained.length;
      const response = await route.fetch({ postData: JSON.stringify({ commands: retained }) });
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });
  await expect(
    seedPlan(
      page,
      {
        name: 'Verify writes',
        tags: [{ ref: 'tag', name: 'Fixture tag' }],
        rows: [
          {
            ref: 'row',
            name: 'Verified row',
            estimates: { Dev: { optimistic: 1, realistic: 2, pessimistic: 3 } },
            tagRefs: ['tag'],
          },
        ],
      },
      identity('verify', testInfo.workerIndex),
    ),
  ).rejects.toThrow(/stored estimate for row\/Dev/);
  expect(omittedEstimates).toBe(1);
});

test('verification catches one successfully dropped directory link', async ({ page }, testInfo) => {
  // Proof: one patchWorkItem was removed while the real empty batch returned
  // 200; the independent tree read named the missing tag ids on `row`.
  let omittedLinks = 0;
  await page.route('**/api/projects/*/commands', async (route) => {
    const request = route.request().postDataJSON() as { commands: Record<string, unknown>[] };
    const retained = request.commands.filter((command) => command['kind'] !== 'patchWorkItem');
    if (retained.length !== request.commands.length) {
      omittedLinks += request.commands.length - retained.length;
      const response = await route.fetch({ postData: JSON.stringify({ commands: retained }) });
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });
  await expect(
    seedPlan(
      page,
      {
        name: 'Verify directory link',
        tags: [{ ref: 'tag', name: 'Fixture tag' }],
        rows: [{ ref: 'row', name: 'Verified row', tagRefs: ['tag'] }],
      },
      identity('verify-link', testInfo.workerIndex),
    ),
  ).rejects.toThrow(/stored tag ids for row/);
  expect(omittedLinks).toBe(1);
});

test('simultaneous recipes keep identical logical labels disjoint', async ({
  browser,
}, testInfo) => {
  // Proof: removing worker/test identity from fixtureName made the concurrent
  // real directory writes collide on Shared logical tag instead of both seeding.
  const leftContext = await browser.newContext();
  const rightContext = await browser.newContext();
  try {
    const leftPage = await leftContext.newPage();
    const rightPage = await rightContext.newPage();
    const recipe = {
      name: 'Concurrent fixture',
      tags: [{ ref: 'tag', name: 'Shared logical tag' }],
      rows: [{ ref: 'row', name: 'Shared logical row', tagRefs: ['tag'] }],
    } as const;
    const [left, right] = await Promise.all([
      seedPlan(leftPage, recipe, identity('concurrent-left', testInfo.workerIndex)),
      seedPlan(rightPage, recipe, identity('concurrent-right', testInfo.workerIndex)),
    ]);
    expect(left.projectName).not.toBe(right.projectName);
    expect(left.projectId).not.toBe(right.projectId);
    expect(left.rowIds['row']).not.toBe(right.rowIds['row']);
    expect(left.tagIds['tag']).not.toBe(right.tagIds['tag']);
    await Promise.all([openSeededPlan(leftPage, left), openSeededPlan(rightPage, right)]);
  } finally {
    await Promise.all([leftContext.close(), rightContext.close()]);
  }
});
