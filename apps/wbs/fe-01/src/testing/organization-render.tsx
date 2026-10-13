import {
  render as renderWithoutOrganization,
  renderHook as renderHookWithoutOrganization,
  type RenderOptions,
  type RenderResult,
} from '@testing-library/react';
import type { ReactNode } from 'react';

import { LEGACY_ORGANIZATION, type ResourceScope } from '@/lib/organization-context';
import { OrganizationResourcesProvider } from '@/runtime/organization-resources';

export * from '@testing-library/react';

const legacy: ResourceScope = {
  organization: LEGACY_ORGANIZATION,
  isCurrent: () => true,
  refuse: () => undefined,
};

/** Existing panel fixtures explicitly exercise the legacy deployment; scoped fixtures nest their own provider. */
function LegacyResources({ children }: { children: ReactNode }) {
  return <OrganizationResourcesProvider scope={legacy}>{children}</OrganizationResourcesProvider>;
}

export const render = (ui: ReactNode, options?: RenderOptions): RenderResult =>
  renderWithoutOrganization(ui, { wrapper: LegacyResources, ...options });
export const renderHook: typeof renderHookWithoutOrganization = (hook, options) =>
  renderHookWithoutOrganization(hook, { wrapper: LegacyResources, ...options });
