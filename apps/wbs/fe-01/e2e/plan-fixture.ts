import { expect, type JSHandle, type Page } from '@playwright/test';
import {
  applyDirectoryCommands,
  applyWorkPackageCommands,
  ClientConfigurationError,
  clientFromShapes,
  type ClientTransport,
  createProject,
  createWorkPackage,
  DEPENDENCY_SEMANTICS,
  type EndpointShape,
  fetchTransport,
  getWorkItems,
  type HttpHeaders,
  listTags,
  listWorkPackages,
  type PlanCommandWire,
  readWorkPackage,
  requiresDependencyClient,
} from '@wbs/contracts';

import { bindFixtureSteps, type FixtureStep } from './catalogue-fixture';
import { assertOrdinaryAccount, readOrdinaryFixture } from './ordinary-context';

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
  steps?: readonly FixtureStep[];
  rows: readonly PlanRecipeRow[];
  tags?: readonly { ref: string; name: string }[];
}

export interface SeededPlan {
  projectId: string;
  workPackageId: string;
  workPackageName: string;
  rowIds: Readonly<Record<string, string>>;
  stepIds: Readonly<Record<string, string>>;
  tagIds: Readonly<Record<string, string>>;
}

function fixtureName(name: string, identity: PlanFixtureIdentity): string {
  return `${name} [${identity.run}/w${String(identity.worker)}/${identity.test}]`;
}

interface NormalizedRecipeRow extends Omit<PlanRecipeRow, 'afterRef'> {
  afterRef: string | null;
}

function normalizeRecipeRows(recipe: PlanRecipe): readonly NormalizedRecipeRow[] {
  const rowRefs = new Set<string>();
  for (const row of recipe.rows) {
    // Proof: deleting this refusal made the duplicate-recipe-ref browser case observe a work package POST.
    if (rowRefs.has(row.ref)) throw new Error(`duplicate recipe row ref: ${row.ref}`);
    // Proof: removing this refusal made `an unavailable predecessor fails before a write request`
    // observe one work package POST before the later unresolved-ref refusal.
    if (row.afterRef !== undefined && !rowRefs.has(row.afterRef))
      throw new Error(`recipe row ${row.ref} follows unavailable ref: ${row.afterRef}`);
    rowRefs.add(row.ref);
  }
  const tagRefs = new Set<string>();
  for (const tag of recipe.tags ?? []) {
    // Proof: removing this refusal made `a duplicate tag ref fails before a write request`
    // observe one work package POST before directory identity verification refused.
    if (tagRefs.has(tag.ref)) throw new Error(`duplicate recipe tag ref: ${tag.ref}`);
    tagRefs.add(tag.ref);
  }
  for (const row of recipe.rows) {
    for (const tagRef of row.tagRefs ?? []) {
      // Proof: removing this refusal made `an unknown row tag ref fails before a write request`
      // observe one work package POST before the later missing-id refusal.
      if (!tagRefs.has(tagRef)) throw new Error(`unknown recipe tag ref: ${tagRef}`);
    }
  }
  return recipe.rows.map((row, index) => ({
    ...row,
    // Recipe array order is authoritative when a caller omits a predecessor.
    // Proof: defaulting every omission to null reversed the real two-row plan
    // and the 201-row plan across its batch boundary; both independent exact
    // stored-id checks failed.
    afterRef: row.afterRef ?? (index === 0 ? null : recipe.rows[index - 1].ref),
  }));
}

function calculateExpectedRowRefs(rows: readonly PlanRecipeRow[]): readonly string[] {
  const orderedRefs: string[] = [];
  for (const [index, row] of rows.entries()) {
    const afterRef = row.afterRef ?? (index === 0 ? null : rows[index - 1].ref);
    const predecessorIndex = afterRef === null ? -1 : orderedRefs.indexOf(afterRef);
    if (afterRef !== null && predecessorIndex < 0)
      throw new Error(`expected order is missing predecessor: ${afterRef}`);
    orderedRefs.splice(predecessorIndex + 1, 0, row.ref);
  }
  return orderedRefs;
}

