import { expect, type Page } from '@playwright/test';
import {
  clientFromShapes,
  exportWorkPackage,
  importWorkPackage,
  type PlanCommandWire,
  type PlanDocumentV15,
} from '@wbs/contracts';

import { bindFixtureSteps } from './catalogue-fixture';
import { assertOrdinaryAccount, readOrdinaryFixture } from './ordinary-context';
import {
  assertCommandResults,
  fixtureClient,
  fixtureSuccess,
  openSeededPlan,
  pageTransport,
} from './plan-fixture';

export interface RenderingSize {
  rows: number;
  steps: number;
  density: 'sparse' | 'dense';
  wrappedEvery?: number;
}

/** A flat DAG with a declared, independently verified edge count. */
export function renderingEdges(
  rows: number,
  density: RenderingSize['density'],
): [number, number][] {
  const edges: [number, number][] = [];
  for (let successor = 1; successor < rows; successor += 1) {
    const count = density === 'dense' ? Math.min(8, successor) : successor % 10 === 0 ? 1 : 0;
    for (let previous = 1; previous <= count; previous += 1)
      edges.push([successor, successor - previous]);
  }
  return edges;
}

/** Authors the actual current parent, bindings, package and ordered rows through ordinary HTTP. */
async function seedRenderingRows(page: Page, size: RenderingSize) {
  const started = Date.now();
  await page.goto('/');
  await assertOrdinaryAccount(page);
  const client = fixtureClient(page);
  const name = `Rendering ${String(size.rows)}/${String(size.steps)}/${size.density}`;
  const project = fixtureSuccess(
    'postApiProjects',
    await client.postApiProjects({ body: { name: name + ' [' + crypto.randomUUID() + ']' } }),
  ).body.project;
  const ordinary = readOrdinaryFixture();
  await bindFixtureSteps(
    page.request,
    ordinary.appOrigin,
    ordinary.organizationId,
    project.id,
    Array.from({ length: size.steps }, (_, index) =>
      index === 0
        ? { code: 'dev', name: 'Dev' }
        : index === 1
          ? { code: 'qa', name: 'QA' }
          : { code: 'rendering-step-' + String(index + 1), name: 'Step ' + String(index + 1) },
    ),
  );
  const workPackage = fixtureSuccess(
    'postApiWorkPackages',
    await client.postApiWorkPackages({ body: { projectId: project.id, name } }),
  ).body;
  const workPackageId = workPackage.workPackage.id;
  expect(workPackage.steps).toHaveLength(size.steps);
  await openSeededPlan(page, { workPackageId, workPackageName: name });
  await page.goto('/directory');
  const ids: string[] = [];
  for (let start = 0; start < size.rows; start += 200) {
    const count = Math.min(200, size.rows - start);
    const commands: PlanCommandWire[] = Array.from({ length: count }, (_, offset) => ({
      kind: 'createWorkItem',
      ref: `row${String(offset)}`,
      parentId: null,
      ...(offset === 0
        ? { afterId: ids.at(-1) ?? null }
        : { afterRef: `row${String(offset - 1)}` }),
      name:
        `Row ${String(start + offset).padStart(4, '0')}` +
        ((size.wrappedEvery ?? 0) > 0 && (start + offset + 1) % (size.wrappedEvery ?? 1) === 0
          ? ' whose first-line name deliberately wraps once across the 1280 pixel plan column'
          : start + offset === size.rows - 1
            ? ' z'
            : ''),
    }));
    const answer = fixtureSuccess(
      'postApiWorkPackagesByIdCommands',
      await client.postApiWorkPackagesByIdCommands({
        params: { id: workPackageId },
        body: { commands },
      }),
    ).body;
    const created = assertCommandResults('rendering create rows', commands, answer.results);
    for (let index = 0; index < count; index += 1) ids.push(created[`row${String(index)}`]);
  }
  return { started, client, name, project, workPackage, workPackageId, ids };
}

