import { useResourceScope } from '@/runtime/organization-resources';

import type { AccessLoss } from './organization-access';
import { OrganizationSection } from './organization-section';
import { ScopedSteps } from './scoped-steps';

/** Active organization settings own their scope; an inactive runtime supplies no invented id. */
export function StepsPanel({
  onAccessLost,
}: {
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element {
  const { organization } = useResourceScope();
  return organization.kind === 'active' ? (
    <ScopedSteps
      scope={{
        scopeKind: 'organization',
        scopeId: organization.organizationId,
        name: 'Organization',
      }}
      onChanged={() => undefined}
      onAccessLost={onAccessLost}
    />
  ) : (
    <OrganizationSection id="steps-heading" title="Steps">
      <p>Choose an organization to manage steps.</p>
    </OrganizationSection>
  );
}
