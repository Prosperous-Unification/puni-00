import { formatStepNodeId, type StepNodeRef } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';
import {
  type DagExternalWorkSession,
  materializeMultiEntryDagInputFromRecordCatalog,
} from 'configurable-tree-traversal';

import { materializeOrderedSteps, prepareCoordination } from './topology';

const WORK_ITEM = '0f8fad5b-d9cb-469f-a165-70867728950e';
const FIRST_STEP = '00000000-0000-4000-8000-000000000001';
const SECOND_STEP = '00000000-0000-4000-8000-000000000002';
const FIRST_NODE = 'sn1.0f8fad5b-d9cb-469f-a165-70867728950e.00000000-0000-4000-8000-000000000001';
const SECOND_NODE = 'sn1.0f8fad5b-d9cb-469f-a165-70867728950e.00000000-0000-4000-8000-000000000002';

function advanceTickets(session: DagExternalWorkSession<string>) {
  const boundary = session.runUntilWorkBoundary();
  expect(boundary.kind).toBe('awaitingSettlement');
  if (boundary.kind !== 'awaitingSettlement') throw new Error('Expected native work tickets');
  return boundary.workSettlementTickets;
}

function materializeCatalog(
  steps: readonly StepNodeRef[],
  dependencies: {
    selectStructuralChildVertexIds?: (step: StepNodeRef) => readonly string[];
    selectWorkPrerequisiteVertexIds?: (step: StepNodeRef) => readonly string[];
    selectSubgraphCompletionPrerequisiteVertexIds?: (step: StepNodeRef) => readonly string[];
  } = {},
) {
  return materializeMultiEntryDagInputFromRecordCatalog(steps, {
    selectVertexId: formatStepNodeId,
    ...dependencies,
  });
}

describe('ordered coordination topology', () => {
  it('issues actual native tickets in WBS order and releases the successor only after completion', () => {
    const session = prepareCoordination(
      materializeOrderedSteps(WORK_ITEM, [
        { id: SECOND_STEP, position: 20 },
        { id: FIRST_STEP, position: 10 },
      ]),
    ).createExternalWorkSession();
    const tickets = advanceTickets(session);
    expect(tickets.map((ticket) => ticket.vertexId)).toEqual([FIRST_NODE]);
    expect(advanceTickets(session).map((ticket) => ticket.vertexId)).toEqual([FIRST_NODE]);
    expect(session.acceptCompletedWork(tickets[0])).toEqual({ kind: 'accepted' });
    expect(session.acceptCompletedWork(tickets[0])).toEqual({ kind: 'alreadyAccepted' });
    expect(advanceTickets(session).map((ticket) => ticket.vertexId)).toEqual([SECOND_NODE]);
  });

  it('uses bytewise IDs to break equal-position ties without mutating the catalog', () => {
    const steps = [
      { id: 'a', position: 10 },
      { id: 'Z', position: 10 },
      { id: 'z', position: 10 },
    ];
    const dag = prepareCoordination(materializeOrderedSteps('leaf', steps));
    expect(
      dag.liveVertexSummaries.map((vertex) => [vertex.vertexId, vertex.workWaitsForWorkOf]),
    ).toEqual([
      ['sn1.leaf.Z', []],
      ['sn1.leaf.a', ['sn1.leaf.Z']],
      ['sn1.leaf.z', ['sn1.leaf.a']],
    ]);
    expect(steps.map((step) => step.id)).toEqual(['a', 'Z', 'z']);
  });

  it('keeps node identities and compatibility dependencies stable across display changes', () => {
    const steps = [
      { id: FIRST_STEP, position: 10, name: 'Build', code: 'dev' },
      { id: SECOND_STEP, position: 20, name: 'Test', code: 'qa' },
    ];
    const before = prepareCoordination(materializeOrderedSteps(WORK_ITEM, steps));
    const after = prepareCoordination(
      materializeOrderedSteps(
        WORK_ITEM,
        steps.map((step) => ({ ...step, name: 'Renamed', code: 'renamed' })),
      ),
    );
    expect(after.definition).toEqual(before.definition);
    expect(after.liveVertexSummaries.map((vertex) => vertex.vertexId)).toEqual([
      FIRST_NODE,
      SECOND_NODE,
    ]);
  });

  it('seeds accepted predecessor work into independent native sessions', () => {
    const dag = prepareCoordination(
      materializeOrderedSteps(WORK_ITEM, [
        { id: FIRST_STEP, position: 10 },
        { id: SECOND_STEP, position: 20 },
      ]),
    );
    const reconstructed = dag.createExternalWorkSession({
      acceptedCompletedWorkVertexIds: new Set([FIRST_NODE]),
    });
    expect(advanceTickets(reconstructed).map((ticket) => ticket.vertexId)).toEqual([SECOND_NODE]);
    expect(
      advanceTickets(dag.createExternalWorkSession()).map((ticket) => ticket.vertexId),
    ).toEqual([FIRST_NODE]);
  });

  it('finishes an empty step catalog without inventing a work-item step', () => {
    const session = prepareCoordination(
      materializeOrderedSteps(WORK_ITEM, []),
    ).createExternalWorkSession();
    expect(session.runUntilWorkBoundary()).toEqual({ kind: 'finished' });
  });
});

