import { WorkItemService } from '@wbs/core/service/work-item.service';
import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { crossReferenceScans } from '@wbs/store-sqlite/testing/cross-reference-plan';
import { afterAll, beforeAll, expect, spyOn, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The space read budget (`add-spaces`, spec `space-read`, design memo §8), over
 * real SQLite through the production routes: 30 projects of 300 rows each.
 *
 * The cold chunk's cost is asserted by what it does, not how long it took: one
 * tree read per project and an access gate that scans no table (#235). Its
 * wall-clock figure is printed only, because on CI be-01 runs under coverage
 * beside another Nx task on four vCPUs and no calibrated factor exists. The
 * warm chunk and the space read keep wall-clock bounds four times their
 * targets: about 15 ms and 8 ms measured, against 400 ms and 120 ms.
 */
const PROJECTS = 30;
const ROWS = 300;
const CHUNK = 20;
const BOUND_MS = { warmChunk: 400, spaceRead: 120 };

let h: OrganizationHarness;
let space: string;
const projectIds: string[] = [];

function plan(at: number) {
  const document = planDocumentFixture();
  const template = document.workItems.at(0);
  if (template === undefined) throw new Error('plan document fixture has no work item');
  document.settings.name = `Measured ${String(at)}`;
  document.workItems = Array.from({ length: ROWS }, (_, row) => ({
    ...structuredClone(template),
    id: `row-${String(row + 1)}`,
    position: (row + 1) * 10,
    name: `Row ${String(row + 1)}`,
    externalRefs: template.externalRefs.map((reference) => ({
      ...reference,
      id: `external-ref-${String(row + 1)}`,
    })),
  }));
  return document;
}

async function timed<T>(work: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const started = performance.now();
  const value = await work();
  return { ms: performance.now() - started, value };
}

beforeAll(async () => {
  h = OrganizationHarness.openComposed();
  await h.register('ada');
  h.organization('org-a');
  h.member('org-a', 'ada', 'member');
  h.bind('ada', 'org-a');
  h.activate();
  const created = await h.call('ada', 'POST', '/api/spaces', { name: 'Measured' });
  space = (created.body as { space: { id: string } }).space.id;
  for (let at = 0; at < PROJECTS; at += 1) {
    const imported = await h.call('ada', 'POST', '/api/projects/import', plan(at));
    if (imported.status !== 201) throw new Error(`import refused: ${JSON.stringify(imported)}`);
    const { projectId } = imported.body as { projectId: string };
    projectIds.push(projectId);
    await h.call('ada', 'POST', `/api/spaces/${space}/projects`, {
      projectId,
      afterProjectId: projectIds.at(-2) ?? null,
    });
  }
}, 600_000);

afterAll(() => {
  h.close();
});

test('reads a space of 30 projects and their roll-ups within the budget', async () => {
  const read = await timed(() => h.call('ada', 'GET', `/api/spaces/${space}`));
  expect(read.value.status).toBe(200);
  expect((read.value.body as { rows: unknown[] }).rows).toHaveLength(PROJECTS);

  const chunk = projectIds.slice(0, CHUNK).join(',');
  const treeReads = spyOn(WorkItemService.prototype, 'treeWithin');
  const cold = await timed(() =>
    h.call('ada', 'GET', `/api/spaces/${space}/roll-ups?projectIds=${chunk}`),
  );
  expect(cold.value.status).toBe(200);
  // One tree per project cold, none warm: the cache is what the warm bound
  // relies on, and a second read per project would double the cold cost.
  // Proof, observed 2026-09-29: with cache hits ignored in `rolledOf`, the warm
  // read received 20 calls instead of 0.
  expect(treeReads).toHaveBeenCalledTimes(CHUNK);
  treeReads.mockClear();
  const warm = await timed(() =>
    h.call('ada', 'GET', `/api/spaces/${space}/roll-ups?projectIds=${chunk}`),
  );
  expect(treeReads).toHaveBeenCalledTimes(0);
  treeReads.mockRestore();
  // Proof, observed 2026-09-29: with #235's `incoming_parent` arm restored,
  // this listed `SCAN w` (and the cold chunk took 4,115 ms). Before #235 both
  // arms scanned, and the chunk took 4,961 ms: about ten times the 444–484 ms
  // it takes now.
  expect(await crossReferenceScans(h.databasePath())).toEqual([]);
  expect(warm.value.body).toEqual(cold.value.body);
  const leaves = Object.values(
    (warm.value.body as { rollUps: Record<string, { counts: { leaves: number } }> }).rollUps,
  ).map(({ counts }) => counts.leaves);
  expect(leaves).toEqual(Array.from({ length: CHUNK }, () => ROWS));

  console.log(
    `space read ${read.ms.toFixed(1)} ms; cold chunk of ${String(CHUNK)} ${cold.ms.toFixed(1)} ms (printed only); warm chunk ${warm.ms.toFixed(1)} ms`,
  );
  expect(read.ms).toBeLessThan(BOUND_MS.spaceRead);
  expect(warm.ms).toBeLessThan(BOUND_MS.warmChunk);
}, 120_000);
