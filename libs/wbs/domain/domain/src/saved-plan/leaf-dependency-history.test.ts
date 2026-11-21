import { expect, test } from 'bun:test';

import * as domain from '../index';
import { readSavedDependencyHistory, type SavedDependencyRelationship } from './dependency-history';
import { leafHistoryFixture } from './leaf-dependency-history.fixture';

function read(body: unknown): ReturnType<typeof leafHistoryFixture> {
  const decode = Reflect.get(domain, 'readLeafDependencyHistory') as
    ((body: unknown) => ReturnType<typeof leafHistoryFixture>) | undefined;
  expect(typeof decode).toBe('function');
  if (decode === undefined) throw new Error('leaf history reader absent');
  return decode(body);
}
function serialize(body: unknown): string {
  const encode = Reflect.get(domain, 'serializeLeafDependencyHistory') as
    ((body: unknown) => string) | undefined;
  expect(typeof encode).toBe('function');
  if (encode === undefined) throw new Error('leaf history serializer absent');
  return encode(body);
}

test('leaf history retains mixed own orders, matching descendants and zero boundaries', () => {
  const body = leafHistoryFixture(),
    before = JSON.stringify(body),
    captured = read(body);
  expect(captured).toEqual(body);
  expect(captured.graph.nodes).toHaveLength(6);
  expect(captured.graph.edges).toHaveLength(3);
  expect(Object.isFrozen(captured.workPackages[0].leafSteps[0].stepIds)).toBe(true);
  body.workPackages[0].leafSteps[0].stepIds.reverse();
  expect(captured.workPackages[0].leafSteps[0].stepIds).toEqual(['dev', 'qa']);
  expect(JSON.stringify(read(leafHistoryFixture()))).toBe(before);
});

test('leaf history serializer orders inventory rows without changing step order', () => {
  const first = leafHistoryFixture(),
    permuted = leafHistoryFixture();
  permuted.workPackages[0].leafSteps.reverse();
  permuted.graph.nodes.reverse();
  permuted.graph.edges.reverse();
  permuted.readiness.reverse();
  permuted.ownership.reverse();
  expect(serialize(permuted)).toBe(serialize(first));
  expect(
    read(JSON.parse(serialize(first))).workPackages[0].leafSteps.find(
      (leaf: { workItemId: string }) => leaf.workItemId === 'target',
    )?.stepIds,
  ).toEqual(['qa', 'dev']);
});

for (const fault of [
  'missing-field',
  'missing-leaf',
  'extra-parent',
  'extra-foreign',
  'duplicate-leaf',
  'duplicate-step',
  'unknown-step',
] as const)
  test('leaf history refuses invalid required inventory ' + fault, () => {
    const body = leafHistoryFixture(),
      member = body.workPackages[0];
    if (fault === 'missing-field') Reflect.deleteProperty(member, 'leafSteps');
    if (fault === 'missing-leaf')
      member.leafSteps = member.leafSteps.filter((leaf) => leaf.workItemId !== 'zero');
    if (fault === 'extra-parent') member.leafSteps.push({ workItemId: 'P', stepIds: [] });
    if (fault === 'extra-foreign') member.leafSteps.push({ workItemId: 'foreign', stepIds: [] });
    if (fault === 'duplicate-leaf') member.leafSteps.push(structuredClone(member.leafSteps[0]));
    if (fault === 'duplicate-step') member.leafSteps[0].stepIds.push('dev');
    if (fault === 'unknown-step') member.leafSteps[0].stepIds.push('missing');
    expect(() => read(body)).toThrow(
      fault === 'missing-field'
        ? 'shape'
        : fault === 'duplicate-leaf'
          ? 'duplicate'
          : fault === 'duplicate-step' || fault === 'unknown-step'
            ? 'leaf_step'
            : 'leaf_inventory',
    );
  });