/** Pins the current fixture organization while preserving supplied headers and exact operation claims. */
function prepareOrdinaryHeaders(
  shape: EndpointShape,
  organizationId: string,
  supplied?: HttpHeaders,
): [string, string][] {
  let headers: Headers;
  try {
    headers = new Headers(supplied);
  } catch (cause) {
    throw new ClientConfigurationError('Cannot encode ordinary fixture headers', { cause });
  }
  const expected = headers.get('X-WBS-Expected-Organization');
  if (expected !== null && expected !== organizationId)
    throw new ClientConfigurationError('Ordinary request conflicts with its captured organization');
  headers.set('X-WBS-Expected-Organization', organizationId);
  if (requiresDependencyClient(shape))
    headers.set('X-WBS-Dependency-Semantics', DEPENDENCY_SEMANTICS);
  return [...headers.entries()];
}

/** Captures the actual run's organization and descriptor-specific headers before entering page.evaluate. */
export function createOrdinaryHeaders(
  shape: EndpointShape,
  supplied?: HttpHeaders,
): [string, string][] {
  return prepareOrdinaryHeaders(shape, readOrdinaryFixture().organizationId, supplied);
}

/** One browser-realm response, reader and latest read promise owned by one host response. */
export interface PageResponseState {
  response: Response;
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  reading: Promise<PageResponseRead> | null;
}

type PageResponseRead =
  { kind: 'chunk'; done: boolean; bytes: number[] } | { kind: 'failed'; cause: unknown };

/**
 * Hands status to the public client before touching body bytes; its discard cancels the actual browser body.
 * All ownership is local to this request. A zero-watermark stream does not pull before the SDK reads it.
 */
export async function retainPageResponse(owned: JSHandle<PageResponseState>): Promise<Response> {
  let pendingRead: Promise<PageResponseRead> | undefined;
  let cancelled = false;
  /** Reads callback-mutated cancellation afresh at each awaited protocol boundary. */
  const isCancelled = (): boolean => cancelled;
  let releasing:
    | Promise<{
        causes: unknown[];
        readFailureIncluded: boolean;
        pendingReadFailureIncluded: boolean;
      }>
    | undefined;

  const release = (discard: boolean) =>
    (releasing ??= (async () => {
      const joining = pendingRead;
      let causes: unknown[] = [];
      let readFailureIncluded = false;
      let pendingReadFailureIncluded = false;
      try {
        const cleaned = await owned.evaluate(async (state, discard) => {
          const reading = state.reading;
          let cancelFailure: { cause: unknown } | null = null;
          if (discard) {
            try {
              if (state.reader !== null) await state.reader.cancel();
              else if (state.response.body !== null) await state.response.body.cancel();
            } catch (cause) {
              cancelFailure = { cause };
            }
          }
          const read = reading === null ? null : await reading;
          const causes: unknown[] = [];
          if (read?.kind === 'failed') causes.push(read.cause);
          // An errored reader's cancel rejects with the same stored read reason; retain that rejection once.
          if (
            cancelFailure !== null &&
            !(read?.kind === 'failed' && Object.is(read.cause, cancelFailure.cause))
          )
            causes.push(cancelFailure.cause);
          if (state.reader !== null) {
            try {
              state.reader.releaseLock();
            } catch (cause) {
              causes.push(cause);
            }
            state.reader = null;
          }
          return { causes, readFailureIncluded: read?.kind === 'failed' };
        }, discard);
        causes = cleaned.causes;
        readFailureIncluded = cleaned.readFailureIncluded;
      } catch (cause) {
        causes.push(cause);
      }
      if (joining !== undefined) {
        try {
          await joining;
        } catch (cause) {
          pendingReadFailureIncluded = true;
          causes.push(cause);
        }
      }
      try {
        await owned.dispose();
      } catch (cause) {
        causes.push(cause);
      }
      return { causes, readFailureIncluded, pendingReadFailureIncluded };
    })());

  const refuse = (causes: unknown[]): void => {
    if (causes.length === 1) throw causes[0];
    if (causes.length > 1)
      throw new AggregateError(causes, 'Page response operation and cleanup failed', {
        cause: causes[0],
      });
  };
  let metadata: { status: number; headers: [string, string][]; hasBody: boolean };
  try {
    metadata = await owned.evaluate(({ response }) => ({
      status: response.status,
      headers: [...response.headers.entries()],
      hasBody: response.body !== null,
    }));
  } catch (primary) {
    const cleanup = await release(true);
    refuse([primary, ...cleanup.causes]);
    throw primary;
  }
  if (!metadata.hasBody || metadata.status === 0 || [204, 205, 304].includes(metadata.status)) {
    const cleanup = await release(metadata.hasBody);
    refuse(cleanup.causes);
    if (metadata.status === 0) return Response.error();
    return new Response(null, { status: metadata.status, headers: metadata.headers });
  }
  const stream = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        if (isCancelled()) return;
        const reading = owned.evaluate((state): Promise<PageResponseRead> => {
          if (state.reader === null) {
            if (state.response.body === null)
              return Promise.resolve({ kind: 'chunk', done: true, bytes: [] });
            state.reader = state.response.body.getReader();
          }
          state.reading = state.reader.read().then(
            (chunk): PageResponseRead => ({
              kind: 'chunk',
              done: chunk.done,
              bytes: chunk.done ? [] : [...chunk.value],
            }),
            (cause: unknown): PageResponseRead => ({ kind: 'failed', cause }),
          );
          return state.reading;
        });
        pendingRead = reading;
        let read: PageResponseRead;
        try {
          read = await reading;
        } catch (primary) {
          if (isCancelled()) return;
          const cleanup = await release(true);
          if (isCancelled()) return;
          refuse(
            cleanup.pendingReadFailureIncluded ? cleanup.causes : [primary, ...cleanup.causes],
          );
          throw primary;
        }
        if (isCancelled()) return;
        if (read.kind === 'failed') {
          const cleanup = await release(true);
          if (isCancelled()) return;
          refuse(cleanup.readFailureIncluded ? cleanup.causes : [read.cause, ...cleanup.causes]);
          throw read.cause;
        }
        if (read.done) {
          const cleanup = await release(false);
          if (isCancelled()) return;
          refuse(cleanup.causes);
          controller.close();
        } else controller.enqueue(new Uint8Array(read.bytes));
      },
      async cancel() {
        cancelled = true;
        const cleanup = await release(true);
        refuse(cleanup.causes);
      },
    },
    { highWaterMark: 0 },
  );
  try {
    return new Response(stream, { status: metadata.status, headers: metadata.headers });
  } catch (primary) {
    cancelled = true;
    const cleanup = await release(true);
    refuse([primary, ...cleanup.causes]);
    throw primary;
  }
}

