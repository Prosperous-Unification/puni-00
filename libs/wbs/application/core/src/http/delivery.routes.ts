import { validateDeliveryReading } from '@shared/delivery';
import { getWorkItemDelivery } from '@wbs/contracts';

import type { WorkItemService } from '../module/work-item/work-item.resource';
import type { OrganizationAccess } from '../ports/organization-access';
import type { DeliveryGate } from '../service/delivery-gate';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';

/**
 * Authorizes the project, work item and saved reference before the gate may read the
 * provider, and cancels that read when the request's signal aborts (a closed tab).
 */
export function deliveryRoutes(
  workItems: WorkItemService,
  organizations: OrganizationAccess,
  delivery: DeliveryGate,
) {
  return [
    bind(
      getWorkItemDelivery,
      async ({ params, principal, request }): Promise<HttpReply<typeof getWorkItemDelivery>> => {
        const resolved = await organizations.resolve(principal);
        // Proof: removing this refusal made 'refuses unauthenticated, unbound and removed members without provider reads' answer 500 instead of 403 (2026-10-24).
        if (!resolved.ok) return organizationRefusal(resolved);
        // Proof: using tree instead of treeWithin made 'answers foreign, missing and misassociated resources alike without provider reads' answer 200 instead of 404 (2026-10-24).
        const tree = await workItems.treeWithin(params.id, resolved.access);
        // Proof: removing this refusal made 'answers foreign, missing and misassociated resources alike without provider reads' answer 500 instead of 404 (2026-10-24).
        if (tree === null) return { ok: false, status: 404, body: { error: 'not_found' } };
        // Proof: removing this branch made 'rechecks membership after initial organization resolution' answer 500 instead of 403 (2026-10-24).
        if ('kind' in tree && tree.kind === 'access_refused')
          return organizationRefusal(tree.refusal);
        // Proof: removing this branch made 'preserves an unavailable schedule refusal before provider reads' answer 500 instead of 409 (2026-10-24).
        if ('kind' in tree)
          return { ok: false, status: 409, body: { error: tree.error, engine: tree.engine } };
        // Proof: accepting the first work item made 'answers foreign, missing and misassociated resources alike without provider reads' answer 200 instead of 404 (2026-10-24).
        const workItem = tree.workItems.find((candidate) => candidate.id === params.workItemId);
        // Proof: accepting the first ref made 'answers foreign, missing and misassociated resources alike without provider reads' answer 200 instead of 404 (2026-10-24).
        const reference = workItem?.externalRefs.find((candidate) => candidate.id === params.refId);
        // Proof: removing this refusal made 'answers foreign, missing and misassociated resources alike without provider reads' answer 500 instead of 404 (2026-10-24).
        if (reference === undefined)
          return { ok: false, status: 404, body: { error: 'not_found' } };
        const admission = await delivery.read(
          resolved.access.kind === 'scoped'
            ? { organizationId: resolved.access.scope.organizationId }
            : 'legacy',
          reference.url,
          // Proof: passing a fresh signal made 'cancels the provider read when the request aborts' see the provider signal still open (2026-10-24).
          request.signal,
        );
        switch (admission.kind) {
          case 'rate-limited':
            return {
              ok: false,
              status: 429,
              body: {
                error: 'delivery_rate_limited',
                retryAfterSeconds: admission.retryAfterSeconds,
              },
              headers: [['retry-after', String(admission.retryAfterSeconds)]],
            };
          case 'busy':
            return { ok: false, status: 503, body: { error: 'delivery_busy' } };
          case 'served':
            return {
              ok: true,
              status: 200,
              body: {
                // Proof: answering the unvalidated reading made 'rejects semantically impossible reader output at the response boundary' answer 200 instead of 500 (2026-10-24).
                reading: validateDeliveryReading(admission.reading),
                servedAt: new Date(admission.servedAt).toISOString(),
              },
            };
        }
      },
    ),
  ] as const;
}
