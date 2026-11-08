import { readPreconditions } from '@wbs/core/service/compensating';
import { afterEach, expect, test } from 'bun:test';

import {
  closeFixture,
  harness,
  readTables,
  seedIncidents,
} from './cross-project-dependency-fixture';

afterEach(closeFixture);

// Proof: disabling only WorkItemService's external revision comparison made all
// four mounted cases return 200 instead of 409 after real remote edits (2026-10-23).
for (const direction of ['undo', 'redo'] as const)
  for (const endpoint of ['predecessor', 'successor'] as const)
    test(`mounted first-child ${direction} refuses a changed remote ${endpoint} revision`, async () => {
      const pushes: string[] = [];
      const fixture = await seedIncidents({ pushes });
      const owner = fixture.owner.projectId;
      const route = `/api/projects/${owner}`;
      expect(
        (
          await fixture.request(`${route}/commands`, {
            commands: [
              {
                kind: 'createWorkItem',
                parentId: fixture.owner.workItemId,
                name: 'Remote guarded child',
              },
              {
                kind: 'patchWorkItem',
                workItemId: fixture.localPeer,
                patch: { notes: 'Compound local patch' },
              },
            ],
          })
        ).status,
      ).toBe(200);
      if (direction === 'redo') expect((await fixture.request(`${route}/undo`)).status).toBe(200);
      const selected = harness.sqlite
        .query<{ id: string; preconditions: string }, [string]>(
          'SELECT id,preconditions FROM command_journal WHERE project_id=? ORDER BY seq DESC LIMIT 1',
        )
        .get(owner);
      if (selected === null) throw new Error('mounted structural journal missing');
      const remote = fixture[endpoint];
      const expected = readPreconditions(JSON.parse(selected.preconditions) as unknown)
        .externalRevisions?.expected;
      if (expected === undefined) throw new Error('mounted remote revision evidence missing');
      const guarded = expected.find(
        (revision) =>
          revision.projectId === remote.projectId && revision.workItemId === remote.workItemId,
      );
      if (guarded === undefined) throw new Error('selected remote endpoint is not guarded');
      expect(
        (
          await fixture.request(`/api/projects/${remote.projectId}/commands`, {
            commands: [
              {
                kind: 'patchWorkItem',
                workItemId: remote.workItemId,
                patch: { notes: 'Intervening remote endpoint edit' },
              },
            ],
          })
        ).status,
      ).toBe(200);
      expect(
        harness.sqlite.query('SELECT revision FROM work_item WHERE id=?').get(remote.workItemId),
      ).toEqual({ revision: guarded.revision + 1 });
      const before = readTables();
      const publications = [...pushes];
      const response = await fixture.request(`${route}/${direction}`);
      const body: unknown = await response.json();
      expect({ status: response.status, body }).toEqual({
        status: 409,
        body: {
          error: 'stale_undo',
          detail: 'an external dependency endpoint changed since this command.',
        },
      });
      expect(readTables()).toEqual(
        before.map((table) =>
          table.name !== 'command_journal'
            ? table
            : {
                ...table,
                rows: table.rows.filter(
                  (row) => (JSON.parse(row) as { id: string }).id !== selected.id,
                ),
              },
        ),
      );
      expect(pushes).toEqual(publications);
    });