/** Seeds batches while the plan observer is unmounted, then verifies the actual server tree. */
export async function seedRenderingPlan(page: Page, size: RenderingSize) {
  const { started, client, workPackage, workPackageId, ids } = await seedRenderingRows(page, size);
  const estimates: PlanCommandWire[] = ids.flatMap((id) =>
    workPackage.steps.map((step) => ({
      kind: 'setEstimate',
      workItemId: id,
      stepId: step.id,
      days: { optimistic: 1, realistic: 2, pessimistic: 3 },
    })),
  );
  const edges = renderingEdges(size.rows, size.density);
  const dependencies: PlanCommandWire[] = edges.map(([successor, predecessor]) => ({
    kind: 'addDependency',
    workItemId: ids[successor],
    predecessorId: ids[predecessor],
  }));
  for (const commands of [estimates, dependencies]) {
    for (let start = 0; start < commands.length; start += 200) {
      const batch = commands.slice(start, start + 200);
      const answer = fixtureSuccess(
        'postApiWorkPackagesByIdCommands',
        await client.postApiWorkPackagesByIdCommands({
          params: { id: workPackageId },
          body: { commands: batch },
        }),
      ).body;
      assertCommandResults('rendering authored commands', batch, answer.results);
    }
  }
  const tree = fixtureSuccess(
    'getApiWorkPackagesByIdWork-items',
    await client['getApiWorkPackagesByIdWork-items']({ params: { id: workPackageId } }),
  ).body;
  expect(tree.workItems.map((row) => row.id)).toEqual(ids);
  expect(tree.steps.map(({ id, name }) => ({ id, name }))).toEqual(
    workPackage.steps.map(({ id, name }) => ({ id, name })),
  );
  const expectedDays = { optimistic: 1, realistic: 2, pessimistic: 3 };
  for (const [index, row] of tree.workItems.entries()) {
    // Proof: changing one real outgoing estimate to 8/9/10 made the named
    // rendering estimate assertion refuse before geometry was sampled.
    for (const step of workPackage.steps)
      expect(row.estimates[step.id], `rendering estimate ${String(index)}/${step.name}`).toEqual(
        expectedDays,
      );
    const predecessors = edges
      .filter(([successor]) => successor === index)
      .map(([, predecessor]) => ids[predecessor])
      .sort();
    // Proof: redirecting the real sparse edge 10→9 to 10→0 preserved the
    // edge count and made this endpoint assertion refuse before geometry.
    expect([...row.dependsOn].sort(), `rendering dependencies for row ${String(index)}`).toEqual(
      predecessors,
    );
  }
  return { ...size, workPackageId, ids, edges: edges.length, setupMs: Date.now() - started };
}

