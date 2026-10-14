import { type Client, type EndpointShape } from '@wbs/contracts';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

import { browserClient } from '@/lib/http';
import type { ResourceScope } from '@/lib/organization-context';

const OrganizationResources = createContext<ResourceScope | null>(null);

/** Resource panels receive the same immutable context as the runtime which owns them. */
export function OrganizationResourcesProvider({
  scope,
  children,
}: {
  scope: ResourceScope;
  children: ReactNode;
}): ReactNode {
  return <OrganizationResources.Provider value={scope}>{children}</OrganizationResources.Provider>;
}

/** Missing runtime wiring is a fault, never a request without an organization expectation. */
export function useResourceScope(): ResourceScope {
  const scope = useContext(OrganizationResources);
  // Proof: a legacy fallback failed `refuses resource panels without an owning runtime provider` (c2-fault-provider).
  if (scope === null) throw new Error('Organization resources require their runtime provider');
  return scope;
}

/** Binds a panel's exact shape table to its immutable runtime context and withdrawal callback. */
export function useResourceClient<const Shapes extends readonly EndpointShape[]>(
  shapes: Shapes,
): Client<Shapes> {
  const scope = useResourceScope();
  return useMemo(() => browserClient(shapes, scope), [shapes, scope]);
}
