import type { DeliveryReader } from '@shared/delivery';
import { getWorkItemDelivery } from '@wbs/contracts';

import type { WorkItemService } from '../module/work-item/work-item.resource';
import type { OrganizationAccess } from '../ports/organization-access';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/** Authorizes the project, work item and saved reference before invoking the external reader. */
export function deliveryRoutes(
  workItems: WorkItemService,
  organizations: OrganizationAccess,
  delivery: DeliveryReader,
) {
  return [
    bind(
      getWorkItemDelivery,
      async ({ params, principal }): Promise<HttpReply<typeof getWorkItemDelivery>> => {
        const resolved = await organizations.resolve(principal);
        // Proof: removing this refusal made the unbound-session case return 500 instead of 403.
        if (!resolved.ok) return organizationRefusal(resolved);
        // Proof: using tree instead of treeWithin exposed the saved reference to grace (200 instead of 404)
        // in answers foreign, missing and misassociated resources alike without provider reads.
        const tree = await workItems.treeWithin(params.id, resolved.access);
        // Proof: removing this null refusal made the missing/foreign-resource case return 500 instead of 404.
        if (tree === null) return { ok: false, status: 404, body: { error: 'not_found' } };
        // Proof: removing this branch made rechecks membership after initial organization resolution return 500 instead of 403.
        if ('kind' in tree && tree.kind === 'access_refused')
          return organizationRefusal(tree.refusal);
        // Proof: removing this branch made preserves an unavailable schedule refusal before provider reads return 500 instead of 409.
        if ('kind' in tree)
          return { ok: false, status: 409, body: { error: tree.error, engine: tree.engine } };
        // Proof: accepting the first work item exposed a mismatched work-item reference (200 instead of 404) in the association negative.
        const workItem = tree.workItems.find((candidate) => candidate.id === params.workItemId);
        // Proof: accepting the first ref accepted a mismatched reference (200 instead of 404) in the association negative.
        const reference = workItem?.externalRefs.find((candidate) => candidate.id === params.refId);
        // Proof: removing this refusal made the missing-reference case return 500 instead of 404.
        if (reference === undefined)
          return { ok: false, status: 404, body: { error: 'not_found' } };
        return { ok: true, status: 200, body: await delivery.read(reference.url) };
      },
    ),
  ] as const;
}