/**
 * Encodes actual requests canonically and retains their browser response until SDK consumption or discard.
 * Client pre/post-await cancellation is preserved; this bridge does not forward a network AbortSignal.
 */
export function pageTransport(page: Page, organizationId: string): ClientTransport {
  const fixture = readOrdinaryFixture();
  if (organizationId !== fixture.organizationId)
    throw new ClientConfigurationError(
      'Ordinary transport organization differs from its current run',
    );
  const send = fetchTransport(
    fixture.appOrigin,
    async (url, init) => {
      if (
        new URL(url).origin !== fixture.appOrigin ||
        new URL(page.url()).origin !== fixture.appOrigin
      )
        throw new ClientConfigurationError('Ordinary transport refuses a foreign origin');
      const body = init.body;
      if (body !== undefined && typeof body !== 'string')
        throw new ClientConfigurationError('Canonical ordinary request body is not encoded JSON');
      const owned = await page.evaluateHandle(
        async ({ url, method, headers, body, redirect }): Promise<PageResponseState> => ({
          response: await fetch(url, { method, headers, body, redirect }),
          reader: null,
          reading: null,
        }),
        {
          url,
          method: init.method,
          headers: [...new Headers(init.headers).entries()],
          body,
          redirect: init.redirect,
        },
      );
      return retainPageResponse(owned);
    },
    DEPENDENCY_SEMANTICS,
  );
  return (shape, input) =>
    send(shape, {
      ...input,
      headers: prepareOrdinaryHeaders(shape, organizationId, input.headers),
    });
}

export function fixtureSuccess<T extends { kind: string; status?: number }>(
  operation: string,
  reply: T,
): Extract<T, { kind: 'success' }> {
  if (reply.kind !== 'success') throw new Error(`${operation} refused: ${JSON.stringify(reply)}`);
  return reply as Extract<T, { kind: 'success' }>;
}

