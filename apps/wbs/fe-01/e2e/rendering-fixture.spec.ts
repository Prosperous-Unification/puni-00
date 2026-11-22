import {
  applyWorkPackageCommands,
  getWorkItems,
  importSummary,
  importWorkPackage,
  planDocumentResponse,
  validateSchema,
} from '@wbs/contracts';

import { createWorkPackage } from './create-work-package';
import { ordinaryReply } from './ordinary-context';
import { type APIResponse, expect, test } from './ordinary-test';
import { fixtureClient, fixtureSuccess } from './plan-fixture';
import {
  renderingGeometry,
  seedImportedRenderingPlan,
  seedRenderingPlan,
} from './rendering-fixture';

test.afterEach(async ({ page }) => {
  // Wait for route.fetch() and response.json() before Playwright tears down
  // the page and disposes the handler's APIResponse underneath that read.
  await page.unrouteAll({ behavior: 'wait' });
});

test('rendering setup reports an actual backend refusal', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await expect(
    fixtureClient(page)
      .postApiWorkPackagesByIdCommands({
        params: { id: 'missing-rendering-work-package' },
        body: { commands: [{ kind: 'createWorkItem', name: 'Refused' }] },
      })
      .then((reply) => fixtureSuccess('postApiWorkPackagesByIdCommands', reply)),
  ).rejects.toThrow(/postApiWorkPackagesByIdCommands refused.*not_found/);
});

test('rendering setup refuses a successful batch without its row identity', async ({ page }) => {
  await page.route('**/api/work-packages/*/commands', async (route) => {
    const request = route.request().postDataJSON() as { commands: { kind: string }[] };
    if (!request.commands.every((command) => command.kind === 'createWorkItem')) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    const answer = (await response.json()) as { results: Record<string, unknown>[] };
    for (const row of answer.results) delete row['id'];
    await route.fulfill({ response, json: answer });
  });
  await expect(seedRenderingPlan(page, { rows: 2, steps: 2, density: 'sparse' })).rejects.toThrow(
    'rendering create rows result at 0 has no id for row0',
  );
});

test('rendering setup refuses a wrong authored result index before its tree read', async ({
  page,
}) => {
  let treeReads = 0;
  let authoredBatches = 0;
  let corrupted = false;
  await page.route('**/api/work-packages/*/work-items', async (route) => {
    if (corrupted) treeReads += 1;
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
    const answer = (await response.json()) as { results: { index: number }[] };
    answer.results[0].index = 999;
    corrupted = true;
    await route.fulfill({ response, json: answer });
  });
  await expect(seedRenderingPlan(page, { rows: 2, steps: 2, density: 'sparse' })).rejects.toThrow(
    'rendering authored commands result at 0 has index 999, expected 0',
  );
  expect(authoredBatches).toBe(1);
  expect(treeReads).toBe(0);
});

