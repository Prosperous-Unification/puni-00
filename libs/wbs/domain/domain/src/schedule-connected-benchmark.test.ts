import { expect, test } from 'bun:test';

import { buildConnectedBenchmark } from './connected-benchmark-fixture';
import { resolveConnectedGraph } from './connected-step-node';
import { resolveScheduleInput } from './resolved-schedule-input';
import { indexTree, scheduleResolved, type Slice } from './schedule';
import { groupSlicesByLeaf } from './slice-groups';

for (const shape of ['sparse', 'dense'] as const) {
  test(`${shape} connected fixture retains its graph density and complete scheduled projections`, () => {
    const fixture = buildConnectedBenchmark(shape);
    expect(fixture.projects).toHaveLength(shape === 'sparse' ? 202 : 26);
    expect(fixture.relationships).toHaveLength(shape === 'sparse' ? 101 : 300);
    expect(
      new Set(fixture.projects.flatMap(({ personId }) => (personId === null ? [] : [personId])))
        .size,
    ).toBe(shape === 'sparse' ? 100 : 1);
    const members = fixture.projects.map((member) => {
      const rows = [
        { id: member.workItemId, parentId: null, position: 0, priority: null, frozenNumber: null },
      ];
      const slices: Slice[] = [
        {
          workItemId: member.workItemId,
          stepId: member.stepId,
          personId: member.personId,
          days: 1,
          width: 1,
          poolIds: [],
        },
      ];
      const input = resolveScheduleInput({
        rows,
        slices,
        edges: [],
        notBefore: new Map(),
        deadlines: new Map(),
        poolSizes: new Map(),
        reach: 'whole-item',
        typed: [],
      });
      const tree = indexTree(rows);
      return {
        member,
        input,
        projectId: member.projectId,
        tree,
        slicesByLeaf: groupSlicesByLeaf(tree.leafIds, slices),
        graph: input.graph,
        relationships: [],
      };
    });
    const authored = resolveConnectedGraph({ projects: members, external: fixture.relationships });
    expect(authored.graph.edges).toHaveLength(fixture.relationships.length);
    const combined = resolveScheduleInput({
      rows: members.flatMap(({ input }) => input.rows),
      slices: members.flatMap(({ input }) => input.slices),
      edges: [],
      notBefore: new Map(),
      deadlines: new Map(),
      poolSizes: new Map(),
      reach: 'whole-item',
      typed: [],
    });
    const started = performance.now();
    const scheduled = scheduleResolved({
      ...combined,
      graph: authored.graph,
      order: {
        kind: 'connected',
        projectIdByWorkItem: authored.projectIdByWorkItem,
        rankByProject: new Map(fixture.projects.map(({ projectId }, rank) => [projectId, rank])),
      },
    });
    const deriveMs = performance.now() - started;
    expect(scheduled.slices.size).toBe(fixture.projects.length);
    for (const relationship of fixture.relationships) {
      const predecessor = scheduled.workItems.get(relationship.predecessor.workItemId);
      const successor = scheduled.workItems.get(relationship.successor.workItemId);
      if (predecessor === undefined || successor === undefined)
        throw new Error('fixture endpoint omitted');
      expect(successor.earliestStart).toBeGreaterThanOrEqual(predecessor.earliestFinish);
    }
    for (const personId of new Set(
      fixture.projects.flatMap(({ personId }) => (personId === null ? [] : [personId])),
    )) {
      const spans = [...scheduled.slices.values()]
        .filter((slice) => slice.personId === personId)
        .sort((left, right) => left.earliestStart - right.earliestStart);
      expect(spans).toHaveLength(2);
      const [first, second] = spans;
      expect(second.earliestStart).toBeGreaterThanOrEqual(first.earliestFinish);
    }
    console.log(
      JSON.stringify({
        metric: 'connected-domain-schedule',
        shape,
        projects: fixture.projects.length,
        relationships: authored.graph.edges.length,
        deriveMs,
      }),
    );
  });
}
