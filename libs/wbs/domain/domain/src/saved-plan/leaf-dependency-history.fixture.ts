import type { StepNodeGraphEdge, StepNodeGraphNode } from '../slice-edges';
import type { SavedDependencyRelationship } from './dependency-history';

/** Synthetic codec values only; this fixture supplies no actual Source or predecessor admission certificate. */
export function leafHistoryFixture() {
  const steps = ['dev', 'qa', 'research'].map((id, position) => ({
    id,
    code: id,
    name: id,
    position,
  }));
  const rows = [
    { id: 'P', parentId: null, number: '1' },
    { id: 'story', parentId: 'P', number: '1.1' },
    { id: 'spike', parentId: 'P', number: '1.2' },
    { id: 'zero', parentId: 'P', number: '1.3' },
    { id: 'target', parentId: null, number: '2' },
  ].map((row) => ({ ...row, name: row.id, hold: null, status: 'unknown' as const }));
  const leafSteps = [
    { workItemId: 'story', stepIds: ['dev', 'qa'] },
    { workItemId: 'spike', stepIds: ['research'] },
    { workItemId: 'zero', stepIds: [] },
    { workItemId: 'target', stepIds: ['qa', 'dev'] },
  ];
  const nodes: StepNodeGraphNode[] = leafSteps.flatMap<StepNodeGraphNode>((leaf) =>
    leaf.stepIds.length === 0
      ? [{ kind: 'boundary' as const, workItemId: leaf.workItemId, at: 0 }]
      : leaf.stepIds.map((stepId, at) => ({
          kind: 'step' as const,
          ref: { workItemId: leaf.workItemId, stepId },
          at,
        })),
  );
  const edges: StepNodeGraphEdge[] = [
    {
      provenance: 'workflow',
      type: 'FS',
      predecessor: { leafId: 'story', at: 0 },
      successor: { leafId: 'story', at: 1 },
    },
    {
      provenance: 'workflow',
      type: 'FS',
      predecessor: { leafId: 'target', at: 0 },
      successor: { leafId: 'target', at: 1 },
    },
    {
      provenance: 'authored',
      relationshipId: 'qa-after-parent',
      type: 'FS',
      predecessor: { leafId: 'story', at: 1 },
      successor: { leafId: 'target', at: 0 },
    },
  ];
  const qa = steps.find((step) => step.id === 'qa');
  if (qa === undefined) throw new Error('fixture qa policy absent');
  const predecessor: SavedDependencyRelationship['predecessor'] = {
    scope: 'descendant-step',
    workPackageId: 'package',
    workItemId: 'P',
    stepId: 'qa',
    step: qa,
    name: 'P',
    workPackageAbbreviation: 'W',
    workItemNumber: '1',
    stepNodeId: null,
    stepReference: null,
    qualifiedReference: null,
    isLeaf: false,
  };
  const successor: SavedDependencyRelationship['successor'] = {
    scope: 'node',
    workPackageId: 'package',
    workItemId: 'target',
    stepId: 'qa',
    step: qa,
    name: 'target',
    workPackageAbbreviation: 'W',
    workItemNumber: '2',
    stepNodeId: 'sn1.target.qa',
    stepReference: '2.sQA',
    qualifiedReference: 'W.2.sQA',
    isLeaf: true,
  };
  const relationships: SavedDependencyRelationship[] = [
    {
      id: 'qa-after-parent',
      workPackageId: 'package',
      type: 'FS',
      predecessor,
      successor,
    },
  ];
  return structuredClone({
    kind: 'connected' as const,
    targetWorkPackageId: 'package',
    mode: 'isolated' as const,
    placementState: { kind: 'scheduled' as const },
    workPackages: [
      {
        workPackageId: 'package',
        name: 'Package',
        abbreviation: 'W',
        startDate: null,
        timezone: 'UTC',
        rank: 0,
        engine: 'fast' as const,
        objective: 'pri' as const,
        enabled: false,
        steps,
        workItems: rows,
        leafSteps,
      },
    ],
    relationships,
    graph: { nodes, edges },
    ownership: rows.map((row) => [row.id, 'package'] as [string, string]),
    readiness: nodes.map((node) => {
      const workItemId = node.kind === 'step' ? node.ref.workItemId : node.workItemId;
      const stepId = node.kind === 'step' ? node.ref.stepId : null;
      return {
        kind: node.kind,
        key: workItemId + '\u0000' + (stepId ?? ''),
        workPackageId: 'package',
        workItemId,
        stepId,
        status: 'unknown' as const,
        intrinsic: { started: false, done: false },
        eligibility: { canStart: true, canFinish: false, startBlockers: [], finishBlockers: [] },
        ...(node.kind === 'step' ? { reading: 'unknown' as const, causes: [] } : {}),
      };
    }),
  });
}