test('rendering setup refuses an altered estimate value', async ({ page }) => {
  let alteredEstimates = 0;
  let treeReads = 0;
  await page.route('**/api/work-packages/*/work-items', async (route) => {
    if (alteredEstimates > 0) treeReads += 1;
    await route.continue();
  });
  await page.route('**/api/work-packages/*/commands', async (route) => {
    const request = route.request().postDataJSON() as { commands: Record<string, unknown>[] };
    const commands = request.commands.map((command) => ({ ...command }));
    const estimate = commands.find((command) => command['kind'] === 'setEstimate');
    if (estimate !== undefined && alteredEstimates === 0) {
      estimate['days'] = { optimistic: 8, realistic: 9, pessimistic: 10 };
      alteredEstimates += 1;
      const response = await route.fetch({ postData: JSON.stringify({ commands }) });
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });
  await expect(seedRenderingPlan(page, { rows: 2, steps: 2, density: 'sparse' })).rejects.toThrow(
    /rendering estimate 0\//,
  );
  expect(alteredEstimates).toBe(1);
  expect(treeReads).toBe(1);
});

test('rendering setup refuses a redirected dependency endpoint', async ({ page }) => {
  const createdIds: string[] = [];
  let redirectedEdges = 0;
  let treeReads = 0;
  await page.route('**/api/work-packages/*/work-items', async (route) => {
    if (redirectedEdges > 0) treeReads += 1;
    await route.continue();
  });
  await page.route('**/api/work-packages/*/commands', async (route) => {
    const request = route.request().postDataJSON() as { commands: Record<string, unknown>[] };
    if (request.commands.every((command) => command['kind'] === 'createWorkItem')) {
      const response = await route.fetch();
      const answer = (await response.json()) as { results: { id?: string }[] };
      for (const created of answer.results) {
        if (typeof created.id === 'string') createdIds.push(created.id);
      }
      await route.fulfill({ response, json: answer });
      return;
    }
    const commands = request.commands.map((command) => ({ ...command }));
    const dependency = commands.find((command) => command['kind'] === 'addDependency');
    if (dependency !== undefined) {
      const predecessorId = createdIds.at(0);
      if (predecessorId === undefined) throw new Error('edge fault has no first created row');
      dependency['predecessorId'] = predecessorId;
      redirectedEdges += 1;
      const response = await route.fetch({ postData: JSON.stringify({ commands }) });
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  });
  await expect(seedRenderingPlan(page, { rows: 11, steps: 2, density: 'sparse' })).rejects.toThrow(
    'rendering dependencies for row 10',
  );
  expect(redirectedEdges).toBe(1);
  expect(treeReads).toBe(1);
});

const importFaults = [
  ['text export', 'rendering export is not JSON'],
  ['connected export', 'rendering template version'],
  ['foreign export project', 'rendering template identity'],
  ['duplicate command identity', 'rendering template unique row identities'],
  ['duplicate export identity', 'rendering template unique row identities'],
  ['reordered export rows', 'rendering template row identities'],
  ['renamed export row', 'rendering template recipe'],
  ['changed export step', 'rendering template steps'],
  ['wrong summary rows', 'rendering import summary rows'],
  ['reused package identity', 'rendering import new package identity'],
  ['duplicate imported identity', 'rendering import unique row identities'],
  ['reused imported identity', 'rendering import fresh row identities'],
  ['reordered imported rows', 'rendering import recipe order'],
  ['changed imported step', 'rendering import steps'],
  ['altered notes', 'rendering imported writable attributes 0'],
  ['altered estimate', 'rendering imported estimates 0'],
  ['redirected dependency', 'rendering imported dependencies for row 10'],
] as const;

for (const [fault, refusal] of importFaults) {
  test('imported rendering setup refuses ' + fault, async ({ page }) => {
    let injected = 0;
    let templateWorkPackageId: string | undefined;
    let templateRowId: string | undefined;
    let importedWorkPackageId: string | undefined;
    await page.route('**/api/work-packages/*/commands', async (route) => {
      if (fault !== 'duplicate command identity') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const answer = await ordinaryReply(
        response,
        applyWorkPackageCommands.responses[0].schema,
        200,
        'Rendering command identity fault',
      );
      answer.results[1].id = answer.results[0].id;
      injected += 1;
      await route.fulfill({ response, json: answer });
    });
    await page.route(/\/api\/work-packages\/[^/]+\/export\?format=json$/, async (route) => {
      const response = await route.fetch();
      let document = await ordinaryReply(
        response,
        planDocumentResponse,
        200,
        'Rendering export fault',
      );
      templateWorkPackageId = document.workPackage.id;
      templateRowId = document.workItems[0].id;
      if (fault === 'text export') {
        injected += 1;
        await route.fulfill({
          response,
          contentType: 'text/markdown; charset=utf-8',
          body: '# Rendering',
        });
        return;
      }
      if (fault === 'connected export') {
        document = {
          ...document,
          document: { ...document.document, version: 16 },
          typedDependencies: [],
          connected: {
            kind: 'connected',
            workPackageId: document.workPackage.id,
            mode: 'isolated',
            workPackages: [],
            relationships: [],
            placement: { kind: 'unavailable', reason: 'cycle' },
          },
        };
        injected += 1;
      } else if (fault === 'foreign export project') {
        document.project.id = 'foreign-rendering-project';
        injected += 1;
      } else if (fault === 'duplicate export identity') {
        document.workItems[1].id = document.workItems[0].id;
        injected += 1;
      } else if (fault === 'reordered export rows') {
        [document.workItems[0], document.workItems[1]] = [
          document.workItems[1],
          document.workItems[0],
        ];
        injected += 1;
      } else if (fault === 'renamed export row') {
        document.workItems[0].name = 'Incorrect rendering row';
        injected += 1;
      } else if (fault === 'changed export step') {
        document.steps[0].allowancePercent = 17;
        injected += 1;
      }
      await route.fulfill({ response, json: document });
    });
    await page.route('**/api/work-packages/import', async (route) => {
      let response: APIResponse;
      if (
        fault === 'altered notes' ||
        fault === 'altered estimate' ||
        fault === 'redirected dependency'
      ) {
        const checked = await validateSchema(
          importWorkPackage.body,
          route.request().postDataJSON(),
        );
        if (checked.issues !== undefined)
          throw new Error('Rendering fault received an invalid import request');
        const decoded = await validateSchema(planDocumentResponse, checked.value.document);
        if (decoded.issues !== undefined)
          throw new Error('Rendering fault received an invalid export document');
        const document = decoded.value;
        if (fault === 'altered notes') {
          document.workItems[0].notes = 'Incorrect imported rendering notes';
        } else if (fault === 'altered estimate') {
          document.workItems[0].estimates[document.steps[0].id] = {
            optimistic: 8,
            realistic: 9,
            pessimistic: 10,
          };
        } else {
          document.workItems[10].dependsOn = [document.workItems[0].id];
        }
        injected += 1;
        response = await route.fetch({ postData: JSON.stringify({ ...checked.value, document }) });
      } else {
        response = await route.fetch();
      }
      const answer = await ordinaryReply(response, importSummary, 201, 'Rendering actual import');
      importedWorkPackageId = answer.workPackageId;
      if (fault === 'wrong summary rows') {
        answer.rows = 19;
        injected += 1;
      } else if (fault === 'reused package identity') {
        if (templateWorkPackageId === undefined)
          throw new Error('Rendering summary fault has no template package');
        answer.workPackageId = templateWorkPackageId;
        injected += 1;
      }
      await route.fulfill({ response, json: answer });
    });
    await page.route('**/api/work-packages/*/work-items', async (route) => {
      if (
        importedWorkPackageId === undefined ||
        !new URL(route.request().url()).pathname.includes('/' + importedWorkPackageId + '/')
      ) {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const tree = await ordinaryReply(
        response,
        getWorkItems.responses[0].schema,
        200,
        'Rendering actual imported tree',
      );
      if (fault === 'duplicate imported identity') {
        tree.workItems[1].id = tree.workItems[0].id;
        injected += 1;
      } else if (fault === 'reused imported identity') {
        if (templateRowId === undefined)
          throw new Error('Rendering row identity fault has no template row');
        tree.workItems[0].id = templateRowId;
        injected += 1;
      } else if (fault === 'reordered imported rows') {
        [tree.workItems[0], tree.workItems[1]] = [tree.workItems[1], tree.workItems[0]];
        injected += 1;
      } else if (fault === 'changed imported step') {
        tree.steps[0].allowancePercent = 17;
        injected += 1;
      }
      await route.fulfill({ response, json: tree });
    });
    await expect(
      seedImportedRenderingPlan(page, { rows: 20, steps: 5, density: 'sparse' }),
    ).rejects.toThrow(refusal);
    expect(injected).toBe(1);
  });
}

test('rendering measurement refuses a frame with no layout area', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await createWorkPackage(page, 'Rendering geometry refusal');
  await expect(page.locator('[data-table-frame]')).toBeVisible();
  await page.locator('[data-table-frame]').evaluate((frame) => {
    frame.style.display = 'none';
  });
  await expect(renderingGeometry(page)).rejects.toThrow(
    'rendering measurement has empty frame geometry',
  );
});
