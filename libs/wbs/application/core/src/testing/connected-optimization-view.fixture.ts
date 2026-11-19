import { buildConnectedSolverRequest } from '@wbs/contracts/solver/build-connected-request';
import { prepareConnectedBoundaryOutcome } from '@wbs/contracts/solver/connected-solver-outcome';
import { canonicalConnectedStageInput, scheduleResolved, sliceKey } from '@wbs/domain';

import { presentConnectedTree } from '../module/work-item/work-item.resource';
import type { ConnectedOptimizedCapturedAdapter } from '../ports/scheduler';
import type { LivePlanRead } from '../ports/shared-people-values';
import { deriveConnectedPlan } from '../service/connected-plan';
import type { ConnectedPlanCapture } from '../service/connected-plan-values';
import { deriveConnectedReadiness } from '../service/connected-readiness';
import { workPackageConnectedTree } from '../service/connected-tree';
import { connectedCapture, connectedReads } from './connected-plan-fixture';

type ConnectedRead = Extract<LivePlanRead, { kind: 'connected' }>;
const key = (id: string) => sliceKey(id, 'build');
/**
 * Mixed engines and distinct anchors with controlled captured optimizer outcomes.
 * `ready-sibling` supplies terminal Pri evidence beside selected ready Time.
 * Terminal outcomes here are synthetic identity fixtures; use
 * {@link createFractionalConnectedOptimizationTree} for real quantized infeasibility.
 */
export function createConnectedOptimizationRead(
  state: 'ready' | 'ready-sibling' | 'boundary-infeasible' | 'pending' | 'floor' = 'ready',
): ConnectedRead {
  const workPackages = ['A', 'B', 'C'].map((workPackageId, rank) => {
    const reads = connectedReads(
      workPackageId,
      rank === 0 ? '2026-10-05' : rank === 1 ? '2026-10-06' : '2026-10-07',
    );
    const first = reads.workItems.at(0);
    if (first === undefined) throw new Error('missing fixture work');
    return {
      workPackageId,
      abbreviation: `P${workPackageId}`,
      rank,
      reads: {
        ...reads,
        workPackage: {
          ...reads.workPackage,
          optimizationEnabled: true,
          scheduleEngine: workPackageId === 'B' ? ('fast' as const) : ('optimized' as const),
          scheduleObjective: 'time' as const,
        },
        ...(workPackageId === 'A'
          ? {
              workItems: [
                { ...first, id: 'a' },
                { ...first, id: 'a2', position: 1 },
              ],
              estimates: [
                ...reads.estimates,
                { workItemId: 'a2', stepId: 'build', optimistic: 1, realistic: 1, pessimistic: 1 },
              ],
            }
          : {}),
      },
    };
  });
  const capture: ConnectedPlanCapture = {
    kind: 'connected',
    organizationId: 'org',
    mode: 'isolated',
    workPackages,
    relationships: [
      {
        id: 'ab',
        workPackageId: 'B',
        type: 'SS',
        predecessor: { workPackageId: 'A', scope: 'whole', workItemId: 'a' },
        successor: { workPackageId: 'B', scope: 'whole', workItemId: 'b' },
      },
      {
        id: 'bc',
        workPackageId: 'C',
        type: 'SS',
        predecessor: { workPackageId: 'B', scope: 'whole', workItemId: 'b' },
        successor: { workPackageId: 'C', scope: 'whole', workItemId: 'c' },
      },
    ],
  };
  const optimizer: ConnectedOptimizedCapturedAdapter = {
    readConnectedCaptured: ({ stage }) => {
      const question = {
        workPackageId: stage.workPackageId,
        inputHash: stage.workPackageId,
        questionHash: `q-${stage.workPackageId}`,
        objective: 'time' as const,
        contractVersion: 'test',
        budgetMs: 100,
        quantum: 48,
        wireVersion: 5,
        stageBytes: canonicalConnectedStageInput(stage),
      };
      const candidate =
        state === 'ready' || state === 'ready-sibling' || state === 'floor'
          ? {
              question,
              starts:
                state === 'floor'
                  ? new Map(
                      [...stage.starts]
                        .filter(([key]) =>
                          stage.input.slices.some(
                            (slice) =>
                              sliceKey(slice.workItemId, slice.stepId) === key &&
                              slice.workItemId.startsWith(stage.workPackageId.toLowerCase()),
                          ),
                        )
                        .map(([key, start]) => [key, start + 1]),
                    )
                  : stage.workPackageId === 'A'
                    ? new Map([
                        [key('a'), 0],
                        [key('a2'), 1],
                      ])
                    : new Map([
                        [
                          key(stage.workPackageId.toLowerCase()),
                          stage.workPackageId === 'B' ? 3 : 6,
                        ],
                      ]),
            }
          : null;
      return {
        inputHash: stage.workPackageId,
        generation: null,
        contractVersion: 'test',
        budgetMs: 100,
        quantum: 48,
        wireVersion: 5,
        variants: {
          pri:
            state === 'ready-sibling'
              ? {
                  state: 'boundary-infeasible',
                  certificate: {
                    kind: 'boundary-infeasible',
                    question: { ...question, objective: 'pri' },
                    evidence: 'contradictory-bounds',
                  },
                }
              : state === 'ready' || state === 'floor'
                ? { state: 'ready', proof: state === 'floor' ? 'quantisation-floor' : 'proven' }
                : { state: 'idle' },
          time:
            state === 'ready' || state === 'ready-sibling' || state === 'floor'
              ? { state: 'ready', proof: state === 'floor' ? 'quantisation-floor' : 'proven' }
              : state === 'pending'
                ? { state }
                : {
                    state,
                    certificate: { kind: state, question, evidence: 'contradictory-bounds' },
                  },
        },
        candidates: {
          pri:
            candidate === null || state === 'ready-sibling'
              ? null
              : { ...candidate, question: { ...question, objective: 'pri' } },
          time: candidate,
        },
      };
    },
  };
  const projection = deriveConnectedPlan(
    capture,
    { supports: () => true },
    (input) =>
      scheduleResolved(
        input,
        new Map([
          [key('a'), 3],
          [key('a2'), 7],
          [key('b'), 5],
          [key('c'), 8],
        ]),
      ),
    optimizer,
  );
  return buildConnectedRead(capture, projection);
}