test('leaf history refuses a graph step outside its leaf even when package policy contains it', () => {
  const body = leafHistoryFixture();
  body.graph.nodes.push({ kind: 'step', ref: { workItemId: 'spike', stepId: 'qa' }, at: 1 });
  expect(() => read(body)).toThrow('graph_step');
});
test('leaf history refuses a missing zero-step boundary', () => {
  const body = leafHistoryFixture();
  body.graph.nodes = body.graph.nodes.filter((node) => node.kind !== 'boundary');
  expect(() => read(body)).toThrow('graph_completeness');
});
test('leaf history refuses a node selector outside its leaf', () => {
  const body = leafHistoryFixture();
  Reflect.set(body.relationships[0], 'successor', {
    ...body.relationships[0].successor,
    workItemId: 'spike',
    name: 'spike',
    workItemNumber: '1.2',
    stepNodeId: 'sn1.spike.qa',
    stepReference: '1.2.sQA',
    qualifiedReference: 'W.1.2.sQA',
  });
  body.graph.edges = body.graph.edges.filter((edge) => edge.provenance !== 'authored');
  expect(() => read(body)).toThrow('endpoint_step_resolution');
});
test('leaf history refuses an authored edge from an unmatched descendant', () => {
  const body = leafHistoryFixture();
  body.graph.edges[2] = { ...body.graph.edges[2], predecessor: { leafId: 'spike', at: 0 } };
  expect(() => read(body)).toThrow('graph_relationship_resolution');
});
test('leaf history refuses a missing authored selector pair', () => {
  const body = leafHistoryFixture();
  body.graph.edges = body.graph.edges.filter((edge) => edge.provenance !== 'authored');
  expect(() => read(body)).toThrow('graph_relationship_completeness');
});
test('leaf history refuses a missing workflow chain edge', () => {
  const body = leafHistoryFixture();
  body.graph.edges = body.graph.edges.filter((edge) => edge.predecessor.leafId !== 'target');
  expect(() => read(body)).toThrow('graph_workflow');
});
test('published uniform history keeps its original closed grammar and boundary rules', () => {
  const body = leafHistoryFixture();
  expect(() => readSavedDependencyHistory(body)).toThrow('shape');
  const { leafSteps: ignored, ...member } = body.workPackages[0];
  expect(() => readSavedDependencyHistory({ ...body, workPackages: [member] })).toThrow(
    'graph_step',
  );
});

for (const side of ['predecessor', 'successor'] as const)
  test('leaf history refuses no matching descendant at ' + side, () => {
    const body = leafHistoryFixture();
    for (const row of body.workPackages[0].workItems)
      if (row.id === 'story' || row.id === 'spike') row.parentId = null;
    if (side === 'successor') {
      const before = body.relationships[0].predecessor;
      Reflect.set(body.relationships[0], 'predecessor', body.relationships[0].successor);
      Reflect.set(body.relationships[0], 'successor', before);
    }
    body.graph.edges = body.graph.edges.filter((edge) => edge.provenance !== 'authored');
    expect(() => read(body)).toThrow('endpoint_step_resolution');
  });
for (const kind of ['root', 'member', 'leaf'] as const)
  test('leaf history refuses undeclared fields at ' + kind, () => {
    const body = leafHistoryFixture();
    Reflect.set(
      kind === 'root'
        ? body
        : kind === 'member'
          ? body.workPackages[0]
          : body.workPackages[0].leafSteps[0],
      'undeclared',
      true,
    );
    expect(() => read(body)).toThrow('shape');
  });
test('leaf history refuses a parent cycle even with no relationships or graph nodes', () => {
  const body = leafHistoryFixture(),
    first = body.workPackages[0].workItems[0];
  body.workPackages[0].workItems = [
    { ...first, id: 'P', parentId: 'Q' },
    { ...first, id: 'Q', name: 'Q', parentId: 'P' },
  ];
  body.workPackages[0].leafSteps = [];
  body.relationships = [];
  body.graph = { nodes: [], edges: [] };
  body.readiness = [];
  body.ownership = [
    ['P', 'package'],
    ['Q', 'package'],
  ];
  expect(() => read(body)).toThrow('parent_cycle');
});
for (const relationshipType of ['FS', 'SS', 'FF'] as const)
  test('leaf history retains whole ' + relationshipType + ' own boundary positions', () => {
    const body = leafHistoryFixture();
    Reflect.set(body.relationships[0], 'type', relationshipType);
    const whole = (id: string, number: string): SavedDependencyRelationship['predecessor'] => ({
      scope: 'whole' as const,
      workPackageId: 'package',
      workItemId: id,
      step: null,
      name: id,
      workPackageAbbreviation: 'W',
      workItemNumber: number,
      stepNodeId: null,
      stepReference: null,
      qualifiedReference: null,
      isLeaf: true,
    });
    Reflect.set(body.relationships[0], 'predecessor', whole('story', '1.1'));
    Reflect.set(body.relationships[0], 'successor', whole('target', '2'));
    body.graph.edges[2] = {
      provenance: 'authored',
      relationshipId: 'qa-after-parent',
      type: relationshipType,
      predecessor: { leafId: 'story', at: relationshipType === 'SS' ? 0 : 1 },
      successor: { leafId: 'target', at: relationshipType === 'FF' ? 1 : 0 },
    };
    expect(read(body)).toEqual(body);
  });
