import {
  type ClientReply,
  createSsoConnection,
  listOrganizationDomains,
  listSsoConnections,
} from '@wbs/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient } from '@/runtime/organization-resources';

import { CompanySignInLink } from './company-sign-in-link';
import {
  type AccessLoss,
  lostAccess,
  READ_ONLY,
  type RefusalOutcome,
  RELOAD,
  said,
} from './organization-access';
import {
  ALERT_CLASS,
  CONTROL_HEIGHT,
  FIELD_CLASS,
  FIELD_LABEL_CLASS,
  LIST_CLASS,
  OrganizationSection,
  SELECT_CLASS,
  STATUS_CLASS,
} from './organization-section';

const SSO_SHAPES = [listSsoConnections, listOrganizationDomains, createSsoConnection] as const;
type Connection = Extract<
  ClientReply<typeof listSsoConnections>,
  { kind: 'success' }
>['body']['connections'][number];
type Claim = Extract<
  ClientReply<typeof listOrganizationDomains>,
  { kind: 'success' }
>['body']['domains'][number];
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; connections: readonly Connection[]; claims: readonly Claim[] };

/**
 * Records enterprise connections and starts their routed proof links. The
 * server decides super-admin authority. A single proof form owns the browser's
 * single link-binding cookie; its target cannot change during a link start.
 * Proof and enforcement labels come only from refreshed server records.
 */
