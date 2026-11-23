import { AccessState } from './access-state';
import { CredentialRefusalState } from './credential-refusal-state';
import { type AccessLoss, lossCopy } from './organization-access';

/** A scoped page withdraws all its content when the owning organization or credential is lost. */
export function OrganizationAccessLoss({ loss }: { loss: AccessLoss }): React.JSX.Element {
  if (typeof loss !== 'string') return <CredentialRefusalState refusal={loss} />;
  const copy = lossCopy(loss);
  return (
    <AccessState
      headline={copy.headline}
      detail={copy.detail}
      action={
        <a href="/" className="text-primary underline">
          Back to plan
        </a>
      }
    />
  );
}
