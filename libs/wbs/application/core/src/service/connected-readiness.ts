import {
  type ConnectedGraph,
  type ExecutionEligibility,
  executionEligibilityOf,
  type ExecutionEvidence,
  indexTree,
  predecessorLeavesOf,
  rollUpProgress,
  rollUpWorkItemStatuses,
  sliceKey,
  treeOrder,
  workedStepsOf,
  type WorkItemStatus,
} from '@wbs/domain';

import type { PlanInputReads } from '../ports/saved-plan-capture-values';
import type { StoredAttempt } from '../ports/step-node-attempt-store';
import type { StoredTypedDependency } from '../ports/typed-dependency-store';
import type { ConnectedPlanCapture } from './connected-plan-values';
import { type NodeReadingProjection, projectNodeReadings } from './node-readings';
import { workItemStatusesOf } from './work-item-statuses';

/** Live component facts independent of calendar placement and optimizer availability. */
export interface ConnectedReadiness {
  readonly statuses: ReadonlyMap<string, WorkItemStatus>;
  readonly nodes: NodeReadingProjection;
  readonly evidenceByNode: ReadonlyMap<string, ExecutionEvidence>;
  readonly eligibilityByNode: ReadonlyMap<string, ExecutionEligibility>;
  readonly predecessorIdsByLeaf: ReadonlyMap<string, readonly string[]>;
  readonly orderByWorkItem: ReadonlyMap<string, number>;
}

/**
 * Fold each project's own progress and attempts, then project the complete authored
 * graph once. Required live attempts are explicit; sparse statements remain unknown.
 * Throws for absent project evidence and facts naming another project's steps or rows.
 */
export function deriveConnectedReadiness(
  capture: ConnectedPlanCapture,
  authored: ConnectedGraph,
  attemptsByProject: ReadonlyMap<string, readonly StoredAttempt[]>,
): ConnectedReadiness {
  return deriveExecutionReadiness(
    [...capture.projects].sort(
      (left, right) => left.rank - right.rank || left.projectId.localeCompare(right.projectId),
    ),
    capture.relationships,
    authored,
    attemptsByProject,
  );
}

/** Project-owned live evidence required by the scheduler-free execution reading. */
export interface ExecutionProject {
  readonly projectId: string;
  readonly reads: Pick<
    PlanInputReads,
    'workItems' | 'steps' | 'progress' | 'stepBlockages' | 'estimates' | 'actuals' | 'dependencies'
  >;
}

/** Fold complete authorized live evidence without scheduling or fabricated project metadata. */
export function deriveExecutionReadiness(
  members: readonly ExecutionProject[],
  relationships: readonly StoredTypedDependency[],
  authored: ConnectedGraph,
  attemptsByProject: ReadonlyMap<string, readonly StoredAttempt[]>,
): ConnectedReadiness {
  const progress = new Map<string, 'unknown' | 'in_progress' | 'done'>();
  const attempts: StoredAttempt[] = [];
  const orderByWorkItem = new Map<string, number>();
  for (const member of members) {
    const { reads } = member;
    const capturedAttempts = attemptsByProject.get(member.projectId);
    if (capturedAttempts === undefined)
      throw new Error(`missing live attempts for ${member.projectId}`);
    const rows = new Set(reads.workItems.map((row) => row.id));
    const steps = new Set(reads.steps.map((step) => step.id));
    for (const fact of [...reads.progress, ...reads.stepBlockages, ...capturedAttempts]) {
      if (!rows.has(fact.workItemId) || !steps.has(fact.stepId))
        throw new Error(`live evidence outside own project ${member.projectId}`);
    }
    const folded = rollUpWorkItemStatuses(
      reads.workItems,
      rollUpProgress(
        reads.workItems,
        reads.progress,
        workedStepsOf(reads.estimates, reads.actuals, reads.progress, capturedAttempts),
        capturedAttempts.filter((attempt) => attempt.endedAt === null),
      ),
    );
    for (const [id, status] of folded) progress.set(id, status);
    for (const [id] of [...treeOrder(reads.workItems)].sort((left, right) => left[1] - right[1]))
      orderByWorkItem.set(id, orderByWorkItem.size);
    attempts.push(...capturedAttempts);
  }
  const rows = members.flatMap((member) => [...member.reads.workItems]);
  const stated = members.flatMap((member) => [...member.reads.progress]);
  const dependencies = {
    edges: members.flatMap((member) => [...member.reads.dependencies]),
    typed: relationships,
  };
  const statuses = workItemStatusesOf(rows, progress, dependencies);
  const nodes = projectNodeReadings({
    graph: authored.graph,
    // Proof: replacing captured holds with null made the mounted `remote hold changes the connected proxy reading` read unknown instead of blocked_by_proxy.
    holdOf: new Map(rows.map((row) => [row.id, row.hold])),
    statusOf: statuses,
    stated,
    running: attempts.filter((attempt) => attempt.endedAt === null),
    blocked: members.flatMap((member) => [...member.reads.stepBlockages]),
  });
  const statementOf = new Map(
    stated.map((statement) => [sliceKey(statement.workItemId, statement.stepId), statement.state]),
  );
  const attempted = new Set(
    attempts.map((attempt) => sliceKey(attempt.workItemId, attempt.stepId)),
  );
  const evidenceByNode = new Map(
    authored.graph.nodes.map((node) => {
      const key =
        node.kind === 'step'
          ? sliceKey(node.ref.workItemId, node.ref.stepId)
          : sliceKey(node.workItemId, null);
      const state = node.kind === 'step' ? statementOf.get(key) : progress.get(node.workItemId);
      return [
        key,
        {
          done: state === 'done',
          // Proof: omitting attempted.has(key) kept an ended failed SS predecessor blocked in mounted `SS observes ended unsuccessful attempts` (task-6-3-admission-proofs/attempt-evidence.log).
          started: state === 'done' || state === 'in_progress' || attempted.has(key),
        },
      ];
    }),
  );
  const eligibilityByNode = executionEligibilityOf(authored.graph, evidenceByNode);
  const predecessors = predecessorLeavesOf(indexTree(rows), dependencies);
  return {
    statuses,
    nodes,
    evidenceByNode,
    eligibilityByNode,
    predecessorIdsByLeaf: new Map(
      [...predecessors].map(([id, prior]) => [
        id,
        [...prior].sort((left, right) => {
          const leftOrder = orderByWorkItem.get(left);
          const rightOrder = orderByWorkItem.get(right);
          if (leftOrder === undefined || rightOrder === undefined)
            throw new Error('predecessor absent from component order');
          return leftOrder - rightOrder;
        }),
      ]),
    ),
    orderByWorkItem,
  };
}