describe('complete native coordination topology', () => {
  const backend = { workItemId: 'leaf', stepId: 'backend' };
  const frontend = { workItemId: 'leaf', stepId: 'frontend' };
  const review = { workItemId: 'leaf', stepId: 'review' };

  it('keeps a parallel join blocked until both prerequisite work milestones are accepted', () => {
    const dag = prepareCoordination(
      materializeCatalog([backend, frontend, review], {
        selectWorkPrerequisiteVertexIds: (step) =>
          step === review ? ['sn1.leaf.backend', 'sn1.leaf.frontend'] : [],
      }),
    );
    const session = dag.createExternalWorkSession({
      acceptedCompletedWorkVertexIds: new Set(['sn1.leaf.backend']),
    });
    const tickets = advanceTickets(session);
    expect(tickets.map((ticket) => ticket.vertexId)).toEqual(['sn1.leaf.frontend']);
    session.acceptCompletedWork(tickets[0]);
    expect(advanceTickets(session).map((ticket) => ticket.vertexId)).toEqual(['sn1.leaf.review']);
  });

  it('preserves the distinction between accepted parent work and unfinished subgraph completion', () => {
    const child = { workItemId: 'leaf', stepId: 'child' };
    const dag = prepareCoordination(
      materializeCatalog([backend, child, frontend, review], {
        selectStructuralChildVertexIds: (step) => (step === backend ? ['sn1.leaf.child'] : []),
        selectWorkPrerequisiteVertexIds: (step) => (step === frontend ? ['sn1.leaf.backend'] : []),
        selectSubgraphCompletionPrerequisiteVertexIds: (step) =>
          step === review ? ['sn1.leaf.backend'] : [],
      }),
    );
    const session = dag.createExternalWorkSession({
      acceptedCompletedWorkVertexIds: new Set(['sn1.leaf.backend']),
    });
    const tickets = advanceTickets(session);
    expect(tickets.map((ticket) => ticket.vertexId)).toEqual([
      'sn1.leaf.child',
      'sn1.leaf.frontend',
    ]);
    session.acceptCompletedWork(tickets[0]);
    expect(advanceTickets(session).map((ticket) => ticket.vertexId)).toEqual([
      'sn1.leaf.frontend',
      'sn1.leaf.review',
    ]);
  });

  it('refuses a disconnected cycle before exposing any executable topology', () => {
    const input = materializeCatalog([review, backend, frontend], {
      selectWorkPrerequisiteVertexIds: (step) =>
        step === backend ? ['sn1.leaf.frontend'] : step === frontend ? ['sn1.leaf.backend'] : [],
    });
    expect(() => prepareCoordination(input)).toThrow('Invalid coordination topology');
  });

  it('refuses an absent prerequisite before exposing any executable topology', () => {
    const input = materializeCatalog([review, backend], {
      selectWorkPrerequisiteVertexIds: (step) => (step === backend ? ['sn1.leaf.absent'] : []),
    });
    expect(() => prepareCoordination(input)).toThrow('Invalid coordination topology');
  });

  it('refuses a milestone cycle even when structural discovery is acyclic', () => {
    const input = materializeCatalog([backend, frontend], {
      selectStructuralChildVertexIds: (step) => (step === backend ? ['sn1.leaf.frontend'] : []),
      selectSubgraphCompletionPrerequisiteVertexIds: (step) =>
        step === backend ? ['sn1.leaf.backend'] : [],
    });
    expect(() => prepareCoordination(input)).toThrow('Invalid coordination topology');
  });

  it('preserves the exact source exception instead of treating unreadable topology as empty', () => {
    const failure = new Error('Authoritative topology is unreadable');
    const input = materializeCatalog([backend]);
    input.dagDiscoverySource.resolveRootVertex = () => {
      throw failure;
    };
    let thrown: unknown;
    try {
      prepareCoordination(input);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(failure);
  });
});