/** A complete HTTP tree produced from the captured mixed-engine observation. */
export function createConnectedOptimizationTree(
  state: Parameters<typeof createConnectedOptimizationRead>[0] = 'ready',
  workPackageId = 'A',
) {
  return {
    ...presentConnectedTree(
      workPackageConnectedTree(createConnectedOptimizationRead(state), workPackageId),
    ),
    undoable: false,
    redoable: false,
  };
}

function buildConnectedRead(
  capture: ConnectedPlanCapture,
  projection: ConnectedRead['projection'],
): ConnectedRead {
  return {
    kind: 'connected',
    projection,
    readiness: deriveConnectedReadiness(
      capture,
      projection.authored,
      new Map(capture.workPackages.map(({ workPackageId }) => [workPackageId, []])),
    ),
    metadataByWorkPackage: new Map(
      capture.workPackages.map(({ workPackageId, abbreviation, reads }) => [
        workPackageId,
        {
          workPackage: { ...reads.workPackage, abbreviation, revision: 1, createdAt: 0 },
          workItems: reads.workItems.map((row) => ({
            ...row,
            externalRefs: [],
            factStart: null,
            factEnd: null,
            createdAt: 0,
          })),
          steps: reads.steps.map((step) => ({ ...step, workPackageId })),
          attempts: [],
          blockages: [],
          seq: 1,
        },
      ]),
    ),
  };
}

/**
 * A real FS chain whose middle stage fits in real days but has no integer start
 * at quantum 48. The terminal certificate comes from solver preparation and
 * classification; no child process or invented infeasibility certificate is used.
 *
 * Terminal Pri is prepared independently with its own objective and question hash.
 * The supplied hash controls fixture identity for successive authoritative reads.
 */
