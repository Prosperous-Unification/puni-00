import { expect, type Page } from '@playwright/test';

import { createProject } from './create-project';

/** One JSON POST through the page's own session, so the API sees a signed-in reader. */
async function jsonPost<T>(page: Page, path: string, body: unknown): Promise<T> {
  return page.evaluate(
    async ({ at, value }) => {
      const response = await fetch(at, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value),
      });
      if (!response.ok) {
        throw new Error(`POST ${at} failed: ${String(response.status)} ${await response.text()}`);
      }
      return response.json() as Promise<T>;
    },
    { at: path, value: body },
  );
}

/**
 * A plan whose step cells read five different words, written through the API
 * the way an executor would record its attempts (`step-node-readings` D4):
 *
 * - `010`: Dev done, QA **waiting** after attempts failed, failed, cancelled —
 *   the last by Ada Lovelace under `PR-42`. The row folds to in progress,
 *   because an ended attempt keeps a silent QA in the fold.
 * - `020`: Dev in progress, QA unknown.
 * - `030`: on hold, so both nodes read on hold.
 * - `040`: nobody has said anything: unknown on both.
 *
 * Every leaf carries an estimate and `010` an assignee, so the corner glyph is
 * seen beside a figure and a person's initials, the cell's fullest reading.
 */
export async function seedStepReadings(page: Page): Promise<{ projectId: string }> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'local-dev' })).toBeVisible();
  await createProject(page, 'Step readings');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('wbs.project'))).not.toBeNull();
  const projectId = await page.evaluate(() => localStorage.getItem('wbs.project'));
  if (projectId === null) throw new Error('no project id after creating the plan');

  const plan = await page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}/work-items`);
    return response.json() as Promise<{ steps: { id: string; name: string }[] }>;
  }, projectId);
  const stepId = (name: string): string => {
    const step = plan.steps.find((each) => each.name === name);
    if (step === undefined) throw new Error(`a new project has no ${name} step`);
    return step.id;
  };
  const dev = stepId('Dev');
  const qa = stepId('QA');

  const created = await jsonPost<{ results: { entity?: { id: string } }[] }>(
    page,
    '/api/directory/commands',
    { commands: [{ kind: 'createPerson', name: 'Ada Lovelace' }] },
  );
  const ada = created.results[0]?.entity?.id;
  if (ada === undefined) throw new Error('the person create answered no entry');

  const names = ['Checkout flow', 'Payment retries', 'Receipt email', 'Refund policy'];
  const refs = ['r010', 'r020', 'r030', 'r040'];
  const commands = (list: Record<string, unknown>[]) =>
    jsonPost(page, `/api/projects/${projectId}/commands`, { commands: list });
  await commands([
    ...names.map((name, at) => ({
      kind: 'createWorkItem',
      ref: refs[at],
      parentId: null,
      ...(at === 0 ? { afterId: null } : { afterRef: refs[at - 1] }),
      name,
    })),
    ...refs.flatMap((ref, at) => [
      {
        kind: 'setEstimate',
        workItemRef: ref,
        stepId: dev,
        days: { optimistic: 2 + at, realistic: 3 + at, pessimistic: 5 + at },
      },
      {
        kind: 'setEstimate',
        workItemRef: ref,
        stepId: qa,
        days: { optimistic: 1, realistic: 2, pessimistic: 3 },
      },
    ]),
    { kind: 'setAssignee', workItemRef: 'r010', stepId: qa, personId: ada },
    { kind: 'setProgress', workItemRef: 'r010', stepId: dev, state: 'done' },
    { kind: 'setProgress', workItemRef: 'r020', stepId: dev, state: 'in_progress' },
    { kind: 'setStatus', workItemRef: 'r030', status: 'on_hold' },
  ]);

  const tree = await page.evaluate(async (id) => {
    const response = await fetch(`/api/projects/${id}/work-items`);
    return response.json() as Promise<{ workItems: { id: string; number: string }[] }>;
  }, projectId);
  const first = tree.workItems.find((row) => row.number === '010')?.id;
  if (first === undefined) throw new Error('010 was not created');
  // One batch per attempt: an attempt's end must not precede its start, and
  // both default to now, so each pair lands in its own round trip.
  for (const [outcome, extra] of [
    ['failed', {}],
    ['failed', {}],
    ['cancelled', { executorPersonId: ada, reference: 'PR-42' }],
  ] as const) {
    await commands([{ kind: 'startAttempt', workItemId: first, stepId: qa, ...extra }]);
    await commands([{ kind: 'endAttempt', workItemId: first, stepId: qa, outcome }]);
  }
  await page.reload();
  await expect(page.getByLabel('Name of 040')).toBeVisible();
  return { projectId };
}
