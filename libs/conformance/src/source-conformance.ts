import type { Stores, TransactionalStores } from '@wbs/core';

import type { CaseId, CaseRegistration } from './case-manifest';
import type { CaseFixture } from './source-declaration';
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
export { DEPENDENCY_SURVIVOR_IDS } from './stores/dependencies';
import { progressRegistrations } from './stores/progress';
export { PROGRESS_SENTINEL_STEP_ID } from './stores/progress';
import { priorityBandRegistrations } from './stores/priority-bands';
import { projectRegistrations } from './stores/projects';
import { savedPlanRegistrations } from './stores/saved-plans';
import { stepRegistrations } from './stores/steps';
import { subtreeRegistrations } from './stores/subtrees';
import { userRegistrations } from './stores/users';
import { workItemRegistrations } from './stores/work-items';

export interface ExistingStoreOpeners {
  readonly projects: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['projects']>>;
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
  readonly dependencies: (
    caseId: CaseId,
  ) => Promise<CaseFixture<TransactionalStores['dependencies']>>;
  readonly directory: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['directory']>>;
  readonly eventLog: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['eventLog']>>;
  readonly planEvents: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['planEvents']>>;
  readonly subtrees: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['subtrees']>>;
  readonly journal: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['journal']>>;
  readonly savedPlans: (caseId: CaseId) => Promise<CaseFixture<Stores['savedPlans']>>;
}

/** Registers the migrated source-family kits in their implementation order. */
export function existingStoreRegistrations(
  openers: ExistingStoreOpeners,
): readonly CaseRegistration[] {
  return [
    ...projectRegistrations(openers.projects),
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
    ...directoryRegistrations(openers.directory),
    ...eventLogRegistrations(openers.eventLog),
    ...planEventRegistrations(openers.planEvents),
    ...subtreeRegistrations(openers.subtrees),
    ...journalRegistrations(openers.journal),
    ...savedPlanRegistrations(openers.savedPlans),
  ];
}