export function createFractionalConnectedOptimizationTree(
  sibling: 'idle' | 'pending' | 'failed' | 'boundary-infeasible' = 'idle',
  inputHash = 'fractional',
) {
  const workPackages = ['A', 'B', 'C'].map((workPackageId, rank) => {
    const reads = connectedReads(workPackageId);
    return {
      workPackageId,
      abbreviation: `P${workPackageId}`,
      rank,
      reads: {
        ...reads,
        workPackage: {
          ...reads.workPackage,
          optimizationEnabled: workPackageId === 'B',
          scheduleEngine: workPackageId === 'B' ? ('optimized' as const) : ('fast' as const),
          scheduleObjective: 'time' as const,
        },
        estimates: reads.estimates.map((estimate) => ({
          ...estimate,
          optimistic: workPackageId === 'A' ? 0.2 : 1,
          realistic: workPackageId === 'A' ? 0.2 : 1,
          pessimistic: workPackageId === 'A' ? 0.2 : 1,
        })),
      },
    };
  });
  const capture: ConnectedPlanCapture = {
    kind: 'connected',
    organizationId: 'org',
    mode: 'isolated',
    workPackages,
    relationships: [
      {
        id: 'ab',
        workPackageId: 'B',
        type: 'FS',
        predecessor: { workPackageId: 'A', scope: 'whole', workItemId: 'a' },
        successor: { workPackageId: 'B', scope: 'whole', workItemId: 'b' },
      },
      {
        id: 'bc',
        workPackageId: 'C',
        type: 'FS',
        predecessor: { workPackageId: 'B', scope: 'whole', workItemId: 'b' },
        successor: { workPackageId: 'C', scope: 'whole', workItemId: 'c' },
      },
    ],
  };
  const optimizer: ConnectedOptimizedCapturedAdapter = {
    readConnectedCaptured: ({ stage }) => {
      const prepareTerminal = (objective: 'pri' | 'time') => {
        const prepared = buildConnectedSolverRequest(
          stage,
          { inputHash, questionHash: `${inputHash}-${objective}` },
          { solverVersion: '0.4.0', budgetMs: 100 },
          objective,
        );
        if (prepared.kind !== 'boundary-infeasible')
          throw new Error(
            `fractional fixture requires boundary-infeasible, received ${prepared.kind}`,
          );
        const classified = prepareConnectedBoundaryOutcome(prepared);
        const request = classified.certificate.request;
        const question = {
          workPackageId: stage.workPackageId,
          inputHash: request.scope.inputHash,
          questionHash: request.scope.questionHash,
          objective,
          contractVersion: request.contractVersion,
          budgetMs: request.budgetMs,
          quantum: request.quantum,
          wireVersion: request.wireVersion,
          stageBytes: canonicalConnectedStageInput(classified.certificate.stage),
        };
        return {
          state: classified.kind,
          certificate: {
            kind: classified.kind,
            question,
            evidence:
              classified.certificate.evidence.kind === 'contradictory-bounds'
                ? ('contradictory-bounds' as const)
                : ('initial-model-infeasible' as const),
          },
        };
      };
      const time = prepareTerminal('time');
      const question = time.certificate.question;
      return {
        inputHash: question.inputHash,
        generation: null,
        contractVersion: question.contractVersion,
        budgetMs: question.budgetMs,
        quantum: question.quantum,
        wireVersion: question.wireVersion,
        variants: {
          pri:
            sibling === 'boundary-infeasible'
              ? prepareTerminal('pri')
              : sibling === 'failed'
                ? { state: 'failed', reason: 'timeout' }
                : { state: sibling },
          time,
        },
        candidates: { pri: null, time: null },
      };
    },
  };
  const projection = deriveConnectedPlan(
    capture,
    { supports: () => true },
    scheduleResolved,
    optimizer,
  );
  return {
    ...presentConnectedTree(workPackageConnectedTree(buildConnectedRead(capture, projection), 'B')),
    undoable: false,
    redoable: false,
  };
}

/** A structured unavailable tree derived without requesting optimizer work. */
export function createUnavailableConnectedOptimizationTree(
  reason: 'missing-calendar' | 'required-engine',
) {
  const reads = connectedReads('A', reason === 'missing-calendar' ? null : '2026-10-05');
  const capture = connectedCapture({
    ...reads,
    workPackage: {
      ...reads.workPackage,
      scheduleEngine: reason === 'required-engine' ? 'optimized' : 'fast',
      optimizationEnabled: reason === 'required-engine',
    },
  });
  const projection = deriveConnectedPlan(capture, { supports: () => false }, scheduleResolved);
  return {
    ...presentConnectedTree(workPackageConnectedTree(buildConnectedRead(capture, projection), 'B')),
    undoable: false,
    redoable: false,
  };
}
