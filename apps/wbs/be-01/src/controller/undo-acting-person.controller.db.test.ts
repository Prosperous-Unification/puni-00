import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { callForwarded, forwardingMachineGrants } from '../testing/mcp-forwarded-call';
import {
  type Answer,
  type HarnessMachineGrants,
  OrganizationHarness,
} from '../testing/organization-harness';

let machineGrants: HarnessMachineGrants;
let h: OrganizationHarness;
let projectId: string;
let humanLeaf: string;
let codexLeaf: string;
let claudeLeaf: string;
let codexKey: string;
let claudeKey: string;
let qa: string;

/**
 * One undo stack per (project, account, acting person), over HTTP through
 * be-01's production composition and real SQLite. `codex` and `claude` are
 * agent persons bound to `dany`'s account, each with its own API key: both act
 * as `dany`'s account, and neither may undo, clear the redo of, or prune the
 * stack of `dany` or of each other. The agents' keys reach be-01 through
 * mcp-01's forwarded grant ({@link callForwarded}).
 */
beforeAll(async () => {
  machineGrants = await forwardingMachineGrants();
});

beforeEach(async () => {
  h = OrganizationHarness.openComposedWith({ machineGrants });
  await h.register('dany');
  h.organization('org-a');
  h.member('org-a', 'dany', 'super_admin');
  h.bind('dany', 'org-a');
  h.activate();
  const created = await h.call('dany', 'POST', '/api/projects', { name: 'Plan of A' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  const opened = created.body as { project: { id: string }; steps: { id: string; name: string }[] };
  projectId = opened.project.id;
  const qaStep = opened.steps.find(({ name }) => name === 'QA');
  if (qaStep === undefined) throw new Error('a project without its seed step QA');
  qa = qaStep.id;
  const rows = await h.call('dany', 'POST', `/api/projects/${projectId}/commands`, {
    commands: ['Human', 'Codex', 'Claude'].map((name) => ({
      kind: 'createWorkItem',
      parentId: null,
      name,
    })),
  });
  if (rows.status !== 200) throw new Error(`leaves refused: ${JSON.stringify(rows)}`);
  const ids = (rows.body as { results: { id: string }[] }).results.map(({ id }) => id);
  [humanLeaf = '', codexLeaf = '', claudeLeaf = ''] = ids;
  for (const person of ['codex', 'claude'])
    addAgentPerson(h.sqlite, person, 'org-a', h.userId('dany'));
  codexKey = (
    await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId: 'codex',
      issuedBy: h.userId('dany'),
    })
  ).key;
  claudeKey = (
    await issueApiKey(h.sqlite, {
      organizationId: 'org-a',
      personId: 'claude',
      issuedBy: h.userId('dany'),
    })
  ).key;
});

afterEach(async () => {
  await h.closeComposed();
});

type Actor = 'dany' | 'codex' | 'claude';

function as(actor: Actor, method: string, path: string, body?: unknown): Promise<Answer> {
  if (actor === 'dany') return h.call('dany', method, path, body);
  return callForwarded(h, actor === 'codex' ? codexKey : claudeKey, method, path, body);
}

/** Renames as `actor`, answering the batch's own report of the actor's stack. */
async function rename(
  actor: Actor,
  workItemId: string,
  name: string,
): Promise<{ undoable: boolean; redoable: boolean }> {
  const renamed = await as(actor, 'POST', `/api/projects/${projectId}/commands`, {
    commands: [{ kind: 'patchWorkItem', workItemId, patch: { name } }],
  });
  if (renamed.status !== 200) throw new Error(`rename refused: ${JSON.stringify(renamed)}`);
  const { undoable, redoable } = renamed.body as { undoable: boolean; redoable: boolean };
  return { undoable, redoable };
}

function press(actor: Actor, key: 'undo' | 'redo'): Promise<Answer> {
  return as(actor, 'POST', `/api/projects/${projectId}/${key}`);
}

function names(): Record<string, string> {
  const rows = h.sqlite
    .query<{ id: string; name: string }, []>('SELECT id, name FROM work_item')
    .all();
  return Object.fromEntries(rows.map(({ id, name }) => [id, name]));
}

async function undoState(actor: Actor): Promise<{ undoable: boolean; redoable: boolean }> {
  const tree = await as(actor, 'GET', `/api/projects/${projectId}/work-items`);
  if (tree.status !== 200) throw new Error(`tree refused: ${JSON.stringify(tree)}`);
  const { undoable, redoable } = tree.body as { undoable: boolean; redoable: boolean };
  return { undoable, redoable };
}

/** QA's allowance as the plan read shows it. */
async function qaAllowance(): Promise<number> {
  const read = await h.call('dany', 'GET', `/api/projects/${projectId}`);
  const steps = (read.body as { steps: { id: string; allowancePercent: number }[] }).steps;
  const held = steps.find(({ id }) => id === qa);
  if (held === undefined) throw new Error('QA is gone');
  return held.allowancePercent;
}

