import type { TransactionalStores } from '@wbs/core';

import type { CaseId, CaseRegistration } from './case-manifest';
import type { CaseFixture } from './source-declaration';
import { directoryRegistrations } from './stores/directory';
import { estimateRegistrations } from './stores/estimates';
import { eventLogRegistrations } from './stores/event-log';
import { stepRegistrations } from './stores/steps';

export interface ExistingStoreOpeners {
  readonly steps: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['steps']>>;
  readonly estimates: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['estimates']>>;
  readonly directory: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['directory']>>;
  readonly eventLog: (caseId: CaseId) => Promise<CaseFixture<TransactionalStores['eventLog']>>;
}

/** Registers the four source-family kits that predate the complete manifest. */
export function existingStoreRegistrations(
  openers: ExistingStoreOpeners,
): readonly CaseRegistration[] {
  return [
    ...stepRegistrations(openers.steps),
    ...estimateRegistrations(openers.estimates),
    ...directoryRegistrations(openers.directory),
    ...eventLogRegistrations(openers.eventLog),
  ];
}
