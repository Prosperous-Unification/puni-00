import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * Budget admission (`wbs-measure-budgets` D69): `startAttempt` refuses
 * `budget_exhausted` inside its own write when a strict budget of the work
 * item or an ancestor has nothing left or the attempt's hold would not fit,
 * over real SQLite and the production organization access
 * ({@link OrganizationHarness.openComposed}). The decision's cases are in
 * `budget-admission.test.ts` (domain) and the race in
 * `budget-admission-race.db.test.ts` (store-sqlite).
 */
let h: OrganizationHarness;
let own: string;
let dev: string;
let parent: string;
let a: string;
let b: string;

beforeEach(async () => {
  h = OrganizationHarness.openComposed();
  await h.register('ada');
  h.organization('org-a');
  h.member('org-a', 'ada', 'member');
  h.bind('ada', 'org-a');
  h.activate();
  const created = await h.call('ada', 'POST', '/api/projects', { name: 'Admission' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  own = (created.body as { project: { id: string } }).project.id;
  const first = h.sqlite
    .query<{ id: string }, [string]>('SELECT id FROM step WHERE project_id = ? ORDER BY position')
    .get(own)?.id;
  if (first === undefined) throw new Error('the project has no step');
  dev = first;
  const built = await batch([
    { kind: 'createWorkItem', ref: 'P', name: 'P', parentId: null, afterId: null },
    { kind: 'createWorkItem', ref: 'A', name: 'A', parentRef: 'P', parentId: null, afterId: null },
    {
      kind: 'createWorkItem',
      ref: 'B',
      name: 'B',
      parentRef: 'P',
      parentId: null,
      afterId: null,
      afterRef: 'A',
    },
  ]);
  const results = (built.body as { results: { ref?: string; id?: string }[] }).results;
  const idOf = (ref: string): string => {
    const id = results.find((each) => each.ref === ref)?.id;
    if (id === undefined) throw new Error(`no ${ref}: ${JSON.stringify(built)}`);
    return id;
  };
  [parent, a, b] = [idOf('P'), idOf('A'), idOf('B')];
});

afterEach(() => {
  h.close();
});

function send(commands: readonly unknown[]) {
  return h.call('ada', 'POST', `/api/projects/${own}/commands`, { commands });
}

async function batch(commands: readonly unknown[]) {
  const answer = await send(commands);
  if (answer.status !== 200) throw new Error(`batch refused: ${JSON.stringify(answer)}`);
  return answer;
}

const start = (workItemId: string) => ({ kind: 'startAttempt', workItemId, stepId: dev });

function attempts(): number {
  const counted = h.sqlite
    .query<{ n: number }, []>('SELECT count(*) AS n FROM step_node_attempt')
    .get();
  if (counted === null) throw new Error('count read nothing');
  return counted.n;
}

describe('budget admission at the attempt start', () => {
  it('refuses the second start of a strict 500 holding 300, naming the budget', async () => {
    await batch([
      {
        kind: 'setBudget',
        workItemId: parent,
        measure: 'tokens',
        cap: 500,
        policy: 'strict',
        holdPerAttempt: 300,
      },
    ]);
    expect(await send([start(a)])).toMatchObject({ status: 200 });
    expect(await send([start(b)])).toEqual({
      status: 409,
      body: {
        at: 0,
        kind: 'startAttempt',
        error: 'budget_exhausted',
        workItemId: parent,
        measure: 'tokens',
        remaining: 200,
        hold: 300,
        blocked: false,
      },
    });
    expect(attempts()).toBe(1);
    // A's attempt ends with no fact recorded: it holds nothing, and B fits.
    await batch([{ kind: 'endAttempt', workItemId: a, stepId: dev, outcome: 'succeeded' }]);
    expect(await send([start(b)])).toMatchObject({ status: 200 });
  });

  it('admits both starts under an advisory 500 holding 300', async () => {
    await batch([
      {
        kind: 'setBudget',
        workItemId: parent,
        measure: 'tokens',
        cap: 500,
        policy: 'advisory',
        holdPerAttempt: 300,
      },
    ]);
    expect(await send([start(a)])).toMatchObject({ status: 200 });
    expect(await send([start(b)])).toMatchObject({ status: 200 });
    expect(attempts()).toBe(2);
  });

  it('refuses a start under a strict budget blocked by two rate cards, remainder unknown', async () => {
    const priced = (workItemId: string, rateCardDigest: string) => ({
      kind: 'setMeasure',
      workItemId,
      stepId: dev,
      metric: 'cost',
      value: 10,
      rateCardDigest,
    });
    await batch([
      priced(a, 'card-a'),
      priced(b, 'card-b'),
      { kind: 'setBudget', workItemId: parent, measure: 'cost', cap: 1000, policy: 'strict' },
    ]);
    expect(await send([start(a)])).toEqual({
      status: 409,
      body: {
        at: 0,
        kind: 'startAttempt',
        error: 'budget_exhausted',
        workItemId: parent,
        measure: 'cost',
        remaining: null,
        hold: 0,
        blocked: true,
      },
    });
    expect(attempts()).toBe(0);
  });

  it('rolls back the whole batch a refused start ends', async () => {
    await batch([
      {
        kind: 'setBudget',
        workItemId: parent,
        measure: 'tokens',
        cap: 500,
        policy: 'strict',
        holdPerAttempt: 300,
      },
    ]);
    expect(await send([start(a), start(b)])).toMatchObject({
      status: 409,
      body: { at: 1, error: 'budget_exhausted' },
    });
    expect(attempts()).toBe(0);
  });
});
