import { WorkItemService } from '@wbs/core/module/work-item/work-item.resource';
import { formatStepNodeId, type NodeResources } from '@wbs/domain';
import { CapacityRepository } from '@wbs/store-sqlite/capacity';
import { afterEach, describe, expect, it, spyOn } from 'bun:test';

import { OrganizationHarness } from '../testing/organization-harness';

let h: OrganizationHarness | undefined;
afterEach(() => h?.close());

for (const mode of ['isolated', 'shared'] as const) {
  describe(`live node resources (${mode})`, () => {
    it('reads held leaf resources before page filtering with captured inherited capacity and single-read parity', async () => {
      const harness = OrganizationHarness.openComposedWith({
        supportedCapacityModes: ['isolated', 'shared'],
      });
      h = harness;
      await harness.register('ada');
      harness.organization('org-a');
      harness.member('org-a', 'ada', 'member', ['project-contributor', 'org-viewer']);
      harness.grantPermissions('org-a', 'ada', ['organization.create_project']);
      harness.bind('ada', 'org-a');
      harness.activate();
      if (mode === 'shared')
        harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      const created = await harness.call('ada', 'POST', '/api/work-packages', {
        name: 'Resources',
      });
      expect(created.status).toBe(200);
      const { workPackage, steps } = created.body as {
        workPackage: { id: string };
        steps: { id: string }[];
      };
      const dev = steps.at(0)?.id;
      const qa = steps.at(1)?.id;
      if (dev === undefined || qa === undefined) throw new Error('seed steps missing');
      const batch = async (commands: unknown[]) => {
        const applied = await harness.call(
          'ada',
          'POST',
          `/api/work-packages/${workPackage.id}/commands`,
          {
            commands,
          },
        );
        expect(applied.status).toBe(200);
        return applied.body as { results: { id: string; ref: string }[] };
      };
      const made = await batch([
        { kind: 'createWorkItem', ref: 'parent', parentId: null, afterId: null, name: 'Parent' },
        { kind: 'createWorkItem', ref: 'leaf', parentRef: 'parent', afterId: null, name: 'Leaf' },
        { kind: 'createWorkItem', ref: 'other', parentId: null, afterRef: 'parent', name: 'Other' },
      ]);
      const parent = made.results.find((entry) => entry.ref === 'parent')?.id;
      const leaf = made.results.find((entry) => entry.ref === 'leaf')?.id;
      const other = made.results.find((entry) => entry.ref === 'other')?.id;
      if (parent === undefined || leaf === undefined || other === undefined)
        throw new Error('created rows missing');
      for (const teamId of ['wide', 'narrow', 'unsized']) {
        harness.sqlite.run('INSERT INTO service_team (id, name) VALUES (?, ?)', [teamId, teamId]);
        harness.sqlite.run(
          "INSERT INTO service_team_organization (resource_id, organization_id, name) VALUES (?, 'org-a', ?)",
          [teamId, teamId],
        );
        harness.sqlite.run('INSERT INTO work_item_team (work_item_id, team_id) VALUES (?, ?)', [
          parent,
          teamId,
        ]);
      }
      for (const [teamId, size] of [
        ['wide', 4],
        ['narrow', 2],
      ] as const)
        harness.sqlite.run(
          'INSERT INTO work_package_team_capacity (work_package_id, service_team_id, size) VALUES (?, ?, ?)',
          [workPackage.id, teamId, size],
        );
      await batch([{ kind: 'patchWorkItem', workItemId: leaf, patch: { maxParallel: 3 } }]);
      await batch(
        steps.map((step) => ({
          kind: 'setEstimate',
          workItemId: leaf,
          stepId: step.id,
          days: { optimistic: 2, realistic: 2, pessimistic: 2 },
        })),
      );
      const read = async () => {
        const answer = await harness.call(
          'ada',
          'GET',
          `/api/work-packages/${workPackage.id}/work-items`,
        );
        expect(answer.status).toBe(200);
        return answer.body as {
          workItems: {
            id: string;
            nodeResources?: Record<string, NodeResources>;
            schedule: unknown;
          }[];
          slices: { workItemId: string; stepId: string; width: number; personId: string | null }[];
        };
      };
      // eslint-disable-next-line @typescript-eslint/unbound-method -- the spy calls the original with its actual repository receiver.
      const readCapacity = CapacityRepository.prototype.slotsFor;
      let changedCapacity = false;
      const concurrent = spyOn(CapacityRepository.prototype, 'slotsFor').mockImplementation(
        async function (this: CapacityRepository, workPackageId) {
          const capacity = await readCapacity.call(this, workPackageId);
          if (workPackageId === workPackage.id && !changedCapacity) {
            changedCapacity = true;
            harness.sqlite.run(
              'UPDATE work_package_team_capacity SET size = 1 WHERE work_package_id = ? AND service_team_id = ?',
              [workPackage.id, 'narrow'],
            );
          }
          return capacity;
        },
      );
      let first: Awaited<ReturnType<typeof read>>;
      try {
        first = await read();
      } finally {
        concurrent.mockRestore();
      }
      expect(changedCapacity).toBe(true);
      expect(
        harness.sqlite
          .query(
            'SELECT size FROM work_package_team_capacity WHERE work_package_id = ? AND service_team_id = ?',
          )
          .get(workPackage.id, 'narrow'),
      ).toEqual({ size: 1 });
      harness.sqlite.run(
        'UPDATE work_package_team_capacity SET size = 2 WHERE work_package_id = ? AND service_team_id = ?',
        [workPackage.id, 'narrow'],
      );
      expect(first.workItems.find((row) => row.id === parent)).not.toHaveProperty('nodeResources');
      const resource = first.workItems.find((row) => row.id === leaf)?.nodeResources?.[dev];
      expect(resource).toEqual({
        nodeId: formatStepNodeId({ workItemId: leaf, stepId: dev }),
        assignment: { kind: 'unassigned' },
        teams: {
          kind: 'stated',
          fromWorkItemId: parent,
          entries: [
            { teamId: 'narrow', capacity: 2 },
            { teamId: 'unsized', capacity: null },
            { teamId: 'wide', capacity: 4 },
          ],
        },
        maxParallel: 3,
        width: 2,
      });
      expect(
        first.slices.find((slice) => slice.workItemId === leaf && slice.stepId === dev)?.width,
      ).toBe(resource?.width);
      harness.sqlite.run("INSERT INTO person (id, name) VALUES ('ada-person', 'Ada')");
      harness.sqlite.run(
        "INSERT INTO person_organization (resource_id, organization_id, name) VALUES ('ada-person', 'org-a', 'Ada')",
      );
      await batch([{ kind: 'setAssignee', workItemId: leaf, stepId: dev, personId: 'ada-person' }]);
      const named = await read();
      expect(
        named.workItems.find((row) => row.id === leaf)?.nodeResources?.[dev].assignment,
      ).toEqual({ kind: 'explicit', personId: 'ada-person' });
      expect(named.workItems.find((row) => row.id === leaf)?.nodeResources?.[qa]).toMatchObject({
        assignment: { kind: 'assumed', personId: 'ada-person', fromStepId: dev },
        width: 1,
      });
      expect(
        named.slices
          .filter((slice) => slice.workItemId === leaf)
          .map((slice) => [slice.personId, slice.width]),
      ).toEqual(steps.map(() => ['ada-person', 1]));
      await batch([{ kind: 'setStatus', workItemId: leaf, status: 'on_hold' }]);
      const held = await read();
      const heldLeaf = held.workItems.find((row) => row.id === leaf);
      expect(heldLeaf?.schedule).toBeNull();
      expect(heldLeaf?.nodeResources).toEqual(
        named.workItems.find((row) => row.id === leaf)?.nodeResources,
      );
      expect(held.slices.some((slice) => slice.workItemId === leaf)).toBe(false);
      const single = await harness.call(
        'ada',
        'GET',
        `/api/work-packages/${workPackage.id}/work-items/${leaf}`,
      );
      expect(single.status).toBe(200);
      expect(
        (single.body as { workItem: { nodeResources: unknown } }).workItem.nodeResources,
      ).toEqual(heldLeaf?.nodeResources);
      const page = await harness.call(
        'ada',
        'GET',
        `/api/work-packages/${workPackage.id}/work-item-rows?fields=constraints&parentId=${parent}`,
      );
      expect(page.status).toBe(200);
      expect(
        (page.body as { rows: { nodeResources: unknown }[] }).rows.map((row) => row.nodeResources),
      ).toEqual([heldLeaf?.nodeResources]);
      const outline = await harness.call(
        'ada',
        'GET',
        `/api/work-packages/${workPackage.id}/work-item-rows?parentId=${parent}`,
      );
      expect(outline.status).toBe(200);
      expect((outline.body as { rows: unknown[] }).rows[0]).not.toHaveProperty('nodeResources');
      // eslint-disable-next-line @typescript-eslint/unbound-method -- the producer spy calls the original with its actual service receiver.
      const readTree = WorkItemService.prototype.treeWithin;
      for (const fault of ['absent', 'malformed'] as const) {
        const producer = spyOn(WorkItemService.prototype, 'treeWithin').mockImplementation(
          async function (this: WorkItemService, workPackageId, access) {
            const tree = await readTree.call(this, workPackageId, access);
            if (tree === null || 'kind' in tree) return tree;
            return {
              ...tree,
              workItems: tree.workItems.map((row) => {
                const { nodeResources, ...older } = row;
                return fault === 'absent'
                  ? older
                  : {
                      ...row,
                      nodeResources: { [dev]: { ...nodeResources?.[dev], width: 'wide' } },
                    };
              }),
            } as unknown as typeof tree;
          },
        );
        try {
          const boundary = await harness.call(
            'ada',
            'GET',
            `/api/work-packages/${workPackage.id}/work-items`,
          );
          expect(boundary.status).toBe(fault === 'absent' ? 200 : 500);
          if (fault === 'absent')
            for (const row of (boundary.body as { workItems: unknown[] }).workItems)
              expect(row).not.toHaveProperty('nodeResources');
        } finally {
          producer.mockRestore();
        }
      }
      await batch([{ kind: 'moveWorkItem', workItemId: leaf, parentId: other, afterId: null }]);
      expect(
        (
          await harness.call('ada', 'PATCH', `/api/work-packages/${workPackage.id}/steps/${dev}`, {
            name: 'Renamed',
          })
        ).status,
      ).toBe(200);
      const moved = (await read()).workItems.find((row) => row.id === leaf)?.nodeResources?.[dev];
      expect(moved).toMatchObject({
        nodeId: resource?.nodeId,
        teams: { kind: 'unstated' },
        assignment: { kind: 'explicit', personId: 'ada-person' },
      });
      const exported = await harness.call(
        'ada',
        'GET',
        `/api/work-packages/${workPackage.id}/export?format=json`,
      );
      expect(exported.status).toBe(200);
      for (const row of (exported.body as { workItems: unknown[] }).workItems)
        expect(row).not.toHaveProperty('nodeResources');
      const document = structuredClone(exported.body) as { workItems: Record<string, unknown>[] };
      for (const row of document.workItems)
        row['nodeResources'] = { ignored: 'malformed derived input' };
      const imported = await harness.call('ada', 'POST', '/api/work-packages/import', document);
      expect(imported.status).toBe(201);
      const importedWorkPackage = (imported.body as { workPackageId: string }).workPackageId;
      const importedTree = await harness.call(
        'ada',
        'GET',
        `/api/work-packages/${importedWorkPackage}/work-items`,
      );
      expect(importedTree.status).toBe(200);
      for (const row of (
        importedTree.body as { workItems: { nodeResources?: Record<string, NodeResources> }[] }
      ).workItems) {
        if (row.nodeResources !== undefined)
          expect(row.nodeResources).not.toHaveProperty('ignored');
      }
    });

    it('emits empty resources for a stepless leaf and no resources on parents', async () => {
      const harness = OrganizationHarness.openComposedWith({
        supportedCapacityModes: ['isolated', 'shared'],
      });
      h = harness;
      await harness.register('ada');
      harness.organization('org-a');
      harness.member('org-a', 'ada', 'member', ['project-contributor', 'org-viewer']);
      harness.grantPermissions('org-a', 'ada', ['organization.create_project']);
      harness.bind('ada', 'org-a');
      harness.activate();
      if (mode === 'shared')
        harness.sqlite.run("UPDATE organization SET shared_people = 1 WHERE id = 'org-a'");
      const created = await harness.call('ada', 'POST', '/api/work-packages', { name: 'Stepless' });
      const workPackageId = (created.body as { workPackage: { id: string } }).workPackage.id;
      const applied = await harness.call(
        'ada',
        'POST',
        `/api/work-packages/${workPackageId}/commands`,
        {
          commands: [{ kind: 'createWorkItem', parentId: null, afterId: null, name: 'Leaf' }],
        },
      );
      expect(applied.status).toBe(200);
      harness.sqlite.run('DELETE FROM step WHERE work_package_id = ?', [workPackageId]);
      const tree = await harness.call(
        'ada',
        'GET',
        `/api/work-packages/${workPackageId}/work-items`,
      );
      expect(tree.status).toBe(200);
      expect(
        (tree.body as { workItems: { nodeResources: unknown }[] }).workItems.map(
          (row) => row.nodeResources,
        ),
      ).toEqual([{}]);
    });
  });
}
