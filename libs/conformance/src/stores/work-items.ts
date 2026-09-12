import type { LabelledWorkItem, WorkItem } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import type { SourceReaders } from '../source-declaration';
import { type OpenCase, storeCase } from './store-case';

interface Place {
  readonly id: string;
  readonly projectId: string;
  readonly parentId: string | null;
  readonly position: number;
}

function placed(rows: readonly LabelledWorkItem[]): Place[] {
  return rows
    .map(({ id, projectId, parentId, position }) => ({ id, projectId, parentId, position }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function rowFrom(row: LabelledWorkItem, overrides: Partial<WorkItem>): WorkItem {
  return {
    id: row.id,
    projectId: row.projectId,
    parentId: row.parentId,
    position: row.position,
    name: row.name,
    notes: row.notes,
    frozenNumber: row.frozenNumber,
    startNoEarlierThan: row.startNoEarlierThan,
    startNoEarlierThanReason: row.startNoEarlierThanReason,
    deadline: row.deadline,
    priority: row.priority,
    serviceTeamId: row.serviceTeamId,
    serviceId: row.serviceId,
    maxParallel: row.maxParallel,
    revision: row.revision,
    ...overrides,
  };
}

async function seededRows(readers: SourceReaders, projectId: string): Promise<LabelledWorkItem[]> {
  const rows = await readers.workItems.listByProject(projectId);
  return rows.sort((left, right) => left.id.localeCompare(right.id));
}

/** The shared work-row cases for transactional placement, refusal, promotion, and freezing. */
export function workItemRegistrations(open: OpenCase<'workItems'>): readonly CaseRegistration[] {
  return [
    storeCase('workItems', 'workItems.insert:respace', open, async ({ port, readers, seed }) => {
      const [projectA, projectB] = seed.projectIds;
      const [firstId, secondId] = seed.workItemIds[0];
      const beforeA = await seededRows(readers, projectA);
      const beforeB = await seededRows(readers, projectB);
      expect(beforeA.map(({ id }) => id)).toEqual([firstId, secondId]);
      expect(beforeB.map(({ id }) => id)).toEqual([...seed.workItemIds[1]]);

      await port.setPositions(
        [
          { id: firstId, position: 10 },
          { id: secondId, position: 11 },
        ],
        [],
        seed.stamps[0],
      );
      await port.insert(
        rowFrom(beforeA[0], {
          id: 'work-a-inserted',
          position: 20,
          name: 'Inserted between tight siblings',
          revision: 0,
        }),
        [
          { id: firstId, position: 10 },
          { id: secondId, position: 30 },
        ],
        seed.stamps[0],
      );

      // Proof: both source faults omitted the real insert call's `respaced`
      // argument; this failed with work-a-two still at position 11 rather than 30.
      expect(
        (await readers.workItems.listByProject(projectA))
          .map(({ id, position }) => ({ id, position }))
          .sort((left, right) => left.position - right.position),
      ).toEqual([
        { id: firstId, position: 10 },
        { id: 'work-a-inserted', position: 20 },
        { id: secondId, position: 30 },
      ]);
      expect(await seededRows(readers, projectB)).toEqual(beforeB);
    }),
    storeCase(
      'workItems',
      'workItems.patch:refusal-atomic',
      open,
      async ({ port, readers, seed }) => {
        const [projectA, projectB] = seed.projectIds;
        const [targetId] = seed.workItemIds[0];
        expect(
          await port.patch(targetId, { teamIds: [seed.teamIds[0]] }, seed.stamps[0]),
        ).toMatchObject({ ok: true });
        const beforeA = structuredClone(await seededRows(readers, projectA));
        const beforeB = structuredClone(await seededRows(readers, projectB));
        expect(beforeA.find(({ id }) => id === targetId)?.teamIds).toEqual([seed.teamIds[0]]);
        expect(beforeB.map(({ id }) => id)).toEqual([...seed.workItemIds[1]]);

        const refused = await port.patch(
          targetId,
          { name: 'Escaped rename', teamIds: [seed.teamIds[0], 'team-missing'] },
          seed.stamps[1],
        );
        expect(refused).toEqual({ ok: false, reason: 'unknown_team' });
        const afterA = await seededRows(readers, projectA);

        // Proof: both late partial-write faults performed the scalar rename before
        // the real unknown-team refusal; this failed on name `Escaped rename`.
        expect(afterA).toEqual(beforeA);
        expect(await seededRows(readers, projectB)).toEqual(beforeB);
      },
    ),
    storeCase(
      'workItems',
      'workItems.move:parent-position',
      open,
      async ({ port, readers, seed }) => {
        const [projectA, projectB] = seed.projectIds;
        const [parentId, movingId] = seed.workItemIds[0];
        const beforeA = await seededRows(readers, projectA);
        const beforeB = structuredClone(await seededRows(readers, projectB));
        expect(beforeA.map(({ id }) => id)).toEqual([parentId, movingId]);
        expect(beforeB.map(({ id }) => id)).toEqual([...seed.workItemIds[1]]);

        await port.insert(
          rowFrom(beforeA[0], {
            id: 'work-a-child',
            parentId,
            position: 11,
            name: 'Existing child',
            revision: 0,
          }),
          [],
          seed.stamps[0],
        );
        await port.move(
          movingId,
          parentId,
          20,
          [{ id: 'work-a-child', position: 30 }],
          seed.stamps[1],
        );

        expect(placed(await readers.workItems.listByProject(projectA))).toEqual([
          { id: 'work-a-child', projectId: projectA, parentId, position: 30 },
          { id: parentId, projectId: projectA, parentId: null, position: 10 },
          { id: movingId, projectId: projectA, parentId, position: 20 },
        ]);
        expect(await seededRows(readers, projectB)).toEqual(beforeB);
      },
    ),
    storeCase('workItems', 'workItems.remove:promotion', open, async ({ port, readers, seed }) => {
      const [projectA, projectB] = seed.projectIds;
      const [parentId, siblingId] = seed.workItemIds[0];
      const beforeA = await seededRows(readers, projectA);
      const beforeB = structuredClone(await seededRows(readers, projectB));
      expect(beforeA.map(({ id }) => id)).toEqual([parentId, siblingId]);
      expect(beforeB.map(({ id }) => id)).toEqual([...seed.workItemIds[1]]);

      const children = [
        rowFrom(beforeA[0], {
          id: 'work-a-child-one',
          parentId,
          position: 10,
          name: 'First surviving child',
          revision: 0,
        }),
        rowFrom(beforeA[0], {
          id: 'work-a-child-two',
          parentId,
          position: 20,
          name: 'Second surviving child',
          revision: 0,
        }),
      ];
      for (const child of children) await port.insert(child, [], seed.stamps[0]);
      let didRefuse = false;
      try {
        await port.remove(
          [parentId],
          [
            { id: children[0].id, parentId: null, position: 10 },
            { id: children[1].id, parentId: null, position: 20 },
            { id: siblingId, parentId: null, position: 30 },
          ],
          seed.stamps[1],
        );
      } catch {
        didRefuse = true;
      }

      // Proof: both source faults omitted the second promoted child. Memory left
      // its parent link dangling; SQLite refused and rolled the write back. The
      // settled refusal plus complete survivor/parent snapshot failed in both.
      expect({ didRefuse, rows: placed(await readers.workItems.listByProject(projectA)) }).toEqual({
        didRefuse: false,
        rows: [
          { id: 'work-a-child-one', projectId: projectA, parentId: null, position: 10 },
          { id: 'work-a-child-two', projectId: projectA, parentId: null, position: 20 },
          { id: siblingId, projectId: projectA, parentId: null, position: 30 },
        ],
      });
      expect(await seededRows(readers, projectB)).toEqual(beforeB);
    }),
    storeCase(
      'workItems',
      'workItems.setFrozenNumbers:clear',
      open,
      async ({ port, readers, seed }) => {
        const [projectA, projectB] = seed.projectIds;
        const [firstId, secondId] = seed.workItemIds[0];
        const beforeB = structuredClone(await seededRows(readers, projectB));
        expect((await seededRows(readers, projectA)).map(({ id }) => id)).toEqual([
          firstId,
          secondId,
        ]);
        expect(beforeB.map(({ id }) => id)).toEqual([...seed.workItemIds[1]]);

        await port.setFrozenNumbers(
          [
            { id: firstId, frozenNumber: '010' },
            { id: secondId, frozenNumber: '020' },
          ],
          seed.stamps[0],
        );
        await port.setFrozenNumbers([{ id: firstId, frozenNumber: null }], seed.stamps[1]);

        // Proof: both source faults broadened the clear to every frozen row; this
        // failed with work-a-two null rather than its retained `020`.
        expect(
          (await seededRows(readers, projectA)).map(({ id, frozenNumber }) => ({
            id,
            frozenNumber,
          })),
        ).toEqual([
          { id: firstId, frozenNumber: null },
          { id: secondId, frozenNumber: '020' },
        ]);
        expect(await seededRows(readers, projectB)).toEqual(beforeB);
      },
    ),
  ];
}
