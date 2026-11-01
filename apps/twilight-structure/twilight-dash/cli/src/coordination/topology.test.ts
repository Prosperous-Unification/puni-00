import { formatStepNodeId, type StepNodeRef } from '@wbs/domain';
import { describe, expect, it } from 'bun:test';
import { type DagWorkSession, materializeDagInputFromRecords } from 'configurable-tree-traversal';

import { materializeOrderedSteps, prepareCoordination } from './topology';

const WORK_ITEM = '0f8fad5b-d9cb-469f-a165-70867728950e';
const FIRST_STEP = '00000000-0000-4000-8000-000000000001';
const SECOND_STEP = '00000000-0000-4000-8000-000000000002';
const FIRST_NODE = 'sn1.0f8fad5b-d9cb-469f-a165-70867728950e.00000000-0000-4000-8000-000000000001';
const SECOND_NODE = 'sn1.0f8fad5b-d9cb-469f-a165-70867728950e.00000000-0000-4000-8000-000000000002';

function advanceTickets(session: DagWorkSession<string>) {
  const boundary = session.advance();
  expect(boundary.kind).toBe('awaitingSettlement');
  if (boundary.kind !== 'awaitingSettlement') throw new Error('Expected native work tickets');
  return boundary.workTickets;
}

function materializeCatalog(
  steps: readonly StepNodeRef[],
  dependencies: {
    children?: (step: StepNodeRef) => readonly string[];
    dependsOnWork?: (step: StepNodeRef) => readonly string[];
    dependsOnSubgraphCompletion?: (step: StepNodeRef) => readonly string[];
  } = {},
) {
  return materializeDagInputFromRecords(steps, { id: formatStepNodeId, ...dependencies });
}

describe('ordered coordination topology', () => {
  it('issues actual native tickets in WBS order and releases the successor only after completion', () => {
    const session = prepareCoordination(
      materializeOrderedSteps(WORK_ITEM, [
        { id: SECOND_STEP, position: 20 },
        { id: FIRST_STEP, position: 10 },
      ]),
    ).createWorkSession();
    const tickets = advanceTickets(session);
    expect(tickets.map((ticket) => ticket.vertexId)).toEqual([FIRST_NODE]);
    expect(advanceTickets(session).map((ticket) => ticket.vertexId)).toEqual([FIRST_NODE]);
    expect(session.completeWork(tickets[0])).toEqual({ kind: 'accepted' });
    expect(session.completeWork(tickets[0])).toEqual({ kind: 'alreadyAccepted' });
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
      dag.liveVertexSummaries.map((vertex) => [vertex.vertexId, vertex.dependsOnWork]),
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
    const reconstructed = dag.createWorkSession({ completedWork: new Set([FIRST_NODE]) });
    expect(advanceTickets(reconstructed).map((ticket) => ticket.vertexId)).toEqual([SECOND_NODE]);
    expect(advanceTickets(dag.createWorkSession()).map((ticket) => ticket.vertexId)).toEqual([
      FIRST_NODE,
    ]);
  });

  it('finishes an empty step catalog without inventing a work-item step', () => {
    const session = prepareCoordination(materializeOrderedSteps(WORK_ITEM, [])).createWorkSession();
    expect(session.advance()).toEqual({ kind: 'finished' });
  });
});

describe('complete native coordination topology', () => {
  const backend = { workItemId: 'leaf', stepId: 'backend' };
  const frontend = { workItemId: 'leaf', stepId: 'frontend' };
  const review = { workItemId: 'leaf', stepId: 'review' };

  it('keeps a parallel join blocked until both prerequisite work milestones are accepted', () => {
    const dag = prepareCoordination(
      materializeCatalog([backend, frontend, review], {
        dependsOnWork: (step) => (step === review ? ['sn1.leaf.backend', 'sn1.leaf.frontend'] : []),
      }),
    );
    const session = dag.createWorkSession({ completedWork: new Set(['sn1.leaf.backend']) });
    const tickets = advanceTickets(session);
    expect(tickets.map((ticket) => ticket.vertexId)).toEqual(['sn1.leaf.frontend']);
    session.completeWork(tickets[0]);
    expect(advanceTickets(session).map((ticket) => ticket.vertexId)).toEqual(['sn1.leaf.review']);
  });

  it('preserves the distinction between accepted parent work and unfinished subgraph completion', () => {
    const child = { workItemId: 'leaf', stepId: 'child' };
    const dag = prepareCoordination(
      materializeCatalog([backend, child, frontend, review], {
        children: (step) => (step === backend ? ['sn1.leaf.child'] : []),
        dependsOnWork: (step) => (step === frontend ? ['sn1.leaf.backend'] : []),
        dependsOnSubgraphCompletion: (step) => (step === review ? ['sn1.leaf.backend'] : []),
      }),
    );
    const session = dag.createWorkSession({ completedWork: new Set(['sn1.leaf.backend']) });
    const tickets = advanceTickets(session);
    expect(tickets.map((ticket) => ticket.vertexId)).toEqual([
      'sn1.leaf.child',
      'sn1.leaf.frontend',
    ]);
    session.completeWork(tickets[0]);
    expect(advanceTickets(session).map((ticket) => ticket.vertexId)).toEqual([
      'sn1.leaf.frontend',
      'sn1.leaf.review',
    ]);
  });

  it('refuses a disconnected cycle before exposing any executable topology', () => {
    const input = materializeCatalog([review, backend, frontend], {
      dependsOnWork: (step) =>
        step === backend ? ['sn1.leaf.frontend'] : step === frontend ? ['sn1.leaf.backend'] : [],
    });
    expect(() => prepareCoordination(input)).toThrow('Invalid coordination topology');
  });

  it('refuses an absent prerequisite before exposing any executable topology', () => {
    const input = materializeCatalog([review, backend], {
      dependsOnWork: (step) => (step === backend ? ['sn1.leaf.absent'] : []),
    });
    expect(() => prepareCoordination(input)).toThrow('Invalid coordination topology');
  });

  it('refuses a milestone cycle even when structural discovery is acyclic', () => {
    const input = materializeCatalog([backend, frontend], {
      children: (step) => (step === backend ? ['sn1.leaf.frontend'] : []),
      dependsOnSubgraphCompletion: (step) => (step === backend ? ['sn1.leaf.backend'] : []),
    });
    expect(() => prepareCoordination(input)).toThrow('Invalid coordination topology');
  });

  it('preserves the exact source exception instead of treating unreadable topology as empty', () => {
    const failure = new Error('Authoritative topology is unreadable');
    const input = materializeCatalog([backend]);
    input.traversableGraph.resolveRoot = () => {
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
