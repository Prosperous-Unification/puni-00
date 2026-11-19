import type { WorkPackageApi } from '@/lib/wbs-api';
import { workPackageServicesOver } from '@/modules/work-package/composition';
import type { WorkPackageServices } from '@/modules/work-package/contract';
import { createRefusingAddressApi } from '@/testing/refusing-address-api';

import { NO_SAVED_PLANS } from './no-saved-plans';

const composed = new WeakMap<WorkPackageApi, WorkPackageServices>();

/**
 * The table's services over a suite's fake client, composed once per client.
 *
 * What `WorkPackagePage`'s memo gives the table, for a suite that draws the table
 * on its own: the same client always yields the same services, so a rerender
 * with the client it already had keeps its reader, and a new client — the
 * suites' way of saying "another API" — is a new reader. Composing afresh on
 * every render instead would make every rerender a new reader and reopen the
 * feed. A cache rather than a component, so the table under test is the
 * table, with nothing drawn around it.
 */
export function workPackageServicesOf(client: WorkPackageApi): WorkPackageServices {
  const known = composed.get(client);
  if (known !== undefined) return known;
  const services = workPackageServicesOver(client, NO_SAVED_PLANS, createRefusingAddressApi());
  composed.set(client, services);
  return services;
}
