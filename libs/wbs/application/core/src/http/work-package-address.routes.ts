import {
  discoverAddressCandidates,
  discoverAddressWorkPackages,
  resolveAddressReference,
} from '@wbs/contracts';

import { hasRepeatedKey } from '../service/list-query';
import {
  addressPageQueryOf,
  type WorkPackageAddressSearch,
} from '../service/work-package-address-search';
import { bind, type HttpReply } from './endpoint';
import { organizationRefusal } from './organization-refusal';
const invalid = { ok: false, status: 400, body: { error: 'invalid_query' } } as const;
/** Read-only search shares wire declarations with typed HTTP and generated MCP operations. */
export function workPackageAddressRoutes(search: WorkPackageAddressSearch) {
  return [
    bind(
      discoverAddressWorkPackages,
      async ({
        principal,
        query,
        request,
      }): Promise<HttpReply<typeof discoverAddressWorkPackages>> => {
        const parsed = addressPageQueryOf(query, request.url);
        if (parsed === null) return invalid;
        const observed = await search.discoverWorkPackages(principal, parsed);
        if (!observed.ok) return organizationRefusal(observed);
        if (observed.value.kind === 'invalid_query') return invalid;
        const { workPackages, nextCursor } = observed.value;
        return { ok: true, status: 200, body: { workPackages, nextCursor } };
      },
      { classifyRequestFailure: () => invalid },
    ),
    bind(
      discoverAddressCandidates,
      async ({
        principal,
        params,
        query,
        request,
      }): Promise<HttpReply<typeof discoverAddressCandidates>> => {
        const parsed = addressPageQueryOf(query, request.url);
        if (parsed === null) return invalid;
        const observed = await search.discoverCandidates(principal, params.id, parsed);
        if (!observed.ok) return organizationRefusal(observed);
        const outcome = observed.value;
        if (outcome.kind === 'invalid_query') return invalid;
        if (outcome.kind === 'not_found')
          return { ok: false, status: 404, body: { error: 'not_found' } };
        if (outcome.kind === 'stale')
          return {
            ok: false,
            status: 409,
            body: { error: 'stale_address_revision', addressRevision: outcome.addressRevision },
          };
        const { workPackage, addressRevision, candidates, nextCursor } = outcome;
        return {
          ok: true,
          status: 200,
          body: { workPackage, addressRevision, candidates, nextCursor },
        };
      },
      { classifyRequestFailure: () => invalid },
    ),
    bind(
      resolveAddressReference,
      async ({
        principal,
        params,
        query,
        request,
      }): Promise<HttpReply<typeof resolveAddressReference>> => {
        if (hasRepeatedKey(request.url)) return invalid;
        const observed = await search.resolveReference(
          principal,
          params.id,
          query.reference,
          query.revision,
        );
        if (!observed.ok) return organizationRefusal(observed);
        const outcome = observed.value;
        if (outcome.kind === 'not_found')
          return { ok: false, status: 404, body: { error: 'not_found' } };
        if (outcome.kind === 'stale')
          return {
            ok: false,
            status: 409,
            body: { error: 'stale_address_revision', addressRevision: outcome.addressRevision },
          };
        if (outcome.kind === 'unresolvable')
          return {
            ok: false,
            status: 422,
            body: { error: 'unresolvable_reference', reason: outcome.reason },
          };
        const { kind, ...body } = outcome;
        return { ok: true, status: 200, body };
      },
      { classifyRequestFailure: () => invalid },
    ),
  ] as const;
}