/** Generated-shape client pins the current ordinary organization through authenticated same-origin fetch. */
export function fixtureClient(page: Page) {
  return clientFromShapes(
    [
      createWorkPackage,
      createProject,
      readWorkPackage,
      applyWorkPackageCommands,
      applyDirectoryCommands,
      getWorkItems,
      listWorkPackages,
      listTags,
    ] as const,
    pageTransport(page, readOrdinaryFixture().organizationId),
  );
}

interface FixtureCommand {
  kind: string;
  ref?: string;
}

interface FixtureCommandResult {
  index: number;
  ref?: string;
  id?: string;
}

const IDENTITY_COMMANDS = new Set(['createTag', 'createWorkItem']);

/** Correlates a successful fixture batch body with its exact submitted command order. */
export function assertCommandResults(
  operation: string,
  commands: readonly FixtureCommand[],
  results: readonly FixtureCommandResult[],
): Record<string, string> {
  if (results.length !== commands.length)
    throw new Error(
      `${operation} returned ${String(results.length)} of ${String(commands.length)} results`,
    );
  const identities: [string, string][] = [];
  for (const [index, command] of commands.entries()) {
    const answer = results[index];
    // Proof: removing this correlation let empty, missing, index999 and
    // duplicate-index authored HTTP200 bodies reach the next write/tree read.
    if (answer.index !== index)
      throw new Error(
        `${operation} result at ${String(index)} has index ${String(answer.index)}, expected ${String(index)}`,
      );
    if (answer.ref !== command.ref)
      throw new Error(
        `${operation} result at ${String(index)} has ref ${String(answer.ref)}, expected ${String(command.ref)}`,
      );
    if (!IDENTITY_COMMANDS.has(command.kind)) continue;
    if (command.ref === undefined)
      throw new Error(`${operation} identity command at ${String(index)} has no submitted ref`);
    if (typeof answer.id !== 'string')
      throw new Error(`${operation} result at ${String(index)} has no id for ${command.ref}`);
    identities.push([command.ref, answer.id]);
  }
  return Object.fromEntries(identities);
}

