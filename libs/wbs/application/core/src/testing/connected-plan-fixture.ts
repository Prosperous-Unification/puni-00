import type { CapturedWorkItem, IsoDate, PlanInputReads } from '@wbs/domain';

import type { ConnectedOptimizedCapturedAdapter } from '../ports/scheduler';
import type { LivePlanRead } from '../ports/shared-people-values';
import { deriveConnectedPlan } from '../service/connected-plan';
import type { ConnectedPlanCapture } from '../service/connected-plan-values';
import { deriveConnectedReadiness } from '../service/connected-readiness';

const work = (workPackageId: string, id: string): CapturedWorkItem => ({
  id,
  workPackageId,
  parentId: null,
  position: 0,
  name: id,
  notes: '',
  frozenNumber: null,
  startNoEarlierThan: null,
  startNoEarlierThanReason: null,
  deadline: null,
  readiness: null,
  hold: null,
  priority: null,
  serviceTeamId: null,
  serviceId: null,
  maxParallel: 1,
  revision: 1,
  teamIds: [],
  tagIds: [],
  serviceIds: [],
  typeIds: [],
  externalRefs: [],
});
export const connectedReads = (
  id: string,
  startDate: IsoDate | null = '2026-10-05',
): PlanInputReads => ({
  workPackage: {
    id,
    name: id,
    projectId: 'captured-parent',
    restricted: false,
    estimateMethod: 'realistic',
    depReach: 'whole-item',
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
    estimateRounding: 'exact',
    startDate,
    scheduleEngine: 'fast',
    scheduleObjective: 'pri',
    optimizationEnabled: false,
    solutionRef: null,
    timezone: 'UTC',
    budgetFactor: 1,
  },
  steps: [
    {
      id: 'build',
      name: 'Build',
      code: null,
      position: 0,
      allowancePercent: 0,
      estimateUnit: 'workdays',
    },
  ],
  workItems: [work(id, id.toLowerCase())],
  estimates: [
    { workItemId: id.toLowerCase(), stepId: 'build', optimistic: 1, realistic: 1, pessimistic: 1 },
  ],
  actuals: [],
  progress: [],
  stepBlockages: [],
  stepParallels: [],
  measures: [],
  measureDefinitions: null,
  measureEstimates: [],
  budgets: [],
  dependencies: [],
  typedDependencies: [],
  assignments: [],
  capacity: new Map(),
  demands: [],
  resourceCapacities: [],
  resources: [],
  priorityBands: [],
  people: [],
  teams: [],
  services: [],
  tags: [],
  workItemTypes: [],
  externalSystems: [],
});
export const connectedCapture = (
  a = connectedReads('A'),
  b = connectedReads('B'),
): ConnectedPlanCapture =>
  assembleConnectedCapture(
    'org',
    [
      { workPackageId: 'A', abbreviation: 'A', rank: 0, reads: a },
      { workPackageId: 'B', abbreviation: 'B', rank: 1, reads: b },
    ],
    [
      {
        id: 'ab',
        workPackageId: 'B',
        predecessor: { workPackageId: 'A', scope: 'whole', workItemId: 'a' },
        successor: { workPackageId: 'B', scope: 'whole', workItemId: 'b' },
        type: 'FS',
      },
    ],
  );

/** Required explicit identities for tests outside the historical A/B corruption fixture. */
export function assembleConnectedCapture(
  organizationId: string,
  workPackages: ConnectedPlanCapture['workPackages'],
  relationships: ConnectedPlanCapture['relationships'],
): ConnectedPlanCapture {
  return { kind: 'connected', organizationId, mode: 'isolated', workPackages, relationships };
}

/** Actual connected derivation/readiness/metadata pipeline, shared by historical comparison fixture owners. */
export function connectedRead(
  capture: ConnectedPlanCapture,
  scheduler: Parameters<typeof deriveConnectedPlan>[1],
  scheduleFast: Parameters<typeof deriveConnectedPlan>[2],
  optimizer: ConnectedOptimizedCapturedAdapter | null,
): Extract<LivePlanRead, { kind: 'connected' }> {
  const projection = deriveConnectedPlan(capture, scheduler, scheduleFast, optimizer);
  return {
    kind: 'connected',
    projection,
    readiness: deriveConnectedReadiness(
      capture,
      projection.authored,
      new Map(capture.workPackages.map((member) => [member.workPackageId, []])),
    ),
    metadataByWorkPackage: new Map(
      capture.workPackages.map((member) => [
        member.workPackageId,
        {
          workPackage: {
            ...member.reads.workPackage,
            abbreviation: member.abbreviation,
            revision: 7,
            createdAt: 0,
          },
          steps: member.reads.steps.map((step) => ({
            ...step,
            workPackageId: member.workPackageId,
          })),
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
}
