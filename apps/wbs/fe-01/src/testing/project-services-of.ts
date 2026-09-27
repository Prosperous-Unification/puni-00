import type { ProjectApi } from '@/lib/wbs-api';
import { projectServicesOver } from '@/modules/project/composition';
import type { ProjectServices } from '@/modules/project/contract';

import { NO_SAVED_PLANS } from './no-saved-plans';

const composed = new WeakMap<ProjectApi, ProjectServices>();

/**
 * The table's services over a suite's fake client, composed once per client.
 *
 * What `ProjectPage`'s memo gives the table, for a suite that draws the table
 * on its own: the same client always yields the same services, so a rerender
 * with the client it already had keeps its reader, and a new client — the
 * suites' way of saying "another API" — is a new reader. Composing afresh on
 * every render instead would make every rerender a new reader and reopen the
 * feed. A cache rather than a component, so the table under test is the
 * table, with nothing drawn around it.
 */
export function projectServicesOf(client: ProjectApi): ProjectServices {
  const known = composed.get(client);
  if (known !== undefined) return known;
  const services = projectServicesOver(client, NO_SAVED_PLANS);
  composed.set(client, services);
  return services;
}
