import {
  type Client,
  type ClientFailure,
  clientFromShapes,
  DEPENDENCY_SEMANTICS,
  type EndpointShape,
  fetchTransport,
  type TransportInput,
} from '@wbs/contracts';

import type { OrganizationRefusal, ResourceScope } from './organization-context';

/**
 * Shape-derived browser calls use the serving origin and its cookies. Fetch is
 * resolved per invocation, and no request sharing or invalidation lives here.
 */
export function browserClient<const Shapes extends readonly EndpointShape[]>(
  shapes: Shapes,
  scope?: ResourceScope,
): Client<Shapes> {
  // Proof: consulting the mutable context per request failed `old clients retain their expected organization` (c2-fault-header).
  const expected = scope?.organization.kind === 'active' ? scope.organization.organizationId : null;
  const client = clientFromShapes(shapes, (shape, input) => {
    if (scope !== undefined && !scope.isCurrent())
      throw new Error('organization runtime withdrawn');
    const headers = new Headers(input.headers);
    const resource = shape.policies.some((policy) => policy.kind === 'organization-resource');
    if (resource && expected !== null) headers.set('X-WBS-Expected-Organization', expected);
    return fetchTransport(
      location.origin,
      (url, init) => {
        const address = new URL(url);
        return fetch(`${address.pathname}${address.search}`, init);
      },
      // Proof: omitting browser opt-in failed the protected/auth fetch header test in organization-context.model.test.ts.
      DEPENDENCY_SEMANTICS,
    )(shape, { ...input, headers });
  });
  if (scope === undefined) return client;
  // Each entry comes from clientFromShapes' exact shape binding and retains that
  // operation's validator; erasure only allows the same wrapper around each method.
  const methods = client as unknown as Record<
    string,
    (
      input: Partial<TransportInput>,
    ) => Promise<
      { kind: 'success' | 'refusal'; body: unknown } | { kind: 'failure'; failure: ClientFailure }
    >
  >;
  const wrapped = Object.fromEntries(
    Object.entries(methods).map(([operation, invoke]) => [
      operation,
      async (input: Partial<TransportInput>) => {
        if (!scope.isCurrent()) return { kind: 'failure', failure: { code: 'cancelled' } } as const;
        const reply = await invoke(input);
        // Proof: removing currentness fences failed `late organization responses cannot publish` (c2-fault-late).
        if (!scope.isCurrent()) return { kind: 'failure', failure: { code: 'cancelled' } } as const;
        if (reply.kind === 'refusal') {
          const body = reply.body;
          if (typeof body === 'object' && body !== null && 'error' in body) {
            // Legacy mode has no selected organization to withdraw; the page owns these refusals.
            // Proof: without this guard both `legacy organization panels retain page-level … recovery`
            // cases failed on an unexpected withdrawal call; page-states.spec.ts lost Open the plan.
            if (
              scope.organization.kind === 'legacy' &&
              (body.error === 'no_active_organization' || body.error === 'not_a_member')
            )
              return reply;
            switch (body.error) {
              case 'organization_context_changed':
              case 'no_active_organization':
              case 'not_a_member':
              case 'unauthenticated':
              case 'sso_required':
              case 'reauthentication_required':
                // The shared client validated this exact refusal shape; recognized
                // organization errors retain their complete validated credential body.
                // Proof: dropping withdrawal failed `membership loss clears the whole organization runtime without retry` and `context refusal sends exactly one mutation` (c2-fault-refusal).
                scope.refuse(body as OrganizationRefusal);
            }
          }
        }
        return reply;
      },
    ]),
  );
  // Wrappers preserve every exact operation/input/reply correlation established
  // by clientFromShapes; only the common cancelled variant can replace a reply.
  return wrapped as unknown as Client<Shapes>;
}

/** Unknown discriminants indicate a programming error rather than a modeled refusal. */
export function unreachable(value: never): never {
  throw new Error(`Unexpected response variant: ${typeof value}`);
}

/** Boundary failures remain distinct from validated application refusal messages. */
export function failureMessage(failure: ClientFailure): string {
  switch (failure.code) {
    case 'dependency_incompatible':
      return 'This client cannot open plans with dependencies between projects. Reload with a compatible client.';
    case 'cancelled':
      return '';
    case 'transport':
      return 'Could not reach the server. Try again.';
    case 'invalid_request':
      return 'The request could not be sent. Reload and try again.';
    case 'invalid_response':
    case 'unexpected_status':
      // Proof: removing this distinction showed the generic response error instead
      // of the site-gateway message in the actual AuthForm edge-challenge test.
      if (failure.status === 401 && failure.headers.has('www-authenticate'))
        return 'The site gateway rejected the request. Check your site access and try again.';
      return 'The server returned an unexpected response. Try again.';
    default:
      return unreachable(failure);
  }
}