/** Seeds rendering facts through the ordinary admitted import of a real current export. */
export async function seedImportedRenderingPlan(page: Page, size: RenderingSize) {
  const { started, client, name, project, workPackage, workPackageId, ids } =
    await seedRenderingRows(page, size);
  const archive = clientFromShapes(
    [exportWorkPackage, importWorkPackage] as const,
    pageTransport(page, readOrdinaryFixture().organizationId),
  );
  const reply = fixtureSuccess(
    'getApiWorkPackagesByIdExport',
    await archive.getApiWorkPackagesByIdExport({
      params: { id: workPackageId },
      query: { format: 'json' },
    }),
  );
  // Proof: `imported rendering setup refuses text export` returned real export
  // bytes as Markdown and observed this refusal before import.
  if (reply.representation !== 'json') throw new Error('rendering export is not JSON');
  const exported = reply.body;
  // Proof: the valid connected16 export dependency fault reached this exact
  // ordinary-version assertion in `imported rendering setup refuses connected export`.
  expect(exported.document.version, 'rendering template version').toBe(15);
  // Proof: `imported rendering setup refuses foreign export project` changed
  // the valid response's parent identity and observed this assertion before projection.
  expect(
    {
      projectId: exported.project.id,
      workPackageId: exported.workPackage.id,
      parentId: exported.workPackage.projectId,
    },
    'rendering template identity',
  ).toEqual({ projectId: project.id, workPackageId, parentId: project.id });
  const exportedIds = exported.workItems.map((row) => row.id);
  // Proof: duplicate-command and duplicate-export identity faults each retained
  // all20 rows but failed this unique-identity assertion before any mapping.
  expect(
    [new Set(ids).size, new Set(exportedIds).size],
    'rendering template unique row identities',
  ).toEqual([size.rows, size.rows]);
  // Proof: the count-preserving reordered-export fault failed this exact order check.
  expect(exportedIds, 'rendering template row identities').toEqual(ids);
  // Proof: the renamed-export-row fault retained valid IDs and failed this recipe check.
  expect(
    exported.workItems.map(({ name, parentId }) => ({ name, parentId })),
    'rendering template recipe',
  ).toEqual(
    Array.from({ length: size.rows }, (_, index) => ({
      name: renderingRowName(index, size),
      parentId: null,
    })),
  );
  const steps = workPackage.steps.map(renderingStep);
  // Proof: `imported rendering setup refuses changed export step` altered the
  // actual export allowance and failed this comparison to the authored steps.
  expect(exported.steps.map(renderingStep), 'rendering template steps').toEqual(steps);
  const edges = renderingEdges(size.rows, size.density);
  const expectedAttributes = structuredClone(exported.workItems.map(renderingRowAttributes));
  const authoredEstimates = Object.fromEntries(
    steps.map((step) => [step.id, { optimistic: 1, realistic: 2, pessimistic: 3 }]),
  );
  // Modeled facts derived from this run's actual current export; the import
  // boundary projects out project/workPackage/stepNodes. Only body.projectId
  // chooses the destination parent and its real catalogue admission.
  const document = {
    ...exported,
    workItems: exported.workItems.map((row, index) => ({
      ...row,
      estimates: authoredEstimates,
      dependsOn: edges
        .filter(([successor]) => successor === index)
        .map(([, predecessor]) => ids[predecessor]),
    })),
  };
  const imported = fixtureSuccess(
    'postApiWorkPackagesImport',
    await archive.postApiWorkPackagesImport({
      body: { projectId: project.id, document, defineMissing: false },
    }),
  ).body;
  // Proof: real201 imports with a changed row count or reused template package
  // ID failed these respective summary assertions in the two summary fault cases.
  expect(imported.rows, 'rendering import summary rows').toBe(size.rows);
  expect(imported.workPackageId, 'rendering import new package identity').not.toBe(workPackageId);
  const tree = fixtureSuccess(
    'getApiWorkPackagesByIdWork-items',
    await client['getApiWorkPackagesByIdWork-items']({ params: { id: imported.workPackageId } }),
  ).body;
  const importedIds = tree.workItems.map((row) => row.id);
  // Proof: the duplicate-imported-identity fault preserved20 response rows and
  // failed this assertion; the reused-imported-identity fault failed the disjointness check.
  expect(new Set(importedIds).size, 'rendering import unique row identities').toBe(size.rows);
  const templateIds = new Set(ids);
  expect(
    importedIds.filter((id) => templateIds.has(id)),
    'rendering import fresh row identities',
  ).toEqual([]);
  // Proof: `imported rendering setup refuses reordered imported rows` swapped
  // two real read rows without changing count and failed this independent recipe check.
  expect(
    tree.workItems.map(({ name, parentId, position }) => ({ name, parentId, position })),
    'rendering import recipe order',
  ).toEqual(
    exported.workItems.map(({ position }, index) => ({
      name: renderingRowName(index, size),
      parentId: null,
      position,
    })),
  );
  // Proof: the changed-imported-step fault reached this immutable code/ID/value comparison.
  expect(tree.steps.map(renderingStep), 'rendering import steps').toEqual(steps);
  for (const [index, row] of tree.workItems.entries()) {
    // Proof: `imported rendering setup refuses altered notes` committed real201
    // with changed notes, then failed this frozen export/read projection comparison.
    expect(
      renderingRowAttributes(row),
      `rendering imported writable attributes ${String(index)}`,
    ).toEqual(expectedAttributes[index]);
    // Proof: the outgoing-document estimate fault committed real201 with8/9/10
    // and failed this exact map assertion before geometry (`refuses altered estimate`).
    expect(row.estimates, `rendering imported estimates ${String(index)}`).toEqual(
      Object.fromEntries(
        steps.map((step) => [step.id, { optimistic: 1, realistic: 2, pessimistic: 3 }]),
      ),
    );
    const predecessors = edges
      .filter(([successor]) => successor === index)
      .map(([, predecessor]) => importedIds[predecessor])
      .sort();
    // Proof: the outgoing-document10→9 to10→0 fault committed real201 with
    // unchanged edge count and failed this endpoint assertion (`refuses redirected dependency`).
    expect(
      [...row.dependsOn].sort(),
      `rendering imported dependencies for row ${String(index)}`,
    ).toEqual(predecessors);
  }
  await openSeededPlan(page, { workPackageId: imported.workPackageId, workPackageName: name });
  await page.goto('/directory');
  return {
    ...size,
    workPackageId: imported.workPackageId,
    ids: importedIds,
    edges: edges.length,
    setupMs: Date.now() - started,
  };
}

