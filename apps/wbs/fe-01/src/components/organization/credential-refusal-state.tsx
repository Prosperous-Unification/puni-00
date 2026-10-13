import { buttonVariants } from '@/components/ui/button';
import { unreachable } from '@/lib/http';
import { cn } from '@/lib/utils';

import { CompanySignInLink } from './company-sign-in-link';
import { type CredentialRefusal } from './organization-access';

/** The one route a refusal's `login` may name: be-01's browser sign-in start. */
const SIGN_IN_START = '/api/auth/login?';

/**
 * The refusal's own sign-in path, unchanged. The page never builds one from
 * an organization slug or id: be-01 chose the connection and prompt.
 *
 * @throws when `login` is not a relative `/api/auth/login?…` path, since a
 *   trusted refusal naming any other target is malformed.
 */
export function signInPath(login: string): string {
  // Proof: 2026-10-12, disabling this check made `refuses a sign-in path that
  // leaves be-01’s login start` render the link instead of the fault boundary.
  if (!login.startsWith(SIGN_IN_START))
    throw new Error(`Unexpected sign-in path in an organization refusal: ${login}`);
  return login;
}

/**
 * The state a page shows in place of an organization it can no longer read
 * because the organization's rules refuse this sign-in: its company sign-in
 * (enforced SSO) or a fresh sign-in (session policy). SSO also offers an
 * explicit company identity link; sign-in uses the refusal's own login path.
 *
 * @throws for a refusal code or reason this page does not know, so the fault
 *   boundary answers instead of an empty state.
 */
export function CredentialRefusalState({
  refusal,
}: {
  refusal: CredentialRefusal;
}): React.JSX.Element {
  const copy = refusalCopy(refusal);
  const login = signInPath(refusal.login);
  // Proof: 2026-10-13, using refusal.organizationId here failed `links the
  // company slug selected by the server instead of its organization id`.
  const organization = refusal.error === 'sso_required' ? companyLoginSlug(login) : null;
  return (
    <section
      role="alert"
      className="border-border bg-card text-card-foreground flex max-w-xl flex-col items-start gap-3 rounded-lg border p-6 shadow-sm"
    >
      <p className="font-semibold">{copy.headline}</p>
      <p className="text-muted-foreground text-sm">{copy.detail}</p>
      {/*
       * Proof: 2026-10-12, building this href from `refusal.organizationId`
       * failed `links the company sign-in to the exact path the refusal names`
       * with `/api/auth/login?organization=org_7f3a`. `cn` lets the variant's
       * `bg-primary` replace the base's `bg-transparent`, as `<Button>` does.
       */}
      <a className={cn(buttonVariants(), 'no-underline')} href={login}>
        {copy.action}
      </a>
      {organization !== null && <CompanySignInLink organization={organization} />}
    </section>
  );
}

/** The headline sentence alone, for a place that has room for one line. */
export function credentialRefusalHeadline(refusal: CredentialRefusal): string {
  return refusalCopy(refusal).headline;
}

interface RefusalCopy {
  headline: string;
  detail: string;
  action: string;
}

// Proof: 2026-10-12, answering empty copy instead of `unreachable` for an
// unknown code made `throws for an unknown credential refusal` miss the fault
// boundary; the same fault in `reauthenticationCopy` failed `throws for an
// unknown reauthentication reason`.
function refusalCopy(refusal: CredentialRefusal): RefusalCopy {
  switch (refusal.error) {
    case 'sso_required':
      return {
        headline: 'This organization requires its company sign-in.',
        detail: 'Link your company sign-in, then sign in via SSO.',
        action: 'Sign in with your company',
      };
    case 'reauthentication_required':
      return reauthenticationCopy(refusal.reason);
    default:
      return unreachable(refusal);
  }
}

function reauthenticationCopy(
  reason: Extract<CredentialRefusal, { error: 'reauthentication_required' }>['reason'],
): RefusalCopy {
  switch (reason) {
    case 'max_session':
      return {
        headline: 'Your session for this organization is too old.',
        detail: 'This organization limits how long one sign-in lasts. Sign in again to continue.',
        action: 'Sign in again',
      };
    case 'reauthenticate_after':
      return {
        headline: 'This organization asks you to sign in again.',
        detail: 'It needs a fresh sign-in after a set time. Sign in again to continue.',
        action: 'Sign in again',
      };
    default:
      return unreachable(reason);
  }
}

/**
 * Extracts the enterprise slug from be-01's selected sign-in path.
 * @throws when the trusted SSO refusal has no single valid company routing hint.
 */
function companyLoginSlug(login: string): string {
  const query = new URLSearchParams(login.slice(SIGN_IN_START.length));
  const organization = query.get('organization');
  // Proof: 2026-10-13, removing this condition failed all six production
  // `refuses a malformed company login path` cases: missing, empty, malformed,
  // duplicate and conflicting company hints reached the form.
  if (
    organization === null ||
    !/^[a-z0-9-]{3,63}$/.test(organization) ||
    query.getAll('organization').length !== 1 ||
    query.has('email') ||
    query.has('method') ||
    query.has('reauthenticate')
  )
    throw new Error('Unexpected company sign-in query in an organization refusal');
  return organization;
}