export function SsoConnectionsPanel({
  onAccessLost,
}: {
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element {
  // Proof: an unscoped client failed the captured-header, runtime-refusal and
  // late-row SSO tests; reads and create now share the owning runtime's scope.
  const settings = useResourceClient(SSO_SHAPES);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [domainClaimId, setDomainClaimId] = useState('');
  const [auth0Connection, setAuth0Connection] = useState('');
  const [strategy, setStrategy] = useState<'samlp' | 'oidc'>('samlp');
  const [loginSlug, setLoginSlug] = useState('');
  const [proof, setProof] = useState<Connection | null>(null);
  const proofPending = useRef(false);
  const pending = useRef(false);
  const [sending, setSending] = useState(false);
  const [proving, setProving] = useState(false);
  const [message, setMessage] = useState('');
  const [fault, setFault] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setView({ kind: 'loading' });
    setProof(null);
    const [connections, domains] = await Promise.all([
      settings['getApiOrganizationSso-connections']({}),
      settings.getApiOrganizationDomains({}),
    ]);
    // Read both replies before rendering rows: either route can revoke access.
    // Proof: 2026-10-13, omitting onAccessLost failed all five
    // `hands read authority loss` production cases.
    for (const reply of [connections, domains]) {
      if (reply.kind === 'refusal') {
        const outcome = setupRefusal(reply.body);
        if (outcome.kind === 'lost') {
          onAccessLost(outcome.loss);
          return;
        }
      }
    }
    for (const reply of [connections, domains]) {
      // Proof: 2026-10-13, treating the failed read as ready failed
      // `clears controls on query failure and recovers with explicit refresh`.
      if (reply.kind === 'failure') {
        setView({ kind: 'failure', message: failureMessage(reply.failure) });
        return;
      }
      if (reply.kind === 'refusal') {
        const outcome = setupRefusal(reply.body);
        // Proof: 2026-10-13, treating the forbidden read as ready failed both
        // `offers no create or proof controls after a forbidden` cases.
        if (outcome.kind === 'message') setView({ kind: 'failure', message: outcome.text });
        return;
      }
    }
    if (connections.kind !== 'success' || domains.kind !== 'success')
      throw new Error('Unexpected company sign-in read state');
    setView({
      kind: 'ready',
      connections: connections.body.connections,
      claims: domains.body.domains,
    });
    setDomainClaimId('');
  }, [settings, onAccessLost]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      setFault(new Error('Unexpected company sign-in read failure', { cause }));
    });
  }, [refresh]);
  if (fault !== null) throw fault;

  // Proof: 2026-10-13, removing the verified predicate failed `offers only
  // verified domains`; separately removing the unused predicate failed
  // `excludes domains already used by a connection`.
  const eligible =
    view.kind === 'ready'
      ? view.claims.filter(
          (claim) =>
            claim.status === 'verified' &&
            !view.connections.some((connection) => connection.domainClaimId === claim.id),
        )
      : [];

  async function create(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    // Proof: 2026-10-13, removing pending admission failed `blocks repeated
    // submissions while create is held` with two production requests. Removing
    // proof admission also failed the held-proof test with an extra create request.
    if (pending.current || proofPending.current) return;
    // Proof: 2026-10-13, removing eligibility admission failed `refuses a
    // forged unused-domain selection before posting` with a production POST.
    if (!eligible.some((claim) => claim.id === domainClaimId)) {
      setMessage('Choose a verified domain that has no company sign-in connection.');
      return;
    }
    pending.current = true;
    setSending(true);
    setMessage('');
    try {
      const reply = await settings['postApiOrganizationSso-connections']({
        body: {
          // Proof: 2026-10-13, replacing this id with wrong-id failed
          // `creates with the claim id and exact fields, then refreshes both lists`.
          domainClaimId,
          auth0Connection: auth0Connection.trim(),
          strategy,
          loginSlug: loginSlug.trim(),
        },
      });
      switch (reply.kind) {
        case 'success':
          setMessage('Connection recorded. Start a proof sign-in to verify its identity prefix.');
          setAuth0Connection('');
          setLoginSlug('');
          // Proof: 2026-10-13, removing this refresh failed the create test: the recorded row never appeared.
          await refresh();
          return;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          return;
        case 'refusal': {
          const outcome = setupRefusal(reply.body);
          if (outcome.kind === 'lost') {
            onAccessLost(outcome.loss);
            return;
          }
          setMessage(outcome.text);
          // Proof: 2026-10-13, removing this branch failed `removes controls when create loses super-admin authority`.
          if (reply.body.error === 'forbidden' || reply.body.error === 'insufficient_scope') {
            setProof(null);
            setView({ kind: 'failure', message: outcome.text });
            return;
          }
          await refresh();
          return;
        }
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      setFault(new Error('Unexpected company sign-in creation failure', { cause }));
    } finally {
      pending.current = false;
      setSending(false);
    }
  }

  return (
    <OrganizationSection id="sso-heading" title="Company sign-in">
      <Button
        type="button"
        variant="outline"
        className={`self-start ${CONTROL_HEIGHT}`}
        disabled={sending || proving || view.kind === 'loading'}
        onClick={() => {
          if (pending.current || proofPending.current) return;
          void refresh().catch((cause: unknown) => {
            setFault(new Error('Unexpected company sign-in refresh failure', { cause }));
          });
        }}
      >
        Refresh company sign-in
      </Button>
      {view.kind === 'loading' && <p className={STATUS_CLASS}>Loading company sign-in…</p>}
      {view.kind === 'failure' && (
        <p role="alert" className={ALERT_CLASS}>
          {view.message}
        </p>
      )}
      {view.kind === 'ready' && (
        <>
          <p className="text-sm">
            Record the enterprise connection configured in Auth0, then use a proof sign-in to check
            its identity prefix.
          </p>
          {eligible.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Verify an unused domain in Domains, then refresh here.
            </p>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={(event) => void create(event)}>
              <span className={FIELD_CLASS}>
                <label htmlFor="sso-domain" className={FIELD_LABEL_CLASS}>
                  Verified domain
                </label>
                <select
                  id="sso-domain"
                  className={SELECT_CLASS}
                  value={domainClaimId}
                  disabled={sending || proving}
                  required
                  onChange={(event) => {
                    setDomainClaimId(event.target.value);
                  }}
                >
                  <option value="">Choose a verified domain</option>
                  {eligible.map((claim) => (
                    <option key={claim.id} value={claim.id}>
                      {claim.domain}
                    </option>
                  ))}
                </select>
              </span>
              <span className={FIELD_CLASS}>
                <label htmlFor="sso-connection" className={FIELD_LABEL_CLASS}>
                  Auth0 connection name
                </label>
                <Input
                  id="sso-connection"
                  className={CONTROL_HEIGHT}
                  value={auth0Connection}
                  disabled={sending || proving}
                  required
                  maxLength={128}
                  pattern="[A-Za-z0-9-]{1,128}"
                  onChange={(event) => {
                    setAuth0Connection(event.target.value);
                  }}
                />
              </span>
              <span className={FIELD_CLASS}>
                <label htmlFor="sso-strategy" className={FIELD_LABEL_CLASS}>
                  Strategy
                </label>
                <select
                  id="sso-strategy"
                  className={SELECT_CLASS}
                  value={strategy}
                  disabled={sending || proving}
                  onChange={(event) => {
                    const next = event.target.value;
                    // Proof: 2026-10-13, removing this check failed
                    // `throws on an impossible strategy selection`.
                    if (next !== 'samlp' && next !== 'oidc')
                      throw new Error('Unexpected enterprise strategy');
                    setStrategy(next);
                  }}
                >
                  <option value="samlp">SAML (samlp)</option>
                  <option value="oidc">OpenID Connect (oidc)</option>
                </select>
              </span>
              <span className={FIELD_CLASS}>
                <label htmlFor="sso-slug" className={FIELD_LABEL_CLASS}>
                  Login slug
                </label>
                <Input
                  id="sso-slug"
                  className={CONTROL_HEIGHT}
                  value={loginSlug}
                  disabled={sending || proving}
                  required
                  minLength={3}
                  maxLength={63}
                  pattern="[a-z0-9-]{3,63}"
                  onChange={(event) => {
                    setLoginSlug(event.target.value);
                  }}
                />
              </span>
              <Button
                type="submit"
                className={`self-start ${CONTROL_HEIGHT}`}
                disabled={sending || proving}
              >
                Create connection
              </Button>
            </form>
          )}
          {view.connections.length === 0 ? (
            <p className="text-muted-foreground text-sm">No company sign-in connections yet.</p>
          ) : (
            <ul className={`${LIST_CLASS} border-border divide-border divide-y border-t`}>
              {view.connections.map((connection) => (
                <li
                  key={connection.id}
                  className="flex min-w-0 flex-col gap-2 py-3 [overflow-wrap:anywhere]"
                >
                  <span className="font-medium">{connection.domain}</span>
                  <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                    <dt>Auth0 connection</dt>
                    <dd className="m-0">{connection.auth0Connection}</dd>
                    <dt>Strategy</dt>
                    <dd className="m-0">{connection.strategy}</dd>
                    <dt>Login slug</dt>
                    <dd className="m-0">{connection.loginSlug}</dd>
                  </dl>
                  <p className="m-0 text-sm">
                    {connection.provenAt === null
                      ? 'Not proven'
                      : `Proven: ${new Date(connection.provenAt).toLocaleString()}`}
                    . {connection.enforced ? 'Enforced' : 'Not enforced'}.
                  </p>
                  {connection.lastPrefixMismatchAt !== null && (
                    <p className={ALERT_CLASS}>
                      Last prefix mismatch:{' '}
                      {new Date(connection.lastPrefixMismatchAt).toLocaleString()}. The returned
                      identity did not match this connection.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className={`self-start ${CONTROL_HEIGHT}`}
                    disabled={sending || proving}
                    aria-label={`Start proof for ${connection.domain}`}
                    onClick={() => {
                      if (pending.current || proofPending.current) return;
                      setProof(connection);
                    }}
                  >
                    Start proof sign-in
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {/* Proof: 2026-10-13, duplicating the proof form failed `uses server proof and enforcement labels and each row slug for proof`. */}
          {proof !== null && (
            <div
              role="group"
              aria-label={`Prove ${proof.domain}`}
              className="bg-muted flex flex-col gap-3 rounded-md p-3 text-sm"
            >
              <p className="m-0">
                Prove {proof.domain} through {proof.auth0Connection}. This links your company
                identity; sign in via SSO afterward to use it. Refresh after returning to read the
                proof status.
              </p>
              <CompanySignInLink
                key={proof.id}
                // Proof: 2026-10-13, using proof.id failed `uses server proof and enforcement labels and each row slug for proof`.
                organization={proof.loginSlug}
                // Proof: 2026-10-13, omitting this prop failed `blocks the
                // selected proof form while a create request is held`.
                disabled={sending}
                onPendingChange={(active) => {
                  proofPending.current = active;
                  // Proof: 2026-10-13, forcing this false failed `freezes the
                  // only proof target while its start request is held`.
                  setProving(active);
                }}
              />
            </div>
          )}
        </>
      )}
      {message !== '' && (
        <p role="status" className={STATUS_CLASS}>
          {message}
        </p>
      )}
    </OrganizationSection>
  );
}

type SetupRefusal = Extract<
  ClientReply<
    typeof listSsoConnections | typeof createSsoConnection | typeof listOrganizationDomains
  >,
  { kind: 'refusal' }
>['body'];
/** Maps every modeled setup refusal without inferring authority from member rows. */
function setupRefusal(refusal: SetupRefusal): RefusalOutcome {
  switch (refusal.error) {
    // Proof: omitting this C1 refusal failed the mounted panel's read and create 409 authority-loss cases with `Unexpected response variant: object` (2026-10-13).
    case 'unauthenticated':
    case 'organization_context_changed':
    case 'no_active_organization':
    case 'not_a_member':
      return lostAccess(refusal.error);
    case 'sso_required':
    case 'reauthentication_required':
      return lostAccess(refusal);
    case 'forbidden':
      return said('Only a super-admin can set up company sign-in.');
    case 'domain_not_verified':
      return said('That domain is no longer verified. Verify it before creating a connection.');
    case 'sso_connection_exists':
      return said('That domain already has a company sign-in connection.');
    case 'login_slug_taken':
      return said('That login slug is already in use. Choose another.');
    case 'not_found':
      return said('That domain claim no longer exists.');
    case 'insufficient_scope':
      return said(READ_ONLY);
    case 'invalid_query':
    case 'invalid_body':
    case 'invalid_json':
    case 'invalid_params':
    case 'invalid_origin':
      return said(RELOAD);
    default:
      return unreachable(refusal);
  }
}
