import { scheduleResolved, sliceKey } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';

import type { LivePlanRead } from '../ports/shared-people-values';
import { connectedCapture, connectedReads } from '../testing/connected-plan-fixture';
import { deriveConnectedPlan } from './connected-plan';
import type { ConnectedPlanCapture } from './connected-plan-values';
import { deriveConnectedReadiness } from './connected-readiness';
import { projectConnectedTree } from './connected-tree';

type ConnectedRead = Extract<LivePlanRead, { kind: 'connected' }>;
const live = (capture: ConnectedPlanCapture = connectedCapture()): ConnectedRead => {
  const projection = deriveConnectedPlan(capture, { supports: () => false }, scheduleResolved);
  return {
    kind: 'connected',
    projection,
    readiness: deriveConnectedReadiness(
      capture,
      projection.authored,
      new Map(capture.projects.map((member) => [member.projectId, []])),
    ),
    metadataByProject: new Map(
      capture.projects.map((member) => [
        member.projectId,
        {
          project: {
            ...member.reads.project,
            abbreviation: member.abbreviation,
            revision: 7,
            createdAt: 0,
          },
          steps: member.reads.steps.map((step) => ({ ...step, projectId: member.projectId })),
          workItems: member.reads.workItems.map((row) => ({
            ...row,
            externalRefs: row.externalRefs.map((reference) => ({
              ...reference,
              name: reference.id,
            })),
            factStart: null,
            factEnd: null,
            createdAt: 0,
          })),
          attempts: [],
          blockages: [],
          seq: 11,
        },
      ]),
    ),
  };
};