describe('undo per acting person over HTTP', () => {
  it("an agent's undo never reverts its human's edit", async () => {
    await rename('dany', humanLeaf, 'Human, renamed');
    await rename('codex', codexLeaf, 'Codex, renamed');
    await rename('dany', humanLeaf, 'Human, twice');

    expect(await press('codex', 'undo')).toMatchObject({ status: 200 });
    expect(names()[codexLeaf]).toBe('Codex');
    expect(names()[humanLeaf]).toBe('Human, twice');
    expect(await press('codex', 'undo')).toMatchObject({
      status: 409,
      body: { error: 'nothing_to_undo' },
    });
    expect(names()[humanLeaf]).toBe('Human, twice');
  });

  it("a human's undo never reverts their agent's edit", async () => {
    await rename('dany', humanLeaf, 'Human, renamed');
    await rename('codex', codexLeaf, 'Codex, renamed');

    expect(await press('dany', 'undo')).toMatchObject({ status: 200 });
    expect(names()[humanLeaf]).toBe('Human');
    expect(names()[codexLeaf]).toBe('Codex, renamed');
    expect(await undoState('codex')).toEqual({ undoable: true, redoable: false });
  });

  it('two keys on one account keep separate stacks', async () => {
    await rename('codex', codexLeaf, 'Codex, renamed');
    await rename('claude', claudeLeaf, 'Claude, renamed');

    expect(await press('codex', 'undo')).toMatchObject({ status: 200 });
    expect(names()[codexLeaf]).toBe('Codex');
    expect(names()[claudeLeaf]).toBe('Claude, renamed');
    expect(await undoState('codex')).toEqual({ undoable: false, redoable: true });
    expect(await undoState('claude')).toEqual({ undoable: true, redoable: false });
  });

  it("agent B's edit keeps agent A's redo, and the human's", async () => {
    await rename('dany', humanLeaf, 'Human, renamed');
    await rename('codex', codexLeaf, 'Codex, renamed');
    expect(await press('dany', 'undo')).toMatchObject({ status: 200 });
    expect(await press('codex', 'undo')).toMatchObject({ status: 200 });

    // The batch reports claude's own stack, not the account's redoable one.
    expect(await rename('claude', claudeLeaf, 'Claude, renamed')).toEqual({
      undoable: true,
      redoable: false,
    });

    expect(await press('codex', 'redo')).toMatchObject({ status: 200 });
    expect(await press('dany', 'redo')).toMatchObject({ status: 200 });
    expect(names()).toMatchObject({
      [humanLeaf]: 'Human, renamed',
      [codexLeaf]: 'Codex, renamed',
      [claudeLeaf]: 'Claude, renamed',
    });
  });

  it("an agent's fifty-one edits never prune its human's history", async () => {
    await rename('dany', humanLeaf, 'Human, renamed');
    for (let n = 0; n <= 50; n += 1) await rename('codex', codexLeaf, `Codex ${String(n)}`);
    // The human's next edit is the append whose prune would reach back past
    // the agent's burst, where the account's numbers jumped by fifty-one.
    await rename('dany', humanLeaf, 'Human, twice');

    expect(await press('dany', 'undo')).toMatchObject({ status: 200 });
    expect(await press('dany', 'undo')).toMatchObject({ status: 200 });
    expect(names()[humanLeaf]).toBe('Human');
    expect(names()[codexLeaf]).toBe('Codex 50');
  }, 30_000);

  // The step PATCH journals through `runCommandBatchAfter`, whose acting
  // person is its own derivation.
  // Proof: with `actingPersonOf(...)` in `runCommandBatchAfter` replaced by
  // null, the agent's undo answered 409 nothing_to_undo instead of 200 here
  // (5 pass, 1 fail; watched 2026-10-26).
  it("an agent's step allowance edit is undone on its own stack, never the human's", async () => {
    await rename('dany', humanLeaf, 'Human, renamed');
    const before = await qaAllowance();
    expect(
      await as('codex', 'PATCH', `/api/projects/${projectId}/steps/${qa}`, {
        allowancePercent: 25,
      }),
    ).toMatchObject({ status: 200 });
    expect(await qaAllowance()).toBe(25);

    expect(await press('codex', 'undo')).toMatchObject({ status: 200 });
    expect(await qaAllowance()).toBe(before);
    expect(names()[humanLeaf]).toBe('Human, renamed');
    expect(await press('dany', 'undo')).toMatchObject({ status: 200 });
    expect(names()[humanLeaf]).toBe('Human');
    expect(await qaAllowance()).toBe(before);
  });
});