/** Seeds one independently named plan through validated public HTTP shapes and verifies its stored state. */
export async function seedPlan(
  page: Page,
  recipe: PlanRecipe,
  identity: PlanFixtureIdentity,
): Promise<SeededPlan> {
  const recipeRows = normalizeRecipeRows(recipe);
  await page.goto('/');
  await assertOrdinaryAccount(page);
  const client = fixtureClient(page);
  const workPackageName = fixtureName(recipe.name, identity);
  let projectId = readOrdinaryFixture().projectId;
  if (recipe.steps !== undefined) {
    const project = fixtureSuccess(
      'postApiProjects',
      await client.postApiProjects({ body: { name: workPackageName } }),
    ).body.project;
    projectId = project.id;
    const ordinary = readOrdinaryFixture();
    await bindFixtureSteps(
      page.request,
      ordinary.appOrigin,
      ordinary.organizationId,
      projectId,
      recipe.steps,
    );
  }
  const created = fixtureSuccess(
    'postApiWorkPackages',
    await client.postApiWorkPackages({
      body: { projectId, name: workPackageName },
    }),
  ).body;
  const workPackageId = created.workPackage.id;
  const read = fixtureSuccess(
    'getApiWorkPackagesById',
    await client.getApiWorkPackagesById({ params: { id: workPackageId } }),
  ).body;
  const stepIdByName = new Map(read.steps.map((step) => [step.name, step.id]));
  const stepIds = Object.fromEntries(stepIdByName);

  const tags = (recipe.tags ?? []).map((tag) => ({
    kind: 'createTag' as const,
    ref: tag.ref,
    name: fixtureName(tag.name, identity),
  }));
  const tagIds: Record<string, string> = {};
  // Proof: sending all 201 real tag commands together reached be-01 and was
  // refused as too_many_commands at index 200 instead of producing [200, 1].
  for (let start = 0; start < tags.length; start += CHUNK_SIZE) {
    const commands = tags.slice(start, start + CHUNK_SIZE);
    const answer = fixtureSuccess(
      'postApiDirectoryCommands',
      await client.postApiDirectoryCommands({ body: { commands } }),
    );
    Object.assign(
      tagIds,
      assertCommandResults('postApiDirectoryCommands', commands, answer.body.results),
    );
  }

  const storedTags = fixtureSuccess('getApiTags', await client.getApiTags({})).body.tags;
  const storedTagById = new Map(storedTags.map((tag) => [tag.id, tag]));
  for (const tag of tags) {
    const tagId = tagIds[tag.ref];
    // Proof: removing this directory comparison made the swapped-successful-tag-ids
    // case resolve and start its work package commands instead of refusing here.
    expect(storedTagById.get(tagId)?.name, `stored tag identity for ${tag.ref}`).toBe(tag.name);
  }

  const rowIdByRef = new Map<string, string>();
  for (let start = 0; start < recipeRows.length; start += CHUNK_SIZE) {
    const rows = recipeRows.slice(start, start + CHUNK_SIZE);
    const localRefs = new Set(rows.map((row) => row.ref));
    const commands: PlanCommandWire[] = rows.map((row) => {
      const { afterRef } = row;
      let placement: { afterId: string | null } | { afterRef: string };
      if (afterRef === null) {
        placement = { afterId: null };
      } else if (localRefs.has(afterRef)) {
        placement = { afterRef };
      } else {
        const afterId = rowIdByRef.get(afterRef);
        if (afterId === undefined)
          throw new Error(`recipe row ${row.ref} follows unresolved ref: ${afterRef}`);
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
      'postApiWorkPackagesByIdCommands',
      await client.postApiWorkPackagesByIdCommands({
        params: { id: workPackageId },
        body: { commands },
      }),
    );
    for (const [ref, id] of Object.entries(
      assertCommandResults('postApiWorkPackagesByIdCommands', commands, answer.body.results),
    ))
      rowIdByRef.set(ref, id);
  }

  const rowIds = Object.fromEntries(rowIdByRef);

  const authored: PlanCommandWire[] = recipeRows.flatMap((row) => {
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
    const answer = fixtureSuccess(
      'postApiWorkPackagesByIdCommands',
      await client.postApiWorkPackagesByIdCommands({
        params: { id: workPackageId },
        body: { commands },
      }),
    );
    assertCommandResults('postApiWorkPackagesByIdCommands', commands, answer.body.results);
  }

  const tree = fixtureSuccess(
    'getApiWorkPackagesByIdWork-items',
    await client['getApiWorkPackagesByIdWork-items']({ params: { id: workPackageId } }),
  ).body;
  // Proof: replacing this original-recipe placement calculation with recipe array
  // order made the explicit sibling case expect [a,b,c] from the stored [a,c,b].
  expect(tree.workItems.map((row) => row.id)).toEqual(
    calculateExpectedRowRefs(recipe.rows).map((ref) => rowIds[ref]),
  );
  for (const expected of recipeRows) {
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
    expect([...stored.tagIds].sort(), `stored tag ids for ${expected.ref}`).toEqual(
      (expected.tagRefs ?? []).map((ref) => tagIds[ref]).sort(),
    );
  }
  return { projectId, workPackageId, workPackageName, rowIds, stepIds, tagIds };
}

/** Opens a seeded plan through the real picker-facing selected-work-package state. */
export async function openSeededPlan(
  page: Page,
  seeded: Pick<SeededPlan, 'workPackageId' | 'workPackageName'>,
): Promise<void> {
  await page.goto('/');
  const picker = page.getByRole('combobox', { name: 'Work package' });
  await picker.click();
  await expect(page.getByRole('listbox', { name: 'Work packages' })).toBeVisible();
  await picker.fill(seeded.workPackageName);
  const optionId = await page.evaluate(
    (id) => CSS.escape('work-package-option-' + id),
    seeded.workPackageId,
  );
  await page
    .getByRole('listbox', { name: 'Work packages' })
    .locator('#' + optionId)
    .click();
  await expect(picker).toHaveValue(seeded.workPackageName);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('wbs.workPackage')))
    .toBe(seeded.workPackageId);
}
