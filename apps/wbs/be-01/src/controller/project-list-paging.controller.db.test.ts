import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

/**
 * `GET /api/projects` paging (`list-search-and-paging`, spec `list-reads`), over
 * real SQLite and the production organization access; see {@link OrganizationHarness}.
 */
let h: OrganizationHarness;

beforeEach(async () => {
  h = OrganizationHarness.open();
  for (const username of ['ada', 'grace']) await h.register(username);
  h.organization('org-a');
  h.organization('org-b');
  h.member('org-a', 'ada', 'member');
  h.member('org-b', 'grace', 'member');
  h.bind('ada', 'org-a');
  h.bind('grace', 'org-b');
  h.activate();
});

afterEach(() => {
  h.close();
});

interface Entry {
  id: string;
  name: string;
  updatedAt: number | null;
}
interface Page {
  projects: Entry[];
  nextCursor: string | null;
}

async function create(username: string, name: string, updatedAt: number | null): Promise<string> {
  const answer = await h.call(username, 'POST', '/api/projects', { name });
  if (answer.status !== 200) throw new Error(`create refused: ${JSON.stringify(answer)}`);
  const id = (answer.body as { project: { id: string } }).project.id;
  h.sqlite.run('UPDATE project SET updated_at = ? WHERE id = ?', [updatedAt, id]);
  return id;
}

async function list(username: string, search: string): Promise<Page> {
  const answer = await h.call(username, 'GET', `/api/projects${search}`);
  if (answer.status !== 200) throw new Error(`list refused: ${JSON.stringify(answer)}`);
  return answer.body as Page;
}

/** Follows `nextCursor` to the end, answering each page's names. */
async function walk(username: string, search: string): Promise<string[][]> {
  const pages: string[][] = [];
  let page = await list(username, `?${search}`);
  for (;;) {
    pages.push(page.projects.map((entry) => entry.name));
    if (page.nextCursor === null) return pages;
    page = await list(username, `?${search}&cursor=${page.nextCursor}`);
  }
}

describe('GET /api/projects', () => {
  it('answers the parameterless list in the recency order, adding updatedAt and a null nextCursor', async () => {
    await create('ada', 'Old', 50);
    await create('ada', 'New', 10);
    const page = await list('ada', '');
    // Never opened, so newest created first, whatever the update instants say.
    expect(page.projects.map((entry) => [entry.name, entry.updatedAt])).toEqual([
      ['New', 10],
      ['Old', 50],
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('pages only the caller’s organization, newest update first', async () => {
    for (const [name, at] of [
      ['A1', 1],
      ['A2', 2],
      ['A3', 3],
    ] as const)
      await create('ada', name, at);
    for (let index = 0; index < 30; index += 1)
      await create('grace', `B${String(index)}`, 100 + index);
    expect(await walk('ada', 'limit=2')).toEqual([['A3', 'A2'], ['A1']]);
  });

  it('puts a null instant last, breaks a tie by id, and resumes after the key', async () => {
    const tied = [
      { id: await create('ada', 'tied-1', 5), name: 'tied-1' },
      { id: await create('ada', 'tied-2', 5), name: 'tied-2' },
    ];
    await create('ada', 'never', null);
    // Id descending breaks the tie.
    const [first, second] = tied.sort((left, right) => (left.id < right.id ? 1 : -1));
    expect(await walk('ada', 'limit=1')).toEqual([[first.name], [second.name], ['never']]);
  });

  it('filters by name and by an inclusive updatedSince that never matches null', async () => {
    await create('ada', 'Roof Repair', 1000);
    await create('ada', 'Garden', 999);
    await create('ada', 'roofline', null);
    expect(await walk('ada', 'q=ROOF')).toEqual([['Roof Repair', 'roofline']]);
    expect(await walk('ada', 'updatedSince=1000')).toEqual([['Roof Repair']]);
    expect(await walk('ada', 'updatedSince=999&q=DEN')).toEqual([['Garden']]);
  });

  it('moves a project first when one of its work items is edited', async () => {
    const edited = await create('ada', 'Edited', 1);
    await create('ada', 'Other', 2);
    h.sqlite.run(
      "INSERT INTO work_item (id, project_id, parent_id, position, name, updated_at) VALUES ('w-1', ?, NULL, 0, 'Work', 3)",
      [edited],
    );
    expect((await list('ada', '?limit=1')).projects.map((entry) => entry.name)).toEqual(['Edited']);
  });

  it('refuses every value outside the grammar with 400', async () => {
    await create('ada', 'Plan', 1);
    const foreignShape = btoa(JSON.stringify({ v: 1, after: 'x' })).replace(/=+$/, '');
    for (const search of [
      'limit=0',
      'limit=201',
      'limit=ten',
      'limit=5&limit=6',
      'q=%20',
      'updatedSince=soon',
      'cursor=%2B%2F',
      `cursor=${foreignShape}`,
      'sort=name',
    ]) {
      const answer = await h.call('ada', 'GET', `/api/projects?${search}`);
      expect({ search, status: answer.status, body: answer.body }).toEqual({
        search,
        status: 400,
        body: { error: 'invalid_query' },
      });
    }
  });
});
