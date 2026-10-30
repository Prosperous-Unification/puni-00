import { scheduleResolved } from '@wbs/domain';

import { presentConnectedTree } from '../module/work-item/work-item.resource';
import type { LivePlanRead } from '../ports/shared-people-values';
import { deriveConnectedPlan } from '../service/connected-plan';
import type { ConnectedPlanCapture } from '../service/connected-plan-values';
import { deriveConnectedReadiness } from '../service/connected-readiness';
import { projectConnectedTree } from '../service/connected-tree';
import { connectedCapture, connectedReads } from './connected-plan-fixture';
type ConnectedRead = Extract<LivePlanRead, { kind: 'connected' }>;
const deriveRead = (capture: ConnectedPlanCapture = connectedCapture()): ConnectedRead => {
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
          blockages: member.reads.stepBlockages,
          seq: 11,
        },
      ]),
    ),
  };
};

/** Real component readiness and presenter with a root outside C's incident relationship. */
export function createConnectedBlockageRead(
  kind: 'hold' | 'step' | 'clear',
  unavailable = false,
  name = 'Remote root',
) {
  const a = connectedReads('A');
  const base = connectedCapture(
    {
      ...a,
      steps: kind === 'hold' ? [] : a.steps,
      estimates: kind === 'hold' ? [] : a.estimates,
      workItems: a.workItems.map((row) => ({
        ...row,
        name,
        hold: kind === 'hold' ? 'on_hold' : null,
      })),
      stepBlockages: kind === 'step' ? [{ workItemId: 'a', stepId: 'build', blockedAt: 1 }] : [],
    },
    connectedReads('B', unavailable ? null : '2026-10-05'),
  );
  const captured = deriveRead({
    ...base,
    projects: [
      ...base.projects,
      { projectId: 'C', abbreviation: 'C', rank: 2, reads: connectedReads('C') },
    ],
    relationships: [
      ...base.relationships,
      {
        id: 'bc',
        projectId: 'C',
        type: 'FS',
        predecessor: { projectId: 'B', scope: 'whole', workItemId: 'b' },
        successor: { projectId: 'C', scope: 'whole', workItemId: 'c' },
      },
    ],
  });
  return captured;
}

/** Present the target through the same detached production presenter as HTTP reads. */
export function createConnectedBlockageTree(
  kind: 'hold' | 'step' | 'clear',
  unavailable = false,
  name = 'Remote root',
) {
  return {
    ...presentConnectedTree(
      projectConnectedTree(createConnectedBlockageRead(kind, unavailable, name), 'C'),
    ),
    undoable: false,
    redoable: false,
  };
}
