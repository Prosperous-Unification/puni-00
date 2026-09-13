import { expect, type Page } from '@playwright/test';
import {
  addStep,
  applyDirectoryCommands,
  applyProjectCommands,
  clientFromShapes,
  createProject,
  getWorkItems,
  type PlanCommandWire,
  readProject,
  type TransportReply,
} from '@wbs/contracts';

const CHUNK_SIZE = 200;

export interface PlanFixtureIdentity {
  run: string;
  worker: number;
  test: string;
}

export interface PlanRecipeRow {
  ref: string;
  name: string;
  afterRef?: string;
  estimates?: Readonly<
    Record<string, { optimistic: number; realistic: number; pessimistic: number }>
  >;
  tagRefs?: readonly string[];
}

export interface PlanRecipe {
  name: string;
  rows: readonly PlanRecipeRow[];
  tags?: readonly { ref: string; name: string }[];
}

export interface SeededPlan {
  projectId: string;
  projectName: string;
  rowIds: Readonly<Record<string, string>>;
  stepIds: Readonly<Record<string, string>>;
  tagIds: Readonly<Record<string, string>>;
}

function fixtureName(name: string, identity: PlanFixtureIdentity): string {
  return `${name} [${identity.run}/w${String(identity.worker)}/${identity.test}]`;
}

function validateRecipe(recipe: PlanRecipe): void {
  const rowRefs = new Set<string>();
  for (const row of recipe.rows) {
    // Proof: deleting this refusal made the duplicate-recipe-ref browser case observe a project POST.
    if (rowRefs.has(row.ref)) throw new Error(`duplicate recipe row ref: ${row.ref}`);
    if (row.afterRef !== undefined && !rowRefs.has(row.afterRef))
      throw new Error(`recipe row ${row.ref} follows unavailable ref: ${row.afterRef}`);
    rowRefs.add(row.ref);
  }
  const tagRefs = new Set<string>();
  for (const tag of recipe.tags ?? []) {
    if (tagRefs.has(tag.ref)) throw new Error(`duplicate recipe tag ref: ${tag.ref}`);
    tagRefs.add(tag.ref);
  }
  for (const row of recipe.rows) {
    for (const tagRef of row.tagRefs ?? [])
      if (!tagRefs.has(tagRef)) throw new Error(`unknown recipe tag ref: ${tagRef}`);
  }
}

