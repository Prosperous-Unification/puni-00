import type { TransactionalStores } from '@wbs/core';

import type { CaseId, CaseRegistration } from './case-manifest';
import type { CaseFixture } from './source-declaration';
import { directoryRegistrations } from './stores/directory';
import { estimateRegistrations } from './stores/estimates';
import { eventLogRegistrations } from './stores/event-log';
import { projectRegistrations } from './stores/projects';
import { stepRegistrations } from './stores/steps';

export interface ExistingStoreOpeners {
  readonly projects: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['projects']>>;
  readonly steps: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['steps']>>;
  readonly estimates: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['estimates']>>;
  readonly directory: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['directory']>>;
  readonly eventLog: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['eventLog']>>;
}

/** Registers the migrated source-family kits in their implementation order. */
export function existingStoreRegistrations(
  openers: ExistingStoreOpeners,
): readonly CaseRegistration[] {
  return [
    ...projectRegistrations(openers.projects),
    ...stepRegistrations(openers.steps),
    ...estimateRegistrations(openers.estimates),
    ...directoryRegistrations(openers.directory),
    ...eventLogRegistrations(openers.eventLog),
  ];
}