/** Stable writable fields shared by the live read and this fixture's current export.
 * Attempts use archive codes/ISO timestamps versus live IDs/instants; blockages
 * also have a distinct document representation. This fresh-row recipe authors neither.
 * Identity/parent/position, estimates and dependencies have independent checks.
 */
function renderingRowAttributes(
  row: Pick<
    PlanDocumentV15['workItems'][number],
    | 'notes'
    | 'frozenNumber'
    | 'startNoEarlierThan'
    | 'startNoEarlierThanReason'
    | 'deadline'
    | 'factStart'
    | 'factEnd'
    | 'readiness'
    | 'hold'
    | 'priority'
    | 'serviceTeamId'
    | 'serviceId'
    | 'maxParallel'
    | 'teamIds'
    | 'tagIds'
    | 'serviceIds'
    | 'typeIds'
    | 'externalRefs'
    | 'actuals'
    | 'progress'
    | 'measures'
    | 'assignees'
  >,
) {
  return {
    notes: row.notes,
    frozenNumber: row.frozenNumber,
    startNoEarlierThan: row.startNoEarlierThan,
    startNoEarlierThanReason: row.startNoEarlierThanReason,
    deadline: row.deadline,
    factStart: row.factStart,
    factEnd: row.factEnd,
    readiness: row.readiness,
    hold: row.hold,
    priority: row.priority,
    serviceTeamId: row.serviceTeamId,
    serviceId: row.serviceId,
    maxParallel: row.maxParallel,
    teamIds: row.teamIds,
    tagIds: row.tagIds,
    serviceIds: row.serviceIds,
    typeIds: row.typeIds,
    externalRefs: row.externalRefs,
    actuals: row.actuals,
    progress: row.progress,
    measures: row.measures,
    assignees: row.assignees,
  };
}

function renderingStep(
  step: Awaited<ReturnType<typeof seedRenderingRows>>['workPackage']['steps'][number],
) {
  const { id, code, name, position, allowancePercent, estimateUnit } = step;
  return { id, code, name, position, allowancePercent, estimateUnit };
}

function renderingRowName(index: number, size: RenderingSize): string {
  return (
    `Row ${String(index).padStart(4, '0')}` +
    ((size.wrappedEvery ?? 0) > 0 && (index + 1) % (size.wrappedEvery ?? 1) === 0
      ? ' whose first-line name deliberately wraps once across the 1280 pixel plan column'
      : index === size.rows - 1
        ? ' z'
        : '')
  );
}

/** Read once after layout; mounted counts are not computed from a virtualizer's range. */
export function renderingGeometry(page: Page) {
  return page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>('[data-table-frame]');
    if (frame === null) throw new Error('rendering measurement has no table frame');
    const box = frame.getBoundingClientRect();
    // Proof: removing this guard made `rendering measurement refuses a frame
    // with no layout area` resolve width0/height0 instead of rejecting.
    if (box.width <= 0 || box.height <= 0)
      throw new Error('rendering measurement has empty frame geometry');
    const rows = [...document.querySelectorAll<HTMLElement>('[data-grid] tbody tr[data-row-id]')];
    const cells = [...document.querySelectorAll<HTMLElement>('[data-grid] tbody td[data-column]')];
    const intersects = (node: HTMLElement) => {
      const cell = node.getBoundingClientRect();
      return (
        cell.width > 0 &&
        cell.height > 0 &&
        cell.right > box.left &&
        cell.left < box.right &&
        cell.bottom > box.top &&
        cell.top < box.bottom
      );
    };
    return {
      mountedRows: rows.length,
      mountedCells: cells.length,
      intersectingRows: rows.filter(intersects).length,
      intersectingCells: cells.filter(intersects).length,
      headers: document.querySelectorAll('[data-grid] th[data-column]').length,
      width: box.width,
      height: box.height,
      scrollTop: frame.scrollTop,
      scrollLeft: frame.scrollLeft,
      columns: [...document.querySelectorAll<HTMLElement>('[data-grid] th[data-column]')].map(
        (node) => ({ id: node.dataset['column'], width: node.getBoundingClientRect().width }),
      ),
      rowHeights: rows.slice(0, 3).map((row) => row.getBoundingClientRect().height),
    };
  });
}

/** Two animation frames mark an opportunity to paint, not compositor presentation. */
export function painted(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            resolve(performance.now());
          }),
        );
      }),
  );
}
