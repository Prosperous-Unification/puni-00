import { planDocumentFixture } from '@wbs/core/testing/plan-document-fixture';
import { afterAll, beforeAll, expect, test } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The space read budget (`add-spaces`, spec `space-read`, design memo §8), over
 * real SQLite through the production routes: 30 projects of 300 rows each.
 *
 * Wall-clock bounds flake under a loaded host, so each is multiplied by
 * {@link SLACK}; the numbers the spec names are the targets, the slack is the
 * tolerance, and every measured figure is printed for the verify record.
 */
const PROJECTS = 30;
const ROWS = 300;
const SLACK = process.env['CI'] === 'true' ? 4 : 3;
const BUDGET_MS = { warmChunk: 100, coldChunk: 1_000, spaceRead: 30 };

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

  const chunk = projectIds.slice(0, 20).join(',');
  const cold = await timed(() =>
    h.call('ada', 'GET', `/api/spaces/${space}/roll-ups?projectIds=${chunk}`),
  );
  expect(cold.value.status).toBe(200);
  const warm = await timed(() =>
    h.call('ada', 'GET', `/api/spaces/${space}/roll-ups?projectIds=${chunk}`),
  );
  expect(warm.value.body).toEqual(cold.value.body);
  const leaves = Object.values(
    (warm.value.body as { rollUps: Record<string, { counts: { leaves: number } }> }).rollUps,
  ).map(({ counts }) => counts.leaves);
  expect(leaves).toEqual(Array.from({ length: 20 }, () => ROWS));

  console.log(
    `space read ${read.ms.toFixed(1)} ms; cold chunk of 20 ${cold.ms.toFixed(1)} ms; warm chunk of 20 ${warm.ms.toFixed(1)} ms; slack ${String(SLACK)}`,
  );
  expect(read.ms).toBeLessThan(BUDGET_MS.spaceRead * SLACK);
  // Proof, observed 2026-09-29: before the `findCrossReferences` index fix
  // (#235) this chunk measured 4,961 ms, over three times this bound.
  expect(cold.ms).toBeLessThan(BUDGET_MS.coldChunk * SLACK);
  expect(warm.ms).toBeLessThan(BUDGET_MS.warmChunk * SLACK);
}, 120_000);
