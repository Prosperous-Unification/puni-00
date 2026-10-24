import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * The claim history read over be-01's production composition and real SQLite
 * (`wbs-claim-display` C13, review S1-1): a claim made beside another command
 * in one `POST /commands` batch is recorded as one `batch` plan event, which
 * the store finds through SQLite's `json_tree`. This also proves `json_tree`
 * exists in the SQLite build be-01 runs on.
 */
let h: OrganizationHarness;
let projectId: string;
let leaf: string;
let other: string;

beforeEach(async () => {
  h = OrganizationHarness.openComposedWith({});
  await h.register('mem');
  h.organization('org-a');
  h.member('org-a', 'mem', 'member');
  h.bind('mem', 'org-a');
  h.activate();
  const created = await h.call('mem', 'POST', '/api/projects', { name: 'Claims' });
  if (created.status !== 200) throw new Error(`create refused: ${JSON.stringify(created)}`);
  projectId = (created.body as { project: { id: string } }).project.id;
  const rows = await h.call('mem', 'POST', `/api/projects/${projectId}/commands`, {
    commands: [
      { kind: 'createWorkItem', parentId: null, name: 'Leaf' },
      { kind: 'createWorkItem', parentId: null, name: 'Other' },
    ],
  });
  if (rows.status !== 200) throw new Error(`rows refused: ${JSON.stringify(rows)}`);
  const results = (rows.body as { results: { id: string }[] }).results;
  expect(results).toHaveLength(2);
  [leaf, other] = results.map(({ id }) => id);
  // This history fixture begins with running nodes, so claiming every step
  // remains valid under workflow prerequisites.
  h.sqlite
    .query(
      "INSERT INTO step_progress(work_item_id,step_id,state,stated_at) SELECT w.id,s.id,'in_progress',1 FROM work_item w JOIN step s ON s.project_id=w.project_id WHERE w.project_id=?",
    )
    .run(projectId);
  h.sqlite.run('INSERT INTO person (id, name, kind, account_id) VALUES (?, ?, ?, ?)', [
    'claire',
    'root-claire',
    'agent',
    h.userId('mem'),
  ]);
  h.sqlite.run(
    'INSERT INTO person_organization (resource_id, organization_id, name) VALUES (?, ?, ?)',
    ['claire', 'org-a', 'claire'],
  );
});

afterEach(() => {
  h.close();
});

describe('the claim history read over a real batch', () => {
  it('lists a claim made beside setProgress in one batch', async () => {
    const step = h.sqlite
      .query<{ id: string }, [string]>(
        'SELECT id FROM step WHERE project_id = ? ORDER BY position LIMIT 1',
      )
      .get(projectId)?.id;
    if (step === undefined) throw new Error('the project has no step');
    const batch = await h.call('mem', 'POST', `/api/projects/${projectId}/commands`, {
      commands: [
        { kind: 'claimWorkItem', workItemId: leaf, personId: 'claire', runId: 'run-1' },
        { kind: 'setProgress', workItemId: other, stepId: step, state: 'in_progress' },
      ],
    });
    expect(batch.status).toBe(200);
    const stored = h.sqlite
      .query<{ id: string; kind: string }, [string]>(
        "SELECT id, kind FROM plan_event WHERE project_id = ? AND kind IN ('claim', 'batch') ORDER BY created_at DESC, id DESC",
      )
      .all(projectId);
    // The claim is recorded inside the batch's one event, not as a `claim`;
    // the older batch is the setup's two `createWorkItem`s, which claim nothing.
    expect(stored.map(({ kind }) => kind)).toEqual(['batch', 'batch']);
    const read = await h.call('mem', 'GET', `/api/projects/${projectId}/claim-history`);
    expect(read.status).toBe(200);
    const events = (
      read.body as {
        events: {
          eventId: string;
          act: number;
          kind: string;
          reason: string;
          claims: { workItemId: string; runId: string; holder: unknown }[];
        }[];
      }
    ).events;
    expect(
      events.map(({ eventId, act, kind, reason, claims }) => ({
        eventId,
        act,
        kind,
        reason,
        claims: [
          ...new Set(
            claims.map(({ workItemId, runId, holder }) =>
              JSON.stringify({ workItemId, runId, holder }),
            ),
          ),
        ],
      })),
    ).toEqual([
      {
        eventId: stored[0]?.id,
        act: 0,
        kind: 'claim',
        reason: 'claimed',
        claims: [
          JSON.stringify({
            workItemId: leaf,
            runId: 'run-1',
            holder: { personId: 'claire', name: 'claire' },
          }),
        ],
      },
    ]);
  });
});
