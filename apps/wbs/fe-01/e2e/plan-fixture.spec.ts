import { openOrdinaryContext } from './ordinary-context';
import { expect, test } from './ordinary-test';
import { fixtureClient, fixtureSuccess, openSeededPlan, seedPlan } from './plan-fixture';

const identity = (testName: string, worker: number) => ({
  run: 'section-1',
  worker,
  test: testName,
});

test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'wait' }));

test('resolves a predecessor in an earlier chunk', async ({ page }, testInfo) => {
  const chunkSizes: number[] = [];
  await page.route('**/api/work-packages/*/commands', async (route) => {
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

test('implicit recipe order appends rows', async ({ page }, testInfo) => {
  const seeded = await seedPlan(
    page,
    {
      name: 'Implicit order',
      rows: [
        { ref: 'first', name: 'First' },
        { ref: 'second', name: 'Second' },
      ],
    },
    identity('implicit-order', testInfo.workerIndex),
  );
  const tree = fixtureSuccess(
    'getApiWorkPackagesByIdWork-items',
    await fixtureClient(page)['getApiWorkPackagesByIdWork-items']({
      params: { id: seeded.workPackageId },
    }),
  ).body;
  expect(tree.workItems.map(({ id }) => id)).toEqual([
    seeded.rowIds['first'],
    seeded.rowIds['second'],
  ]);
});

test('verifies explicit sibling insertions in their stored order', async ({ page }, testInfo) => {
  const seeded = await seedPlan(
    page,
    {
      name: 'Explicit sibling order',
      rows: [
        { ref: 'a', name: 'A' },
        { ref: 'b', name: 'B', afterRef: 'a' },
        { ref: 'c', name: 'C', afterRef: 'a' },
      ],
    },
    identity('explicit-sibling-order', testInfo.workerIndex),
  );
  expect(Object.keys(seeded.rowIds)).toEqual(['a', 'b', 'c']);
});

test('implicit recipe order crosses a chunk boundary', async ({ page }, testInfo) => {
  const creationBatchSizes: number[] = [];
  await page.route('**/api/work-packages/*/commands', async (route) => {
    const request = route.request().postDataJSON() as { commands: { kind: string }[] };
    if (request.commands.every((command) => command.kind === 'createWorkItem'))
      creationBatchSizes.push(request.commands.length);
    await route.continue();
  });
  const rows = Array.from({ length: 201 }, (_, index) => ({
    ref: `implicit-${String(index)}`,
    name: `Implicit ${String(index)}`,
  }));
  const seeded = await seedPlan(
    page,
    { name: 'Implicit cross chunk', rows },
    identity('implicit-cross', testInfo.workerIndex),
  );
  const tree = fixtureSuccess(
    'getApiWorkPackagesByIdWork-items',
    await fixtureClient(page)['getApiWorkPackagesByIdWork-items']({
      params: { id: seeded.workPackageId },
    }),
  ).body;
  expect(tree.workItems.map(({ id }) => id)).toEqual(rows.map(({ ref }) => seeded.rowIds[ref]));
  expect(creationBatchSizes).toEqual([200, 1]);
});

test('chunks 201 directory identities and verifies all links', async ({ page }, testInfo) => {
  const directoryBatchSizes: number[] = [];
  await page.route('**/api/directory/commands', async (route) => {
    const request = route.request().postDataJSON() as { commands: unknown[] };
    directoryBatchSizes.push(request.commands.length);
    await route.continue();
  });
  const tags = Array.from({ length: 201 }, (_, index) => ({
    ref: `tag-${String(index)}`,
    name: `Tag ${String(index)}`,
  }));
  const seeded = await seedPlan(
    page,
    {
      name: 'Directory chunks',
      tags,
      rows: Array.from({ length: 5 }, (_, index) => ({
        ref: `row-${String(index)}`,
        name: `Tags ${String(index)}`,
        tagRefs: tags.slice(index * 50, (index + 1) * 50).map(({ ref }) => ref),
      })),
    },
    identity('directory-chunks', testInfo.workerIndex),
  );
  expect(directoryBatchSizes).toEqual([200, 1]);
  expect(Object.keys(seeded.tagIds)).toEqual(tags.map(({ ref }) => ref));
});

test('refuses swapped successful tag identities before work package commands', async ({
  page,
}, testInfo) => {
  let workPackageCommands = 0;
  await page.route('**/api/work-packages/*/commands', async (route) => {
    workPackageCommands += 1;
    await route.continue();
  });
  await page.route('**/api/directory/commands', async (route) => {
    const response = await route.fetch();
    const answer = (await response.json()) as { results: { id?: string }[] };
    const firstId = answer.results[0]?.id;
    const secondId = answer.results[1]?.id;
    if (firstId === undefined || secondId === undefined)
      throw new Error('tag identity fault needs two successful ids');
    answer.results[0].id = secondId;
    answer.results[1].id = firstId;
    await route.fulfill({ response, json: answer });
  });
  await expect(
    seedPlan(
      page,
      {
        name: 'Swapped tag ids',
        tags: [
          { ref: 'first-tag', name: 'First tag' },
          { ref: 'second-tag', name: 'Second tag' },
        ],
        rows: [{ ref: 'row', name: 'Tagged row', tagRefs: ['first-tag'] }],
      },
      identity('swapped-tag-ids', testInfo.workerIndex),
    ),
  ).rejects.toThrow(/stored tag identity for first-tag/);
  expect(workPackageCommands).toBe(0);
});

for (const fault of ['empty', 'missing', 'wrong', 'duplicate'] as const) {
  test(`refuses an authored HTTP200 with ${fault} command results before the tree read`, async ({
    page,
  }, testInfo) => {
    let treeReads = 0;
    let authoredBatches = 0;
    await page.route('**/api/work-packages/*/work-items', async (route) => {
      treeReads += 1;
      await route.continue();
    });
    await page.route('**/api/work-packages/*/commands', async (route) => {
      const request = route.request().postDataJSON() as { commands: { kind: string }[] };
      if (request.commands.every((command) => command.kind === 'createWorkItem')) {
        await route.continue();
        return;
      }
      authoredBatches += 1;
      const response = await route.fetch();
      const answer = (await response.json()) as {
        results: { index: number; ref?: string; id?: string }[];
      };
      const results = answer.results.map((entry) => ({ ...entry }));
      if (fault === 'empty') results.splice(0);
      else if (fault === 'missing') results.pop();
      else if (fault === 'wrong') results[0].index = 999;
      else results[1].index = 0;
      await route.fulfill({ response, json: { ...answer, results } });
    });
    const rows = Array.from({ length: fault === 'missing' ? 101 : 1 }, (_, index) => ({
      ref: `row-${String(index)}`,
      name: `Row ${String(index)}`,
      estimates: { Dev: { optimistic: 1, realistic: 2, pessimistic: 3 } },
      tagRefs: ['tag'],
    }));
    await expect(
      seedPlan(
        page,
        { name: `Authored ${fault}`, tags: [{ ref: 'tag', name: 'Tag' }], rows },
        identity(`authored-${fault}`, testInfo.workerIndex),
      ),
    ).rejects.toThrow(/postApiWorkPackagesByIdCommands returned|result at/);
    expect(authoredBatches).toBe(1);
    expect(treeReads).toBe(0);
  });
}

test('an unresolved earlier-chunk ref is refused before a tree sample', async ({
  page,
}, testInfo) => {
  // Proof: the second real batch was changed back to its batch-local afterRef;
  // be-01 refused command 0 as createWorkItem/unknown_ref before the tree GET.
  let creationBatch = 0;
  let postRefusalTreeReads = 0;
  await page.route('**/api/work-packages/*/work-items', async (route) => {
    if (creationBatch >= 2) postRefusalTreeReads += 1;
    await route.continue();
  });
  await page.route('**/api/work-packages/*/commands', async (route) => {
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
  let workPackageWrites = 0;
  await page.route('**/api/work-packages', async (route) => {
    if (route.request().method() === 'POST') workPackageWrites += 1;
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
  expect(workPackageWrites).toBe(0);
});

test('an unavailable predecessor fails before a write request', async ({ page }, testInfo) => {
  let workPackageWrites = 0;
  await page.route('**/api/work-packages', async (route) => {
    if (route.request().method() === 'POST') workPackageWrites += 1;
    await route.continue();
  });
  let refusalMessage = '';
  try {
    await seedPlan(
      page,
      {
        name: 'Unavailable predecessor',
        rows: [{ ref: 'row', name: 'Row', afterRef: 'missing' }],
      },
      identity('unavailable-predecessor', testInfo.workerIndex),
    );
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    refusalMessage = error.message;
  }
  expect(workPackageWrites).toBe(0);
  expect(refusalMessage).toContain('recipe row row follows unavailable ref: missing');
});

test('a duplicate tag ref fails before a write request', async ({ page }, testInfo) => {
  let workPackageWrites = 0;
  await page.route('**/api/work-packages', async (route) => {
    if (route.request().method() === 'POST') workPackageWrites += 1;
    await route.continue();
  });
  let refusalMessage = '';
  try {
    await seedPlan(
      page,
      {
        name: 'Duplicate tag ref',
        tags: [
          { ref: 'same', name: 'First' },
          { ref: 'same', name: 'Second' },
        ],
        rows: [],
      },
      identity('duplicate-tag-ref', testInfo.workerIndex),
    );
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    refusalMessage = error.message;
  }
  expect(workPackageWrites).toBe(0);
  expect(refusalMessage).toContain('duplicate recipe tag ref: same');
});

test('an unknown row tag ref fails before a write request', async ({ page }, testInfo) => {
  let workPackageWrites = 0;
  await page.route('**/api/work-packages', async (route) => {
    if (route.request().method() === 'POST') workPackageWrites += 1;
    await route.continue();
  });
  let refusalMessage = '';
  try {
    await seedPlan(
      page,
      {
        name: 'Unknown tag ref',
        rows: [{ ref: 'row', name: 'Row', tagRefs: ['missing'] }],
      },
      identity('unknown-tag-ref', testInfo.workerIndex),
    );
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    refusalMessage = error.message;
  }
  expect(workPackageWrites).toBe(0);
  expect(refusalMessage).toContain('unknown recipe tag ref: missing');
});

test('setup refuses a real backend refusal', async ({ page }, testInfo) => {
  await page.route('**/api/work-packages/*/commands', async (route) => {
    await route.continue({
      url: route
        .request()
        .url()
        .replace(
          /\/api\/work-packages\/[^/]+\/commands$/,
          '/api/work-packages/missing-fixture-work-package/commands',
        ),
    });
  });
  await expect(
    seedPlan(
      page,
      { name: 'Refused', rows: [{ ref: 'row', name: 'Refused' }] },
      identity('refusal', testInfo.workerIndex),
    ),
  ).rejects.toThrow(/postApiWorkPackagesByIdCommands refused.*not_found/);
});

test('setup refuses a missing row id at the malformed response', async ({ page }, testInfo) => {
  await page.route('**/api/work-packages/*/commands', async (route) => {
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
  ).rejects.toThrow(/invalid_response|has no id for row/);
});

test('verification catches one successfully omitted estimate', async ({ page }, testInfo) => {
  // Proof: one real setEstimate was replaced by clearEstimate while the tag
  // write and fully correlated batch returned 200; the tree read named row/Dev.
  let omittedEstimates = 0;
  await page.route('**/api/work-packages/*/commands', async (route) => {
    const request = route.request().postDataJSON() as { commands: Record<string, unknown>[] };
    const commands = request.commands.map((command) =>
      command['kind'] === 'setEstimate'
        ? {
            kind: 'clearEstimate',
            workItemId: command['workItemId'],
            stepId: command['stepId'],
          }
        : command,
    );
    if (commands.some((command) => command['kind'] === 'clearEstimate')) {
      omittedEstimates += 1;
      const response = await route.fetch({ postData: JSON.stringify({ commands }) });
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
  // Proof: one real patchWorkItem was replaced by the same patch with no tag
  // ids; the correlated HTTP200 preceded the tree's missing tag ids on `row`.
  let omittedLinks = 0;
  await page.route('**/api/work-packages/*/commands', async (route) => {
    const request = route.request().postDataJSON() as { commands: Record<string, unknown>[] };
    const commands = request.commands.map((command) =>
      command['kind'] === 'patchWorkItem' ? { ...command, patch: { tagIds: [] } } : command,
    );
    if (commands.some((command) => command['kind'] === 'patchWorkItem')) {
      omittedLinks += 1;
      const response = await route.fetch({ postData: JSON.stringify({ commands }) });
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
  const closes: (() => Promise<void>)[] = [];
  let primary: { cause: unknown } | null = null;
  try {
    const leftContext = await openOrdinaryContext(browser);
    closes.push(() => leftContext.close());
    const rightContext = await openOrdinaryContext(browser);
    closes.push(() => rightContext.close());
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
    expect(left.workPackageName).not.toBe(right.workPackageName);
    expect(left.workPackageId).not.toBe(right.workPackageId);
    expect(left.rowIds['row']).not.toBe(right.rowIds['row']);
    expect(left.tagIds['tag']).not.toBe(right.tagIds['tag']);
    await Promise.all([openSeededPlan(leftPage, left), openSeededPlan(rightPage, right)]);
  } catch (cause) {
    primary = { cause };
  }
  const cleanup: unknown[] = [];
  for (const close of closes.reverse()) {
    try {
      await close();
    } catch (cause) {
      cleanup.push(cause);
    }
  }
  if (primary !== null) {
    if (cleanup.length !== 0)
      throw new AggregateError(
        [primary.cause, ...cleanup],
        'Concurrent recipes and context close failed',
        { cause: primary.cause },
      );
    throw primary.cause;
  }
  if (cleanup.length !== 0)
    throw new AggregateError(cleanup, 'Concurrent recipe context close failed');
});

import {
  clientFromShapes,
  createWorkPackage as createWorkPackageShape,
  listWorkPackages,
  readPasswordSession,
} from '@wbs/contracts';

import { readOrdinaryFixture } from './ordinary-context';
import { pageTransport } from './plan-fixture';

test('observes protected page transport headers and validated creation body', async ({ page }) => {
  const fixture = readOrdinaryFixture();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const observations: {
    organization: string | null;
    semantics: string | null;
    trace: string | null;
    body: unknown;
  }[] = [];
  await page.route('**/api/work-packages', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      observations.push({
        organization: await request.headerValue('X-WBS-Expected-Organization'),
        semantics: await request.headerValue('X-WBS-Dependency-Semantics'),
        trace: await request.headerValue('X-Ordinary-Fixture-Trace'),
        body: request.postDataJSON(),
      });
    }
    await route.continue();
  });
  const client = clientFromShapes(
    [createWorkPackageShape] as const,
    pageTransport(page, fixture.organizationId),
  );
  const reply = await client.postApiWorkPackages({
    headers: { 'X-Ordinary-Fixture-Trace': 'protected-request' },
    body: { projectId: fixture.projectId, name: 'Observed protected transport' },
  });
  expect(reply.kind).toBe('success');
  expect(observations).toEqual([
    {
      organization: fixture.organizationId,
      semantics: 'cross-project-dependencies-v1',
      trace: 'protected-request',
      body: { projectId: fixture.projectId, name: 'Observed protected transport' },
    },
  ]);
});

test('observes exempt page transport without a dependency claim', async ({ page }) => {
  const fixture = readOrdinaryFixture();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const claims: (string | null)[] = [];
  await page.route('**/api/auth/me', async (route) => {
    claims.push(await route.request().headerValue('X-WBS-Dependency-Semantics'));
    await route.continue();
  });
  const client = clientFromShapes(
    [readPasswordSession] as const,
    pageTransport(page, fixture.organizationId),
  );
  expect((await client.getApiAuthMe({})).kind).toBe('success');
  expect(claims).toEqual([null]);
});

test('observes page transport forwarding the validated listing query', async ({ page }) => {
  const fixture = readOrdinaryFixture();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  const queries: [string, string][][] = [];
  await page.route('**/api/work-packages*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/work-packages' && route.request().method() === 'GET')
      queries.push([...url.searchParams.entries()]);
    await route.continue();
  });
  const client = clientFromShapes(
    [listWorkPackages] as const,
    pageTransport(page, fixture.organizationId),
  );
  expect(
    (await client.getApiWorkPackages({ query: { q: 'transport ?+ /&= marker', limit: '7' } })).kind,
  ).toBe('success');
  expect(queries).toEqual([
    [
      ['q', 'transport ?+ /&= marker'],
      ['limit', '7'],
    ],
  ]);
});

import { recordWorkPackageOpen } from '@wbs/contracts';

import type { JSHandle } from './ordinary-test';
import { type PageResponseState, retainPageResponse } from './plan-fixture';

for (const kind of [
  'unexpected-unfinished',
  'cancel-failure',
  'malformed-json',
  'body-failure',
  'bodyless-204',
  'null-200',
  'opaque-zero',
  'pending-cancel',
] as const) {
  test(`page response handoff preserves ${kind}`, async ({ page }) => {
    let counter: JSHandle<{ pulls: number; cancels: number }> | undefined;
    let owned: JSHandle<PageResponseState> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let disposed = false;
    let primary: { cause: unknown } | null = null;
    try {
      const counts = await page.evaluateHandle(() => ({ pulls: 0, cancels: 0 }));
      counter = counts;
      const responseHandle = await page.evaluateHandle(
        ({ counts, kind }): PageResponseState => {
          let response: Response;
          if (kind === 'opaque-zero') response = Response.error();
          else if (kind === 'null-200') response = new Response(null, { status: 200 });
          else if (kind === 'bodyless-204') response = new Response(null, { status: 204 });
          else {
            const stream = new ReadableStream<Uint8Array>(
              {
                pull(controller) {
                  counts.pulls += 1;
                  if (kind === 'body-failure') throw new Error('browser body failed');
                  if (kind === 'malformed-json') {
                    controller.enqueue(new TextEncoder().encode('{broken'));
                    controller.close();
                    return;
                  }
                  return new Promise<void>(() => {
                    // This pull intentionally never settles; cancellation must complete its waiting reader.
                  });
                },
                cancel() {
                  counts.cancels += 1;
                  if (kind === 'cancel-failure') throw new Error('browser cancel failed');
                },
              },
              { highWaterMark: 0 },
            );
            response = new Response(stream, {
              status: kind === 'unexpected-unfinished' || kind === 'cancel-failure' ? 502 : 200,
            });
          }
          return { response, reader: null, reading: null };
        },
        { counts, kind },
      );
      owned = responseHandle;
      const client = clientFromShapes([listWorkPackages, recordWorkPackageOpen] as const, () =>
        retainPageResponse(responseHandle),
      );
      if (kind === 'pending-cancel') {
        const response = await retainPageResponse(responseHandle);
        if (response.body === null) throw new Error('Pending read fixture requires a body');
        const currentReader = response.body.getReader();
        reader = currentReader;
        const reading = currentReader.read();
        await expect.poll(async () => (await counts.jsonValue()).pulls).toBe(1);
        await currentReader.cancel();
        expect(await reading).toEqual({ done: true, value: undefined });
        expect(await counts.jsonValue()).toEqual({ pulls: 1, cancels: 1 });
      } else if (kind === 'cancel-failure') {
        await expect(client.getApiWorkPackages({})).rejects.toThrow('browser cancel failed');
        expect(await counts.jsonValue()).toEqual({ pulls: 0, cancels: 1 });
      } else if (kind === 'unexpected-unfinished') {
        expect(await client.getApiWorkPackages({})).toMatchObject({
          kind: 'failure',
          failure: { code: 'unexpected_status', status: 502 },
        });
        expect(await counts.jsonValue()).toEqual({ pulls: 0, cancels: 1 });
      } else if (kind === 'malformed-json') {
        expect(await client.getApiWorkPackages({})).toMatchObject({
          kind: 'failure',
          failure: { code: 'invalid_response', reason: 'json', status: 200 },
        });
        expect(await counts.jsonValue()).toEqual({ pulls: 1, cancels: 0 });
      } else if (kind === 'body-failure') {
        expect(await client.getApiWorkPackages({})).toMatchObject({
          kind: 'failure',
          failure: { code: 'transport', cause: { message: 'browser body failed' } },
        });
        expect(await counts.jsonValue()).toEqual({ pulls: 1, cancels: 0 });
      } else if (kind === 'bodyless-204') {
        expect(
          await client.postApiWorkPackagesByIdOpened({ params: { id: 'bodyless-control' } }),
        ).toMatchObject({ kind: 'success', representation: 'empty', status: 204 });
        expect(await counts.jsonValue()).toEqual({ pulls: 0, cancels: 0 });
      } else if (kind === 'null-200') {
        expect(await client.getApiWorkPackages({})).toMatchObject({
          kind: 'failure',
          failure: { code: 'invalid_response', reason: 'json', status: 200 },
        });
        expect(await counts.jsonValue()).toEqual({ pulls: 0, cancels: 0 });
      } else {
        expect(await client.getApiWorkPackages({})).toMatchObject({
          kind: 'failure',
          failure: { code: 'unexpected_status', status: 0 },
        });
        expect(await counts.jsonValue()).toEqual({ pulls: 0, cancels: 0 });
      }
      // Installed Playwright reports a removed handle dispatcher as target-closed.
      // Independent page and handle calls distinguish disposal from closing their context.
      expect(await page.evaluate(() => 'page still live')).toBe('page still live');
      expect(await counts.evaluate(() => 'counter still live')).toBe('counter still live');
      await expect(responseHandle.evaluate(() => true)).rejects.toThrow(
        'Target page, context or browser has been closed',
      );
      expect(await page.evaluate(() => 'page still live')).toBe('page still live');
      expect(await counts.evaluate(() => 'counter still live')).toBe('counter still live');
      disposed = true;
    } catch (cause) {
      primary = { cause };
    }
    const cleanup: unknown[] = [];
    if (reader !== undefined) {
      try {
        await reader.cancel();
      } catch (cause) {
        cleanup.push(cause);
      }
      try {
        reader.releaseLock();
      } catch (cause) {
        cleanup.push(cause);
      }
    }
    if (owned !== undefined && !disposed) {
      try {
        await owned.dispose();
      } catch (cause) {
        cleanup.push(cause);
      }
    }
    if (counter !== undefined) {
      try {
        await counter.dispose();
      } catch (cause) {
        cleanup.push(cause);
      }
    }
    if (primary !== null) {
      if (cleanup.length !== 0)
        throw new AggregateError(
          [primary.cause, ...cleanup],
          'Response control and cleanup failed',
          { cause: primary.cause },
        );
      throw primary.cause;
    }
    if (cleanup.length !== 0) throw new AggregateError(cleanup, 'Response control cleanup failed');
  });
}
