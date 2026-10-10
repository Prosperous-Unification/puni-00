import type { Stores, TransactionalStores } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseId, CaseRegistration } from './case-manifest';
import type { CaseFixture, SourceDeclaration } from './source-declaration';
import { actualRegistrations } from './stores/actuals';
import { calendarMarkerRegistrations } from './stores/calendar-markers';
import { capacityRegistrations } from './stores/capacity';
import { dependencyRegistrations } from './stores/dependencies';
import { directoryRegistrations } from './stores/directory';
import { estimateRegistrations } from './stores/estimates';
import { eventLogRegistrations } from './stores/event-log';
import { journalRegistrations } from './stores/journal';
import { measureRegistrations } from './stores/measures';
import { planEventRegistrations } from './stores/plan-events';
import { type OpenCase, storeCase } from './stores/store-case';
import { typedDependencyRegistrations } from './stores/typed-dependencies';
export { DEPENDENCY_SURVIVOR_IDS } from './stores/dependencies';
import { progressRegistrations } from './stores/progress';
export { PROGRESS_SENTINEL_STEP_ID } from './stores/progress';
import { historyBatchRegistrations, type OpenHistoryBatchCase } from './stores/history-batch';
import { priorityBandRegistrations } from './stores/priority-bands';
import { projectRegistrations } from './stores/projects';
import { savedPlanCaptureRegistrations } from './stores/saved-plan-capture';
import { savedPlanRegistrations } from './stores/saved-plans';
import { stepRegistrations } from './stores/steps';
import { subtreeRegistrations } from './stores/subtrees';
import { userRegistrations } from './stores/users';
import { workItemRegistrations } from './stores/work-items';

export interface ExistingStoreOpeners {
  readonly livePlans?: OpenCase<'livePlans'>;
  readonly projects: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['projects']>>;
  readonly projectRanks?: OpenCase<'projectRanks'>;
  readonly users: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['users']>>;
  readonly capacity: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['capacity']>>;
  readonly priorityBands: (
    caseId: CaseId,
  ) => Promise<CaseFixture<TransactionalStores['priorityBands']>>;
  readonly calendarMarkers: (
    caseId: CaseId,
  ) => Promise<CaseFixture<TransactionalStores['calendarMarkers']>>;
  readonly workItems: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['workItems']>>;
  readonly steps: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['steps']>>;
  readonly estimates: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['estimates']>>;
  readonly actuals: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['actuals']>>;
  readonly measures: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['measures']>>;
  readonly progress: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['progress']>>;
  readonly typedDependencies: (
    caseId: CaseId,
  ) => Promise<CaseFixture<TransactionalStores['typedDependencies']>>;
  readonly dependencies: (
    caseId: CaseId,
  ) => Promise<CaseFixture<TransactionalStores['dependencies']>>;
  readonly directory: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['directory']>>;
  readonly eventLog: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['eventLog']>>;
  readonly planEvents: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['planEvents']>>;
  readonly subtrees: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['subtrees']>>;
  readonly journal: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['journal']>>;
  readonly savedPlans: (caseId: CaseId) => Promise<CaseFixture<Stores['savedPlans']>>;
  readonly savedPlanCapture: (caseId: CaseId) => Promise<CaseFixture<Stores['savedPlanCapture']>>;
}

export interface SourceConformanceOpeners extends ExistingStoreOpeners {
  readonly historyBatch: OpenHistoryBatchCase;
}

/** Registers the migrated source-family kits in their implementation order. */
export function existingStoreRegistrations(
  openers: ExistingStoreOpeners,
): readonly CaseRegistration[] {
  return [
    ...(openers.livePlans === undefined
      ? [{ family: 'livePlans' as const, caseId: 'livePlans.read:legacy-and-absence' as const }]
      : [
          storeCase(
            'livePlans',
            'livePlans.read:legacy-and-absence',
            openers.livePlans,
            async ({ port, seed }) => {
              if (port === undefined) throw new Error('declared live plan capability is absent');
              expect(await port.read(seed.projectIds[0], { kind: 'legacy' })).toEqual({
                kind: 'isolated',
              });
              expect(await port.read('missing-project', { kind: 'legacy' })).toEqual({
                kind: 'not_found',
              });
              expect(await port.readProject(seed.projectIds[0])).toEqual({ kind: 'isolated' });
              expect(await port.readProject('missing-project')).toEqual({ kind: 'not_found' });
              expect(await port.readExport(seed.projectIds[0], { kind: 'legacy' })).toEqual({
                kind: 'isolated',
              });
              expect(await port.readExport('missing-project', { kind: 'legacy' })).toEqual({
                kind: 'not_found',
              });
            },
          ),
        ]),
    ...projectRegistrations(openers.projects),
    ...(openers.projectRanks === undefined
      ? [{ family: 'projectRanks' as const, caseId: 'projectRanks.orderIn:scoped-move' as const }]
      : [
          storeCase(
            'projectRanks',
            'projectRanks.orderIn:scoped-move',
            openers.projectRanks,
            async ({ port, seed }) => {
              if (port === undefined) throw new Error('declared project rank capability is absent');
              expect(await port.orderIn('rank-conformance-org')).toEqual([
                { projectId: seed.projectIds[0], rank: 1, ranked: false },
                { projectId: seed.projectIds[1], rank: 2, ranked: false },
              ]);
              expect(
                await port.moveAfter(
                  'rank-conformance-org',
                  seed.projectIds[1],
                  null,
                  seed.stamps[0],
                ),
              ).toEqual({
                ok: true,
                order: [
                  { projectId: seed.projectIds[1], rank: 1, ranked: true },
                  { projectId: seed.projectIds[0], rank: 2, ranked: true },
                ],
              });
              expect(await port.orderIn('rank-conformance-org')).toEqual([
                { projectId: seed.projectIds[1], rank: 1, ranked: true },
                { projectId: seed.projectIds[0], rank: 2, ranked: true },
              ]);
            },
          ),
        ]),
    ...userRegistrations(openers.users),
    ...capacityRegistrations(openers.capacity),
    ...priorityBandRegistrations(openers.priorityBands),
    ...calendarMarkerRegistrations(openers.calendarMarkers),
    ...workItemRegistrations(openers.workItems),
    ...stepRegistrations(openers.steps),
    ...estimateRegistrations(openers.estimates),
    ...actualRegistrations(openers.actuals),
    ...measureRegistrations(openers.measures),
    ...progressRegistrations(openers.progress),
    ...dependencyRegistrations(openers.dependencies),
    ...typedDependencyRegistrations(openers.typedDependencies),
    ...directoryRegistrations(openers.directory),
    ...eventLogRegistrations(openers.eventLog),
    ...planEventRegistrations(openers.planEvents),
    ...subtreeRegistrations(openers.subtrees),
    ...journalRegistrations(openers.journal),
    ...savedPlanRegistrations(openers.savedPlans),
    ...savedPlanCaptureRegistrations(openers.savedPlanCapture),
  ];
}

/** Adds the declaration-selected supplemental history cases to every store family. */
export function sourceConformanceRegistrations(
  declaration: Pick<SourceDeclaration, 'historyAdmission'>,
  openers: SourceConformanceOpeners,
): readonly CaseRegistration[] {
  return [
    ...existingStoreRegistrations(openers),
    ...historyBatchRegistrations(declaration.historyAdmission, openers.historyBatch),
  ];
}