describe('detached connected tree projection', () => {
  it('keeps the genuine interleaved A design B build A test slice order', () => {
    const a = connectedReads('A');
    const capture = connectedCapture({
      ...a,
      steps: [
        { ...a.steps[0], id: 'design', code: 'design', position: 0 },
        { ...a.steps[0], id: 'test', code: 'test', position: 1 },
      ],
      estimates: [
        { ...a.estimates[0], stepId: 'design' },
        { ...a.estimates[0], stepId: 'test' },
      ],
    });
    const captured = live({
      ...capture,
      relationships: [
        {
          id: 'design-build',
          projectId: 'B',
          type: 'FS',
          predecessor: { projectId: 'A', scope: 'node', workItemId: 'a', stepId: 'design' },
          successor: { projectId: 'B', scope: 'node', workItemId: 'b', stepId: 'build' },
        },
        {
          id: 'build-test',
          projectId: 'A',
          type: 'FS',
          predecessor: { projectId: 'B', scope: 'node', workItemId: 'b', stepId: 'build' },
          successor: { projectId: 'A', scope: 'node', workItemId: 'a', stepId: 'test' },
        },
      ],
    });
    const target = projectConnectedTree(captured, 'A');
    if (target.placement.kind !== 'scheduled') throw new Error('fixture must schedule');
    expect(
      [...target.placement.schedule.slices.values()].map((slice) => [
        slice.workItemId,
        slice.stepId,
        slice.earliestStart,
        slice.earliestFinish,
      ]),
    ).toEqual([
      ['a', 'design', 0, 1],
      ['a', 'test', 2, 3],
    ]);
    expect(
      target.readiness.eligibilityByNode.get(sliceKey('a', 'test'))?.startBlockers,
    ).toHaveLength(2);
  });
  it('selects target rows and verbatim fractional placement under its own anchor', () => {
    const a = connectedReads('A', '2026-10-05');
    const b = connectedReads('B', '2026-10-07');
    const captured = live(
      connectedCapture(
        { ...a, estimates: a.estimates.map((estimate) => ({ ...estimate, realistic: 3.25 })) },
        b,
      ),
    );
    const projected = projectConnectedTree(captured, 'B');
    expect(projected.metadata.workItems.map((row) => row.id)).toEqual(['b']);
    expect(projected.metadata.project).toMatchObject({ startDate: '2026-10-07', revision: 7 });
    expect(projected.metadata.seq).toBe(11);
    expect(projected.reads).toBe(b);
    expect(projected.placement.kind).toBe('scheduled');
    if (projected.placement.kind !== 'scheduled') throw new Error('fixture must schedule');
    expect(projected.placement.schedule.workItems.get('b')).toMatchObject({
      earliestStart: 1.25,
      earliestFinish: 2.25,
    });
    expect([...projected.placement.schedule.workItems.keys()]).toEqual(['b']);
    const componentPlacement = captured.projection.placement;
    if (componentPlacement.kind !== 'scheduled') throw new Error('fixture must schedule');
    expect(projected.placement.schedule).toBe(componentPlacement.byProject.get('B')!);
    expect([...projected.readiness.statuses.keys()]).toEqual(['b']);
    expect([...projected.readiness.nodes.readings.keys()]).toEqual(['b']);
    expect(projected.readiness.eligibilityByNode.get(sliceKey('b', 'build'))).toMatchObject({
      canStart: false,
    });
    expect(projected.readiness.predecessorIdsByLeaf.get('b')).toEqual(['a']);
  });

  it('keeps remote holds and exact remote blockage causes while held rows have no placement', () => {
    const a = connectedReads('A');
    const captured = live(
      connectedCapture(
        { ...a, workItems: a.workItems.map((row) => ({ ...row, hold: 'on_hold' })) },
        connectedReads('B'),
      ),
    );
    const target = projectConnectedTree(captured, 'B');
    expect(target.readiness.statuses.get('b')).toBe('blocked_by_proxy');
    expect(target.readiness.nodes.readings.get('b')).toEqual({ build: 'blocked_by_proxy' });
    expect(target.readiness.nodes.causes.get('b')).toEqual(
      captured.readiness.nodes.causes.get('b'),
    );
    expect(target.readiness.nodes.causes.get('b')?.['build']).toHaveLength(1);
    const held = projectConnectedTree(captured, 'A');
    if (held.placement.kind !== 'scheduled') throw new Error('fixture must schedule');
    expect(held.placement.schedule.workItems.has('a')).toBe(false);
  });

  it('projects incoming and outgoing incident labels using each endpoint own numbering and step', () => {
    const a = connectedReads('A');
    const b = connectedReads('B');
    const c = connectedReads('C');
    const capture = connectedCapture(a, {
      ...b,
      steps: b.steps.map((step) => ({ ...step, id: 'remote', code: 'dev', name: 'Remote dev' })),
      estimates: b.estimates.map((estimate) => ({ ...estimate, stepId: 'remote' })),
      workItems: b.workItems.map((row) => ({ ...row, frozenNumber: '080.39', name: 'Remote' })),
    });
    const captured = live({
      ...capture,
      projects: [...capture.projects, { projectId: 'C', abbreviation: 'C', rank: 2, reads: c }],
      relationships: [
        {
          ...capture.relationships[0],
          successor: { projectId: 'B', scope: 'node', workItemId: 'b', stepId: 'remote' },
        },
        {
          id: 'bc',
          projectId: 'C',
          type: 'FF',
          predecessor: { projectId: 'B', scope: 'whole', workItemId: 'b' },
          successor: { projectId: 'C', scope: 'whole', workItemId: 'c' },
        },
      ],
    });
    const target = projectConnectedTree(captured, 'A');
    expect(target.dependencies.map((relationship) => relationship.id)).toEqual(['ab']);
    expect(target.dependencies[0]?.successor).toMatchObject({
      endpoint: { projectId: 'B', workItemId: 'b', stepId: 'remote', scope: 'node' },
      workItemNumber: '080.39',
      name: 'Remote',
      stepReference: '080.39.s1-dev',
      qualifiedReference: 'B.080.39.s1-dev',
      step: { id: 'remote', name: 'Remote dev' },
    });
    expect(
      projectConnectedTree(captured, 'B').dependencies.map((relationship) => relationship.id),
    ).toEqual(['ab', 'bc']);
  });

  it('retains authored links and readiness on missing calendar and engine unavailable', () => {
    const missing = projectConnectedTree(live(connectedCapture(connectedReads('A', null))), 'B');
    expect(missing.placement).toMatchObject({
      kind: 'dependency_calendar_missing',
      projects: [{ projectId: 'A', abbreviation: 'A' }],
    });
    expect(missing.metadata.workItems).toHaveLength(1);
    expect(missing.dependencies[0]?.predecessor.qualifiedReference).toBe('A.010');
    expect(missing.readiness.eligibilityByNode.get(sliceKey('b', 'build'))?.canStart).toBe(false);
    const a = connectedReads('A');
    const refused = projectConnectedTree(
      live(
        connectedCapture({
          ...a,
          project: { ...a.project, scheduleEngine: 'optimized', optimizationEnabled: true },
        }),
      ),
      'B',
    );
    expect(refused.placement).toMatchObject({ kind: 'engine_unavailable', projects: ['A'] });
    expect(refused.dependencies).toHaveLength(1);
    expect(refused.readiness.nodes.readings.get('b')).toEqual({ build: 'unknown' });
  });

  it('refuses missing captured member, metadata, readiness and selected placement evidence', () => {
    const captured = live();
    expect(() => projectConnectedTree(captured, 'foreign')).toThrow('not captured');
    const metadata = new Map(captured.metadataByProject);
    metadata.delete('A');
    expect(() => projectConnectedTree({ ...captured, metadataByProject: metadata }, 'B')).toThrow(
      'missing connected tree metadata A',
    );
    for (const [name, readiness] of [
      ['status', { ...captured.readiness, statuses: new Map() }],
      [
        'reading',
        { ...captured.readiness, nodes: { ...captured.readiness.nodes, readings: new Map() } },
      ],
      [
        'cause',
        { ...captured.readiness, nodes: { ...captured.readiness.nodes, causes: new Map() } },
      ],
      ['eligibility', { ...captured.readiness, eligibilityByNode: new Map() }],
    ] as const) {
      expect(() => projectConnectedTree({ ...captured, readiness }, 'B')).toThrow(name);
    }
    const componentPlacement = captured.projection.placement;
    if (componentPlacement.kind !== 'scheduled') throw new Error('fixture must schedule');
    expect(() =>
      projectConnectedTree(
        {
          ...captured,
          projection: {
            ...captured.projection,
            placement: { ...componentPlacement, byProject: new Map() },
          },
        },
        'B',
      ),
    ).toThrow('missing project schedule B');
  });

  it.each(['row', 'step', 'project-owner', 'row-owner', 'step-owner'] as const)(
    'refuses corrupted %s metadata identities before presenting endpoint labels',
    (fault) => {
      const captured = live();
      const remote = captured.metadataByProject.get('A')!;
      const metadata = {
        ...remote,
        project: fault === 'project-owner' ? { ...remote.project, id: 'B' } : remote.project,
        workItems:
          fault === 'row'
            ? []
            : remote.workItems.map((row) =>
                fault === 'row-owner' ? { ...row, projectId: 'B' } : row,
              ),
        steps:
          fault === 'step'
            ? []
            : remote.steps.map((step) =>
                fault === 'step-owner' ? { ...step, projectId: 'B' } : step,
              ),
      };
      expect(() =>
        projectConnectedTree(
          {
            ...captured,
            metadataByProject: new Map([...captured.metadataByProject, ['A', metadata]]),
          },
          'B',
        ),
      ).toThrow('metadata identities A');
    },
  );

  it('refuses missing per-step readings and causes instead of presenting an incomplete leaf', () => {
    const captured = live();
    for (const [name, nodes] of [
      ['reading', { ...captured.readiness.nodes, readings: new Map([['b', {}]]) }],
      ['cause', { ...captured.readiness.nodes, causes: new Map([['b', {}]]) }],
    ] as const) {
      expect(() =>
        projectConnectedTree(
          {
            ...captured,
            readiness: {
              ...captured.readiness,
              nodes,
            },
          },
          'B',
        ),
      ).toThrow(name);
    }
  });

  it('refuses absent row status instead of publishing an undefined reading', () => {
    const captured = live();
    expect(() =>
      projectConnectedTree(
        {
          ...captured,
          readiness: {
            ...captured.readiness,
            statuses: new Map(),
          },
        },
        'B',
      ),
    ).toThrow('status b');
  });

  it('propagates unreadable metadata rather than returning an unavailable or local substitute', () => {
    const captured = live();
    const fault = new Error('captured metadata unreadable');
    class UnreadableMetadata extends Map<string, never> {
      override get(): never {
        throw fault;
      }
    }
    expect(() =>
      projectConnectedTree({ ...captured, metadataByProject: new UnreadableMetadata() }, 'B'),
    ).toThrow(fault);
  });

  it('keeps uncoded step navigation stable through captured rename and renumber', () => {
    const a = connectedReads('A');
    const capture = connectedCapture(a);
    const relationship = {
      ...capture.relationships[0],
      predecessor: { projectId: 'A', scope: 'node' as const, workItemId: 'a', stepId: 'build' },
    };
    const before = projectConnectedTree(live({ ...capture, relationships: [relationship] }), 'B');
    const renamed = live({
      ...capture,
      projects: capture.projects.map((member) =>
        member.projectId === 'A'
          ? {
              ...member,
              abbreviation: 'RENAMED',
              reads: {
                ...a,
                workItems: a.workItems.map((row) => ({
                  ...row,
                  frozenNumber: '090',
                  name: 'Renamed',
                })),
              },
            }
          : member,
      ),
      relationships: [relationship],
    });
    const after = projectConnectedTree(renamed, 'B');
    expect(before.dependencies[0]?.predecessor.qualifiedReference).toBeNull();
    expect(after.dependencies[0]?.predecessor).toMatchObject({
      endpoint: { projectId: 'A', scope: 'node', workItemId: 'a', stepId: 'build' },
      projectAbbreviation: 'RENAMED',
      workItemNumber: '090',
      name: 'Renamed',
      qualifiedReference: null,
      stepReference: null,
    });
    expect(after.dependencies[0]?.predecessor.stepNodeId).toBe(
      before.dependencies[0]?.predecessor.stepNodeId,
    );
  });

  it.each(['abbreviation', 'row name', 'step name', 'step code'] as const)(
    'refuses absent endpoint %s evidence',
    (fault) => {
      const capture = connectedCapture();
      const captured = live({
        ...capture,
        relationships: capture.relationships.map((relationship) => ({
          ...relationship,
          predecessor: { projectId: 'A', scope: 'node', workItemId: 'a', stepId: 'build' },
        })),
      });
      const metadata = structuredClone(captured.metadataByProject.get('A')!);
      if (fault === 'abbreviation')
        Object.defineProperty(metadata.project, 'abbreviation', { value: undefined });
      if (fault === 'row name')
        Object.defineProperty(metadata.workItems[0], 'name', { value: undefined });
      if (fault === 'step name')
        Object.defineProperty(metadata.steps[0], 'name', { value: undefined });
      if (fault === 'step code')
        Object.defineProperty(metadata.steps[0], 'code', { value: undefined });
      expect(() =>
        projectConnectedTree(
          {
            ...captured,
            metadataByProject: new Map([...captured.metadataByProject, ['A', metadata]]),
          },
          'B',
        ),
      ).toThrow(`endpoint ${fault}`);
    },
  );
});
