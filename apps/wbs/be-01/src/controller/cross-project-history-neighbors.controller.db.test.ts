import { MCP_INTERNAL_SECRET_HEADER } from '@wbs/contracts';
import { DEPENDENCY_SEMANTICS, DEPENDENCY_SEMANTICS_HEADER } from '@wbs/contracts/dependency-claim';
import { readPreconditions } from '@wbs/core/service/compensating';
import { afterEach, expect, test } from 'bun:test';

import { addAgentPerson, issueApiKey } from '../testing/machine-credential-fixture';
import { TEST_MACHINE_GRANT_ENV } from '../testing/machine-grant-fixture';
import { forwardingMachineGrants, requestGrant } from '../testing/mcp-forwarded-call';
import { closeFixture, harness, openFixture, readTables } from './cross-project-dependency-fixture';

afterEach(closeFixture);

function readLatestEntry(projectId: string) {
  const entry = harness.sqlite
    .query<{ id: string; preconditions: string }, [string]>(
      'SELECT id,preconditions FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
    )
    .get(projectId);
  if (entry === null) throw new Error('fixture history missing');
  return entry;
}

function readRemoteExpected(entryId: string) {
  const entry = harness.sqlite
    .query<{ preconditions: string }, [string]>(
      'SELECT preconditions FROM command_journal WHERE id=?',
    )
    .get(entryId);
  if (entry === null) throw new Error('fixture selected history missing');
  const revisions = readPreconditions(JSON.parse(entry.preconditions) as unknown).externalRevisions;
  if (revisions === undefined) throw new Error('fixture external revision guard missing');
  return revisions.expected;
}

// Proof: removing remote neighbor revision equality in WorkItemService.rebase made the
// older mounted undo return 200 and delete the relationship after a real A edit (2026-10-23).
for (const interveningEdit of [false, true])
  test(`mounted newer relationship undo ${interveningEdit ? 'preserves older remote conflict' : 'restamps a valid older neighbor'}`, async () => {
    const pushes: string[] = [];
    const fixture = await openFixture({ syntheticExternalCommands: true, pushes });
    const a = fixture.predecessor;
    const b = fixture.owner;
    const route = `/api/projects/${b.projectId}`;
    expect(
      (
        await fixture.request(`${route}/commands`, {
          commands: [{ kind: 'addTypedDependency', ...fixture.input }],
        })
      ).status,
    ).toBe(200);
    const older = readLatestEntry(b.projectId);
    const expectedRemote = readRemoteExpected(older.id);
    expect(expectedRemote).toHaveLength(1);
    expect(expectedRemote[0]).toMatchObject(a);
    const relationship = harness.sqlite
      .query<{ id: string }, []>('SELECT id FROM external_dependency')
      .get();
    if (relationship === null) throw new Error('fixture external relationship missing');
    if (interveningEdit)
      expect(
        (
          await fixture.request(`/api/projects/${a.projectId}/commands`, {
            commands: [
              {
                kind: 'patchWorkItem',
                workItemId: a.workItemId,
                patch: { notes: 'Real intervening remote edit' },
              },
            ],
          })
        ).status,
      ).toBe(200);
    const remoteHistory = harness.sqlite
      .query('SELECT * FROM command_journal WHERE project_id=? ORDER BY seq')
      .all(a.projectId);
    expect(
      (
        await fixture.request(`${route}/commands`, {
          commands: [
            {
              kind: 'updateTypedDependency',
              dependencyId: relationship.id,
              ...fixture.input,
              type: 'SS',
            },
          ],
        })
      ).status,
    ).toBe(200);
    const newer = readLatestEntry(b.projectId);
    expect(newer.id).not.toBe(older.id);
    expect((await fixture.request(`${route}/undo`)).status).toBe(200);
    expect(harness.sqlite.query('SELECT type FROM external_dependency').get()).toEqual({
      type: 'FS',
    });
    const expectedAfterReplay = readRemoteExpected(older.id);
    expect(
      harness.sqlite
        .query('SELECT * FROM command_journal WHERE project_id=? ORDER BY seq')
        .all(a.projectId),
    ).toEqual(remoteHistory);
    const before = readTables();
    const sent = [...pushes];
    const response = await fixture.request(`${route}/undo`);
    const body: unknown = await response.json();
    const remaining = harness.sqlite.query('SELECT id FROM external_dependency').all();
    if (!interveningEdit) {
      expect({ status: response.status, remaining }).toEqual({ status: 200, remaining: [] });
      expect(
        harness.sqlite.query('SELECT undone FROM command_journal WHERE id=?').get(older.id),
      ).toEqual({ undone: 1 });
      return;
    }
    expect({ status: response.status, body, remaining }).toEqual({
      status: 409,
      body: {
        error: 'stale_undo',
        detail: 'an external dependency endpoint changed since this command.',
      },
      remaining: [{ id: relationship.id }],
    });
    expect(expectedAfterReplay).toEqual(expectedRemote);
    expect(readTables()).toEqual(
      before.map((table) =>
        table.name !== 'command_journal'
          ? table
          : {
              ...table,
              rows: table.rows.filter((row) => (JSON.parse(row) as { id: string }).id !== older.id),
            },
      ),
    );
    expect(pushes).toEqual(sent);
  });

