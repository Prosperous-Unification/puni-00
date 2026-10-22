import * as domain from '@wbs/domain';
import { scheduleResolved, sliceKey } from '@wbs/domain';
import { describe, expect, it, spyOn } from 'bun:test';

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
  it('labels a descendant-step selector by its parent address without inventing a single-step reference', () => {
    const a = connectedReads('A');
    const capture = connectedCapture({
      ...a,
      steps: a.steps.map((step) => ({ ...step, code: 'dev' })),
      workItems: [
        { ...a.workItems[0], id: 'parent' },
        { ...a.workItems[0], parentId: 'parent' },
      ],
    });
    const captured = live({
      ...capture,
      relationships: capture.relationships.map((relationship) => ({
        ...relationship,
        predecessor: {
          projectId: 'A',
          workItemId: 'parent',
          scope: 'descendant-step',
          stepId: 'build',
        },
      })),
    });
    expect(projectConnectedTree(captured, 'B').dependencies[0]?.predecessor).toMatchObject({
      endpoint: { projectId: 'A', workItemId: 'parent', scope: 'descendant-step', stepId: 'build' },
      isLeaf: false,
      workItemNumber: '010',
      step: { id: 'build', code: 'dev', name: 'Build' },
      stepReference: null,
      stepNodeId: null,
      qualifiedReference: 'A.010',
    });
  });

  it.each(['abbreviation', 'row name', 'step name'] as const)(
    'refuses null endpoint %s evidence',
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
        Object.defineProperty(metadata.project, 'abbreviation', { value: null });
      if (fault === 'row name')
        Object.defineProperty(metadata.workItems[0], 'name', { value: null });
      if (fault === 'step name') Object.defineProperty(metadata.steps[0], 'name', { value: null });
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
      ['evidence', { ...captured.readiness, evidenceByNode: new Map() }],
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

const sharedLive = (): ConnectedRead => {
  const a = connectedReads('A');
  const b = connectedReads('B');
  const withAna = (reads: typeof a) => ({
    ...reads,
    people: [{ id: 'ana', name: 'Local Ana', teamIds: [] }],
    assignments: [{ workItemId: reads.workItems[0].id, stepId: 'build', personId: 'ana' }],
  });
  const capture = connectedCapture(withAna(a), withAna(b));
  return live({
    ...capture,
    mode: 'shared',
    relationships: capture.relationships.map((edge) => ({ ...edge, type: 'SS' })),
  });
};

it('resolves a direct foreign person holder without changing captured numerical placement', () => {
  const captured = sharedLive();
  const before = structuredClone(captured);
  const tree = projectConnectedTree(captured, 'B');
  expect([...tree.foreignPersonHolders]).toEqual([
    [sliceKey('b', 'build'), { projectId: 'A', workItemId: 'a' }],
  ]);
  expect(tree.elsewhereHolders).toEqual([
    { projectId: 'A', projectName: 'A', workItemId: 'a', number: '010', name: 'a' },
  ]);
  if (tree.placement.kind !== 'scheduled') throw new Error('fixture schedule missing');
  expect(tree.placement.schedule.slices.get(sliceKey('b', 'build'))).toMatchObject({
    boundBy: 'person',
    resourcePredecessorId: sliceKey('a', 'build'),
  });
  expect(captured).toEqual(before);
});

it.each([
  'unknown predecessor',
  'missing ownership',
  'uncaptured owner',
  'missing metadata',
  'missing holder row',
  'missing person label',
  'null person label',
  'mismatched person',
  'null person',
  'missing person predecessor',
  'capacity annotation',
  'capacity resource',
  'existing elsewhere',
  'capacity predecessor',
  'foreign capacity',
  'foreign nonperson',
  'isolated foreign',
  'local missing referent',
  'missing holder project name',
  'missing holder row name',
] as const)('refuses corrupt captured foreign-person evidence: %s', (fault) => {
  const captured = sharedLive();
  const placement = captured.projection.placement;
  if (placement.kind !== 'scheduled') throw new Error('fixture placement missing');
  const target = placement.byProject.get('B')!;
  const waiter = target.slices.get(sliceKey('b', 'build'))!;
  const predecessor = placement.combined.slices.get(sliceKey('a', 'build'))!;
  const metadata = captured.metadataByProject.get('A')!;
  const targetMember = captured.projection.capture.projects.find(
    (member) => member.projectId === 'B',
  )!;
  let expected = '';
  switch (fault) {
    case 'unknown predecessor':
      Object.defineProperty(waiter, 'resourcePredecessorId', { value: 'absent' });
      expected = 'holder predecessor absent';
      break;
    case 'missing ownership':
      Object.defineProperty(placement.identities, 'projectIdByWorkItem', {
        value: new Map([['b', 'B']]),
      });
      expected = 'holder ownership a';
      break;
    case 'uncaptured owner':
      Object.defineProperty(captured, 'metadataByProject', {
        value: new Map([
          ...captured.metadataByProject,
          [
            'C',
            {
              ...metadata,
              project: { ...metadata.project, id: 'C' },
              workItems: metadata.workItems.map((row) => ({ ...row, projectId: 'C' })),
            },
          ],
        ]),
      });
      Object.defineProperty(placement.identities, 'projectIdByWorkItem', {
        value: new Map([
          ['a', 'C'],
          ['b', 'B'],
        ]),
      });
      expected = 'holder project is not captured C';
      break;
    case 'missing metadata':
      Object.defineProperty(captured, 'metadataByProject', {
        value: new Map([['B', captured.metadataByProject.get('B')]]),
      });
      expected = 'metadata A';
      break;
    case 'missing holder row':
      Object.defineProperty(predecessor, 'workItemId', { value: 'ghost' });
      Object.defineProperty(placement.identities, 'projectIdByWorkItem', {
        value: new Map([
          ['ghost', 'A'],
          ['b', 'B'],
        ]),
      });
      expected = 'holder row ghost';
      break;
    case 'null person label':
      Object.defineProperty(targetMember.reads.people[0], 'name', { value: null });
      expected = 'holder assignee ana';
      break;
    case 'missing person label':
      Object.defineProperty(targetMember.reads, 'people', { value: [] });
      expected = 'holder assignee ana';
      break;
    case 'mismatched person':
      Object.defineProperty(predecessor, 'personId', { value: 'other' });
      expected = 'contradictory person blocker';
      break;
    case 'null person':
      Object.defineProperty(waiter, 'personId', { value: null });
      expected = 'contradictory person blocker';
      break;
    case 'missing person predecessor':
      Object.defineProperty(waiter, 'resourcePredecessorId', { value: null });
      expected = 'person predecessor absent';
      break;
    case 'capacity annotation':
      Object.defineProperty(waiter, 'capacityTeamId', { value: 'team' });
      expected = 'contradictory person blocker';
      break;
    case 'capacity resource':
      Object.defineProperty(waiter, 'capacityResource', {
        value: { resourceId: 'pool', units: 1 },
      });
      expected = 'contradictory person blocker';
      break;
    case 'existing elsewhere':
      Object.defineProperty(waiter, 'elsewhereHolder', {
        value: { projectId: 'A', workItemId: 'a' },
      });
      expected = 'contradictory person blocker';
      break;
    case 'capacity predecessor':
      Object.defineProperty(waiter, 'capacityPredecessorIds', { value: [sliceKey('b', 'build')] });
      expected = 'contradictory person blocker';
      break;
    case 'foreign capacity':
      Object.defineProperty(waiter, 'resourcePredecessorId', { value: sliceKey('b', 'build') });
      Object.defineProperty(waiter, 'capacityPredecessorIds', { value: [sliceKey('a', 'build')] });
      Object.defineProperty(waiter, 'boundBy', { value: 'capacity' });
      expected = 'foreign or absent capacity predecessor';
      break;
    case 'foreign nonperson':
      Object.defineProperty(waiter, 'boundBy', { value: 'capacity' });
      expected = 'unsupported foreign blocker';
      break;
    case 'isolated foreign':
      Object.defineProperty(captured.projection.capture, 'mode', { value: 'isolated' });
      expected = 'unsupported foreign blocker';
      break;
    case 'local missing referent':
      Object.defineProperty(waiter, 'resourcePredecessorId', { value: 'omitted-local' });
      Object.defineProperty(placement.combined, 'slices', {
        value: new Map([
          ...placement.combined.slices,
          ['omitted-local', { ...predecessor, workItemId: 'b' }],
        ]),
      });
      expected = 'local holder is absent from target';
      break;
    case 'missing holder project name':
      Object.defineProperty(metadata.project, 'name', { value: null });
      expected = 'holder project name A';
      break;
    case 'missing holder row name':
      Object.defineProperty(metadata.workItems[0], 'name', { value: null });
      expected = 'holder row name a';
      break;
  }
  expect(() => projectConnectedTree(captured, 'B')).toThrow(expected);
});

it('reuses a holder row label across different foreign-bound target steps', () => {
  const a = connectedReads('A');
  const b = connectedReads('B');
  const withSteps = (reads: typeof a, qaDays: number) => ({
    ...reads,
    steps: [...reads.steps, { ...reads.steps[0], id: 'qa', name: 'QA', position: 1 }],
    estimates: [...reads.estimates, { ...reads.estimates[0], stepId: 'qa', realistic: qaDays }],
    people: [
      { id: 'ana', name: 'Ana', teamIds: [] },
      { id: 'ben', name: 'Ben', teamIds: [] },
    ],
    assignments: [
      { workItemId: reads.workItems[0].id, stepId: 'build', personId: 'ana' },
      { workItemId: reads.workItems[0].id, stepId: 'qa', personId: 'ben' },
    ],
  });
  const capture = connectedCapture(withSteps(a, 3), withSteps(b, 1));
  const captured = live({
    ...capture,
    mode: 'shared',
    relationships: capture.relationships.map((edge) => ({ ...edge, type: 'SS' })),
  });
  const tree = projectConnectedTree(captured, 'B');
  expect([...tree.foreignPersonHolders.values()]).toEqual([
    { projectId: 'A', workItemId: 'a' },
    { projectId: 'A', workItemId: 'a' },
  ]);
  expect(tree.elsewhereHolders).toHaveLength(1);
});

it('labels a lower-ranked direct holder under its captured own number', () => {
  const first = sharedLive();
  const capture = first.projection.capture;
  const captured = live({
    ...capture,
    projects: capture.projects.map((member) => ({
      ...member,
      rank: member.projectId === 'A' ? 1 : 0,
    })),
  });
  Object.defineProperty(captured.metadataByProject.get('A')!.workItems[0], 'frozenNumber', {
    value: '030',
  });
  const tree = projectConnectedTree(captured, 'B');
  expect(tree.elsewhereHolders).toEqual([
    { projectId: 'A', projectName: 'A', workItemId: 'a', number: '030', name: 'a' },
  ]);
});

it('labels two distinct direct holders without using the incident authored endpoint as a substitute', () => {
  const shared = sharedLive();
  const a = shared.projection.capture.projects[0].reads;
  const b = shared.projection.capture.projects[1].reads;
  const steps = [...a.steps, { ...a.steps[0], id: 'qa', name: 'QA', position: 1 }];
  const people = [
    { id: 'ana', name: 'Ana', teamIds: [] },
    { id: 'ben', name: 'Ben', teamIds: [] },
  ];
  const remote = {
    ...a,
    steps,
    people,
    workItems: [
      a.workItems[0],
      { ...a.workItems[0], id: 'a2', name: 'Second remote', position: 1 },
    ],
    estimates: [
      a.estimates[0],
      { ...a.estimates[0], workItemId: 'a2', stepId: 'qa', realistic: 4 },
    ],
    assignments: [
      { workItemId: 'a', stepId: 'build', personId: 'ana' },
      { workItemId: 'a2', stepId: 'qa', personId: 'ben' },
    ],
  };
  const target = {
    ...b,
    steps,
    people,
    estimates: [b.estimates[0], { ...b.estimates[0], stepId: 'qa' }],
    assignments: [
      { workItemId: 'b', stepId: 'build', personId: 'ana' },
      { workItemId: 'b', stepId: 'qa', personId: 'ben' },
    ],
  };
  const capture = connectedCapture(remote, target);
  const tree = projectConnectedTree(
    live({
      ...capture,
      mode: 'shared',
      relationships: capture.relationships.map((edge) => ({ ...edge, type: 'SS' })),
    }),
    'B',
  );
  expect([...tree.foreignPersonHolders.values()]).toEqual([
    { projectId: 'A', workItemId: 'a' },
    { projectId: 'A', workItemId: 'a2' },
  ]);
  expect(tree.elsewhereHolders).toEqual([
    { projectId: 'A', projectName: 'A', workItemId: 'a', number: '010', name: 'a' },
    { projectId: 'A', projectName: 'A', workItemId: 'a2', number: '020', name: 'Second remote' },
  ]);
});

it.each(['team', 'resource'] as const)(
  'preserves target-local %s blocker sets and numeric placement',
  (pool) => {
    const a = connectedReads('A');
    const b = connectedReads('B');
    const target = {
      ...b,
      workItems: [b.workItems[0], { ...b.workItems[0], id: 'b2', position: 1 }],
      estimates: [b.estimates[0], { ...b.estimates[0], workItemId: 'b2' }],
      ...(pool === 'team'
        ? {
            workItems: [
              { ...b.workItems[0], teamIds: ['pool'] },
              { ...b.workItems[0], id: 'b2', position: 1, teamIds: ['pool'] },
            ],
            capacity: new Map([['pool', 1]]),
          }
        : {
            demands: [
              { workItemId: 'b', resourceId: 'pool', units: 1 },
              { workItemId: 'b2', resourceId: 'pool', units: 1 },
            ],
            resourceCapacities: [{ resourceId: 'pool', units: 1 }],
          }),
    };
    const captured = live({ ...connectedCapture(a, target), relationships: [] });
    const before = structuredClone(captured);
    const tree = projectConnectedTree(captured, 'B');
    if (tree.placement.kind !== 'scheduled') throw new Error('fixture placement missing');
    expect(tree.placement.schedule.slices.get(sliceKey('b2', 'build'))).toMatchObject({
      boundBy: 'capacity',
      capacityPredecessorIds: [sliceKey('b', 'build')],
      resourcePredecessorId: sliceKey('b', 'build'),
    });
    expect(tree.foreignPersonHolders.size).toBe(0);
    expect(captured).toEqual(before);
  },
);

it('refuses an absent derived holder number from its numbering dependency', () => {
  const captured = sharedLive();
  const original = domain.deriveNumbers;
  const numbering = spyOn(domain, 'deriveNumbers').mockImplementation(
    (rows) => new Map([...original(rows)].filter(([id]) => id !== 'a')),
  );
  try {
    expect(() => projectConnectedTree(captured, 'B')).toThrow('holder number a');
  } finally {
    numbering.mockRestore();
  }
});

it('preserves valid empty holder and organization-person names', () => {
  const captured = sharedLive();
  Object.defineProperty(captured.metadataByProject.get('A')!.project, 'name', { value: '' });
  Object.defineProperty(captured.metadataByProject.get('A')!.workItems[0], 'name', { value: '' });
  Object.defineProperty(captured.projection.capture.projects[1].reads.people[0], 'name', {
    value: '',
  });
  const tree = projectConnectedTree(captured, 'B');
  expect(tree.elsewhereHolders).toEqual([
    { projectId: 'A', workItemId: 'a', projectName: '', number: '010', name: '' },
  ]);
  expect(tree.reads.people[0].name).toBe('');
});