function pageTransport(page: Page) {
  return async (
    shape: { method: string; path: string },
    input: { params: Record<string, string | undefined>; body: unknown },
  ): Promise<TransportReply> => {
    const path = shape.path
      .split('/')
      .map((segment) =>
        segment.startsWith(':')
          ? encodeURIComponent(input.params[segment.slice(1)] ?? '')
          : segment,
      )
      .join('/');
    return page.evaluate(
      async ({ method, path, body }) => {
        const response = await fetch(path, {
          method,
          headers: body === undefined ? undefined : { 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const headers = [...response.headers.entries()];
        if (response.status === 204) return { kind: 'empty' as const, status: 204, headers };
        return {
          kind: 'json' as const,
          status: response.status,
          headers,
          body: JSON.parse(await response.text()) as unknown,
        };
      },
      { method: shape.method, path, body: input.body },
    );
  };
}

export function fixtureSuccess<T extends { kind: string; status?: number }>(
  operation: string,
  reply: T,
): Extract<T, { kind: 'success' }> {
  if (reply.kind !== 'success') throw new Error(`${operation} refused: ${JSON.stringify(reply)}`);
  return reply as Extract<T, { kind: 'success' }>;
}

/** Generated-shape client carried through the browser's authenticated same-origin fetch. */
export function fixtureClient(page: Page) {
  return clientFromShapes(
    [
      createProject,
      readProject,
      addStep,
      applyProjectCommands,
      applyDirectoryCommands,
      getWorkItems,
    ] as const,
    pageTransport(page),
  );
}

function identities(
  operation: string,
  requested: readonly { ref: string }[],
  results: readonly { index: number; ref?: string; id?: string }[],
): Record<string, string> {
  if (results.length !== requested.length)
    throw new Error(
      `${operation} returned ${String(results.length)} of ${String(requested.length)} results`,
    );
  return Object.fromEntries(
    requested.map(({ ref }, index) => {
      const result = results.at(index);
      // Proof: deleting this check made the malformed-success browser case proceed to a later command.
      if (result?.index !== index || result.ref !== ref || typeof result.id !== 'string')
        throw new Error(`${operation} missing identity for ${ref} at index ${String(index)}`);
      return [ref, result.id];
    }),
  );
}

/** Seeds one independently named plan through validated public HTTP shapes and verifies its stored state. */
export async function seedPlan(
  page: Page,
  recipe: PlanRecipe,
  identity: PlanFixtureIdentity,
): Promise<SeededPlan> {
  validateRecipe(recipe);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  const client = fixtureClient(page);
  const projectName = fixtureName(recipe.name, identity);
  const created = fixtureSuccess(
    'postApiProjects',
    await client.postApiProjects({ body: { name: projectName } }),
  ).body;
  const projectId = created.project.id;
  const read = fixtureSuccess(
    'getApiProjectsById',
    await client.getApiProjectsById({ params: { id: projectId } }),
  ).body;
  const stepIdByName = new Map(read.steps.map((step) => [step.name, step.id]));
  const stepIds = Object.fromEntries(stepIdByName);

  const tags = (recipe.tags ?? []).map((tag) => ({
    kind: 'createTag' as const,
    ref: tag.ref,
    name: fixtureName(tag.name, identity),
  }));
  const tagIds: Record<string, string> =
    tags.length === 0
      ? {}
      : identities(
          'postApiDirectoryCommands',
          tags,
          fixtureSuccess(
            'postApiDirectoryCommands',
            await client.postApiDirectoryCommands({ body: { commands: tags } }),
          ).body.results,
        );

  const rowIdByRef = new Map<string, string>();
  for (let start = 0; start < recipe.rows.length; start += CHUNK_SIZE) {
    const rows = recipe.rows.slice(start, start + CHUNK_SIZE);
    const localRefs = new Set(rows.map((row) => row.ref));
    const commands: PlanCommandWire[] = rows.map((row) => {
      let placement: { afterId: string | null } | { afterRef: string };
      if (row.afterRef === undefined) {
        placement = { afterId: start === 0 ? null : ([...rowIdByRef.values()].at(-1) ?? null) };
      } else if (localRefs.has(row.afterRef)) {
        placement = { afterRef: row.afterRef };
      } else {
        const afterId = rowIdByRef.get(row.afterRef);
        if (afterId === undefined)
          throw new Error(`recipe row ${row.ref} follows unresolved ref: ${row.afterRef}`);
        placement = { afterId };
      }
      return {
        kind: 'createWorkItem',
        ref: row.ref,
        name: row.name,
        parentId: null,
        ...placement,
      };
    });
    const answer = fixtureSuccess(
      'postApiProjectsByIdCommands',
      await client.postApiProjectsByIdCommands({ params: { id: projectId }, body: { commands } }),
    );
    for (const [ref, id] of Object.entries(
      identities('postApiProjectsByIdCommands', rows, answer.body.results),
    ))
      rowIdByRef.set(ref, id);
  }

  const rowIds = Object.fromEntries(rowIdByRef);

  const authored: PlanCommandWire[] = recipe.rows.flatMap((row) => {
    const workItemId = rowIdByRef.get(row.ref);
    if (workItemId === undefined) throw new Error(`seeded row has no id: ${row.ref}`);
    const estimates: PlanCommandWire[] = Object.entries(row.estimates ?? {}).map(
      ([stepName, days]) => {
        const stepId = stepIdByName.get(stepName);
        if (stepId === undefined) throw new Error(`recipe names unknown step: ${stepName}`);
        return { kind: 'setEstimate', workItemId, stepId, days };
      },
    );
    const tagIdsForRow = (row.tagRefs ?? []).map((ref) => {
      const id = Object.hasOwn(tagIds, ref) ? tagIds[ref] : undefined;
      if (id === undefined) throw new Error(`seeded tag has no id: ${ref}`);
      return id;
    });
    return tagIdsForRow.length === 0
      ? estimates
      : [...estimates, { kind: 'patchWorkItem', workItemId, patch: { tagIds: tagIdsForRow } }];
  });
  for (let start = 0; start < authored.length; start += CHUNK_SIZE) {
    const commands = authored.slice(start, start + CHUNK_SIZE);
    fixtureSuccess(
      'postApiProjectsByIdCommands',
      await client.postApiProjectsByIdCommands({ params: { id: projectId }, body: { commands } }),
    );
  }

  const tree = fixtureSuccess(
    'getApiProjectsByIdWork-items',
    await client['getApiProjectsByIdWork-items']({ params: { id: projectId } }),
  ).body;
  expect(tree.workItems.map((row) => row.id)).toEqual(recipe.rows.map((row) => rowIds[row.ref]));
  for (const expected of recipe.rows) {
    const stored = tree.workItems.find((row) => row.id === rowIds[expected.ref]);
    if (stored === undefined) throw new Error(`stored tree is missing row ${expected.ref}`);
    expect(stored.name, `stored name for ${expected.ref}`).toBe(expected.name);
    for (const [stepName, days] of Object.entries(expected.estimates ?? {})) {
      const stepId = stepIdByName.get(stepName);
      if (stepId === undefined) throw new Error(`verified recipe names unknown step: ${stepName}`);
      expect(stored.estimates[stepId], `stored estimate for ${expected.ref}/${stepName}`).toEqual(
        days,
      );
    }
    expect(stored.tagIds, `stored tag ids for ${expected.ref}`).toEqual(
      (expected.tagRefs ?? []).map((ref) => tagIds[ref]),
    );
  }
  return { projectId, projectName, rowIds, stepIds, tagIds };
}

/** Opens a seeded plan through the real picker-facing selected-project state. */
export async function openSeededPlan(page: Page, seeded: SeededPlan): Promise<void> {
  await page.goto('/');
  const picker = page.getByRole('combobox', { name: 'Project' });
  await picker.click();
  await expect(page.getByRole('listbox', { name: 'Projects' })).toBeVisible();
  await picker.fill(seeded.projectName);
  await page.getByRole('option', { name: new RegExp(`^${seeded.projectName}`) }).click();
  await expect(picker).toHaveValue(seeded.projectName);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('wbs.project')))
    .toBe(seeded.projectId);
}