test('connected replay rebases only its acting person stack and discards only its stale selected row', async () => {
  const pushes: string[] = [];
  const fixture = await openFixture({
    syntheticExternalCommands: true,
    pushes,
    machineGrants: await forwardingMachineGrants(),
  });
  const accountId = fixture.principal.id;
  for (const person of ['history-agent', 'other-history-agent'])
    addAgentPerson(harness.sqlite, person, 'org-a', accountId);
  const first = await issueApiKey(harness.sqlite, {
    organizationId: 'org-a',
    personId: 'history-agent',
    issuedBy: accountId,
  });
  const second = await issueApiKey(harness.sqlite, {
    organizationId: 'org-a',
    personId: 'other-history-agent',
    issuedBy: accountId,
  });
  const issueGrant = async (key: string) => {
    const issued = await requestGrant(harness, { kind: 'api_key', key });
    expect(issued.status).toBe(200);
    const { grant } = (await issued.json()) as { grant: string };
    expect(typeof grant).toBe('string');
    return grant;
  };
  const firstGrant = await issueGrant(first.key);
  const secondGrant = await issueGrant(second.key);
  const serviceHeaders = {
    [MCP_INTERNAL_SECRET_HEADER]: TEST_MACHINE_GRANT_ENV['MCP_BE_INTERNAL_SECRET'],
    [DEPENDENCY_SEMANTICS_HEADER]: DEPENDENCY_SEMANTICS,
  };
  const route = `/api/projects/${fixture.owner.projectId}`;
  const command = (grant: string, commands: unknown[]) =>
    harness.callWith(grant, 'POST', `${route}/commands`, { commands }, serviceHeaders);
  expect(
    (await command(firstGrant, [{ kind: 'addTypedDependency', ...fixture.input }])).status,
  ).toBe(200);
  const older = readLatestEntry(fixture.owner.projectId);
  const relationship = harness.sqlite
    .query<{ id: string }, []>('SELECT id FROM external_dependency')
    .get();
  if (relationship === null) throw new Error('mixed history relationship missing');
  expect(
    (
      await command(secondGrant, [
        {
          kind: 'patchWorkItem',
          workItemId: fixture.owner.workItemId,
          patch: { notes: 'Other actor history' },
        },
      ])
    ).status,
  ).toBe(200);
  const readOther = () =>
    harness.sqlite
      .query('SELECT * FROM command_journal WHERE person_id=? ORDER BY seq')
      .all('other-history-agent');
  const other = readOther();
  expect(other).toHaveLength(1);
  expect(
    (
      await command(firstGrant, [
        {
          kind: 'updateTypedDependency',
          dependencyId: relationship.id,
          ...fixture.input,
          type: 'SS',
        },
      ])
    ).status,
  ).toBe(200);
  expect(
    (await harness.callWith(firstGrant, 'POST', `${route}/undo`, undefined, serviceHeaders)).status,
  ).toBe(200);
  expect(readOther()).toEqual(other);
  expect(
    (await harness.callWith(firstGrant, 'POST', `${route}/redo`, undefined, serviceHeaders)).status,
  ).toBe(200);
  expect(readOther()).toEqual(other);
  expect(
    (await harness.callWith(firstGrant, 'POST', `${route}/undo`, undefined, serviceHeaders)).status,
  ).toBe(200);
  expect(readOther()).toEqual(other);
  expect(
    (
      await fixture.request(`/api/projects/${fixture.predecessor.projectId}/commands`, {
        commands: [
          {
            kind: 'patchWorkItem',
            workItemId: fixture.predecessor.workItemId,
            patch: { notes: 'Remote conflict' },
          },
        ],
      })
    ).status,
  ).toBe(200);
  const before = readTables();
  const sent = [...pushes];
  const refused = await harness.callWith(
    firstGrant,
    'POST',
    `${route}/undo`,
    undefined,
    serviceHeaders,
  );
  expect(refused.status).toBe(409);
  expect(refused.body).toMatchObject({ error: 'stale_undo' });
  expect(readTables()).toEqual(
    before.map((table) =>
      table.name === 'command_journal'
        ? {
            ...table,
            rows: table.rows.filter((row) => (JSON.parse(row) as { id: string }).id !== older.id),
          }
        : table,
    ),
  );
  expect(readOther()).toEqual(other);
  expect(pushes).toEqual(sent);
});
