import { Button, Input } from '@ui/saas-01';
import {
  type ClientReply,
  createSsoConnection,
  listOrganizationDomains,
  listSsoConnections,
  removeSsoConnection,
  updateSsoConnection,
} from '@wbs/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

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

const SSO_SHAPES = [
  listSsoConnections,
  listOrganizationDomains,
  createSsoConnection,
  updateSsoConnection,
  removeSsoConnection,
] as const;
type Connection = Extract<
  ClientReply<typeof listSsoConnections>,
  { kind: 'success' }
>['body']['connections'][number];
type Claim = Extract<
  ClientReply<typeof listOrganizationDomains>,
  { kind: 'success' }
>['body']['domains'][number];
type Action =
  | {
      kind: 'edit';
      connection: Connection;
      auth0Connection: string;
      strategy: 'samlp' | 'oidc';
      loginSlug: string;
    }
  | { kind: 'remove'; connection: Connection };
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; connections: readonly Connection[]; claims: readonly Claim[] };

/**
 * Records, edits and removes enterprise connections and starts their routed proof links. The
 * server decides super-admin authority. A single proof form owns the browser's
 * single link-binding cookie; its target cannot change during a link start.
 * Proof and enforcement labels come only from server records.
 */
export function SsoConnectionsPanel({
  onAccessLost,
}: {
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element {
  // Proof: an unscoped client failed the captured-header, runtime-refusal and
  // late-row SSO tests; reads and create now share the owning runtime's scope.
  // Proof: replacing this with a stable global client failed the enforcement
  // selected-row test: PATCH lost X-WBS-Expected-Organization (2026-10-13).
  // Proof: 2026-10-14, an unscoped editor PATCH failed its captured-header
  // assertion; removing the client's response fence published a withdrawn
  // runtime's edit and removal success in the mounted ownership cases.
  const settings = useResourceClient(SSO_SHAPES);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [domainClaimId, setDomainClaimId] = useState('');
  const [auth0Connection, setAuth0Connection] = useState('');
  const [strategy, setStrategy] = useState<'samlp' | 'oidc'>('samlp');
  const [loginSlug, setLoginSlug] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const selectedAction = useRef<Action | null>(null);
  const [proof, setProof] = useState<Connection | null>(null);
  const proofPending = useRef(false);
  const pending = useRef(false);
  const [sending, setSending] = useState(false);
  const [proving, setProving] = useState(false);
  const [message, setMessage] = useState('');
  const [lockout, setLockout] = useState<{ slug: string; domain: string } | null>(null);
  const [fault, setFault] = useState<Error | null>(null);
  const readPending = useRef(false);
  const readGeneration = useRef(0);
  const lifetimeGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const read = ++readGeneration.current;
    const lifetime = lifetimeGeneration.current;
    readPending.current = true;
    setView({ kind: 'loading' });
    setProof(null);
    const [connections, domains] = await Promise.all([
      settings['getApiOrganizationSso-connections']({}),
      settings.getApiOrganizationDomains({}),
    ]);
    // Proof: a held first StrictMode GET overwrote a successful PATCH until
    // cleanup and mutation admission invalidated its panel-local read generation.
    if (read !== readGeneration.current || lifetime !== lifetimeGeneration.current) return;
    readPending.current = false;
    // Clear only accepted reads: synchronous read admission must protect an
    // already-selected action until this response has passed the fences.
    // Proof: 2026-10-14, removing read admission sent a same-render edit PATCH.
    selectedAction.current = null;
    setAction(null);
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
    const lifetime = ++lifetimeGeneration.current;
    const reads = readGeneration;
    const mountedLifetime = lifetimeGeneration;
    void refresh().catch((cause: unknown) => {
      if (lifetime === lifetimeGeneration.current)
        setFault(new Error('Unexpected company sign-in read failure', { cause }));
    });
    return () => {
      // Proof: removing cleanup invalidation made a held GET refusal call
      // onAccessLost after unmount (2026-10-13).
      ++reads.current;
      ++mountedLifetime.current;
    };
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
    if (pending.current || proofPending.current || readPending.current) return;
    // Proof: 2026-10-13, removing eligibility admission failed `refuses a
    // forged unused-domain selection before posting` with a production POST.
    if (!eligible.some((claim) => claim.id === domainClaimId)) {
      setMessage('Choose a verified domain that has no company sign-in connection.');
      return;
    }
    pending.current = true;
    ++readGeneration.current;
    const lifetime = lifetimeGeneration.current;
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
      if (lifetime !== lifetimeGeneration.current) return;
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
      if (lifetime === lifetimeGeneration.current)
        setFault(new Error('Unexpected company sign-in creation failure', { cause }));
    } finally {
      pending.current = false;
      if (lifetime === lifetimeGeneration.current) setSending(false);
    }
  }

  async function enforce(connection: Connection) {
    // Proof: removing pending admission and the disabled control made a forced
    // second-row click send another PATCH while the first was held (2026-10-13).
    // Proof: omitting the read admission guard sent a PATCH while a refresh
    // GET was held in the same render (2026-10-13).
    if (pending.current || proofPending.current || readPending.current || view.kind !== 'ready')
      return;
    // Proof: removing the unproven disabled predicate exposed its enable
    // control in the two-row mounted test (2026-10-13).
    if (!connection.enforced && connection.provenAt === null) return;
    pending.current = true;
    // Proof: removing mutation admission's read invalidation let an earlier
    // same-render refresh GET replace a successful PATCH (2026-10-13).
    ++readGeneration.current;
    const lifetime = lifetimeGeneration.current;
    setSending(true);
    setMessage('');
    setLockout(null);
    try {
      const reply = await settings['patchApiOrganizationSso-connectionsById']({
        // Proof: substituting loginSlug failed the exact selected-id test;
        // using the old boolean failed the held-disable body test (2026-10-13).
        params: { id: connection.id },
        body: { enforced: !connection.enforced },
      });
      if (lifetime !== lifetimeGeneration.current) return;
      switch (reply.kind) {
        case 'success':
          // Proof: replacing the server row with the requested boolean failed
          // the authoritative-returned-slug test after PATCH.
          setView((current) =>
            current.kind === 'ready'
              ? {
                  ...current,
                  connections: current.connections.map((row) =>
                    row.id === connection.id ? reply.body.connection : row,
                  ),
                }
              : current,
          );
          setProof((current) => (current?.id === connection.id ? reply.body.connection : current));
          setMessage(
            reply.body.connection.enforced
              ? 'Enforcement enabled. Members must sign in through this company connection to access the organization; they may need to sign in again.'
              : 'Enforcement disabled. Members may need to sign in again.',
          );
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
          setMessage(
            reply.body.error === 'not_found'
              ? 'That company connection no longer exists. The connection list has been refreshed.'
              : outcome.text,
          );
          // Proof: bypassing this branch left enforcement controls available
          // after a forbidden PATCH in the mounted test (2026-10-13).
          if (reply.body.error === 'forbidden' || reply.body.error === 'insufficient_scope') {
            setProof(null);
            setView({ kind: 'failure', message: outcome.text });
            return;
          }
          if (reply.body.error === 'enforcement_would_lock_out_actor') {
            // Proof: substituting connection.id failed the selected-row
            // login-link href test (2026-10-13).
            setLockout({ slug: connection.loginSlug, domain: connection.domain });
          }
          // Reconcile conflicts from the server while retaining the explanation.
          // Proof: skipping this read left a proven row enabled after an
          // unproven refusal in the mounted test (2026-10-13).
          if (reply.status === 409 || reply.body.error === 'not_found') await refresh();
          return;
        }
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      if (lifetime === lifetimeGeneration.current)
        setFault(new Error('Unexpected company sign-in enforcement failure', { cause }));
    } finally {
      pending.current = false;
      if (lifetime === lifetimeGeneration.current) setSending(false);
    }
  }

  function selectAction(next: Action | null) {
    // Proof: 2026-10-14, removing this admission switched to another editor
    // during held edit/removal in `serializes held ...` mounted cases.
    if (pending.current || proofPending.current || readPending.current) return;
    selectedAction.current = next;
    setAction(next);
  }

  async function saveConfiguration(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    // Proof: 2026-10-14, removing pending, proof and read predicates independently
    // sent repeated writes, a write during proof, and a same-render refresh write.
    if (pending.current || proofPending.current || readPending.current || view.kind !== 'ready')
      return;
    const selected = selectedAction.current;
    // Proof: 2026-10-14, bypassing this selection check made a cancelled
    // editor's same-render forced submission fault instead of sending nothing.
    if (selected?.kind !== 'edit') return;
    pending.current = true;
    ++readGeneration.current;
    const lifetime = lifetimeGeneration.current;
    setSending(true);
    setMessage('');
    try {
      const reply = await settings['patchApiOrganizationSso-connectionsById']({
        // Proof: 2026-10-14, substituting the slug failed the selected-id
        // configuration test; the authoritative returned row never appeared.
        params: { id: selected.connection.id },
        body: {
          auth0Connection: selected.auth0Connection.trim(),
          strategy: selected.strategy,
          loginSlug: selected.loginSlug.trim(),
        },
      });
      // Proof: 2026-10-14, removing this fence delivered late edit/removal
      // authority refusals to onAccessLost after unmount.
      if (lifetime !== lifetimeGeneration.current) return;
      switch (reply.kind) {
        case 'success':
          // Proof: 2026-10-14, optimistic slug replacement failed the held
          // configuration test; confirmed route-two disappeared before its reply.
          setView((current) =>
            current.kind === 'ready'
              ? {
                  ...current,
                  connections: current.connections.map((row) =>
                    row.id === selected.connection.id ? reply.body.connection : row,
                  ),
                }
              : current,
          );
          selectedAction.current = null;
          setAction(null);
          setProof(null);
          setLockout(null);
          setMessage('Connection updated. Proof and enforcement reflect the saved configuration.');
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
          setMessage(
            reply.body.error === 'not_found'
              ? 'That company connection no longer exists. The connection list has been refreshed.'
              : outcome.text,
          );
          // Proof: 2026-10-14, bypassing this withdrawal left edit/removal
          // and create controls available in all four authority-refusal cases.
          if (reply.body.error === 'forbidden' || reply.body.error === 'insufficient_scope') {
            selectedAction.current = null;
            setAction(null);
            setProof(null);
            setLockout(null);
            setView({ kind: 'failure', message: outcome.text });
            return;
          }
          if (reply.status === 409 || reply.body.error === 'not_found') await refresh();
          return;
        }
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      if (lifetime === lifetimeGeneration.current)
        setFault(new Error('Unexpected company sign-in configuration failure', { cause }));
    } finally {
      if (lifetime === lifetimeGeneration.current) {
        pending.current = false;
        setSending(false);
      }
    }
  }

  async function removeConnection(connection: Connection) {
    // Proof: 2026-10-14, removing pending, proof and read predicates independently
    // sent repeated writes, a write during proof, and a same-render refresh write.
    if (pending.current || proofPending.current || readPending.current || view.kind !== 'ready')
      return;
    // Proof: 2026-10-14, bypassing confirmation ownership sent a DELETE
    // after same-render Cancel in the explicit confirmation test.
    if (
      selectedAction.current?.kind !== 'remove' ||
      selectedAction.current.connection.id !== connection.id
    )
      return;
    pending.current = true;
    ++readGeneration.current;
    const lifetime = lifetimeGeneration.current;
    setSending(true);
    setMessage('');
    try {
      const reply = await settings['deleteApiOrganizationSso-connectionsById']({
        params: { id: connection.id },
      });
      // Proof: 2026-10-14, removing this fence delivered late edit/removal
      // authority refusals to onAccessLost after unmount.
      if (lifetime !== lifetimeGeneration.current) return;
      switch (reply.kind) {
        case 'success':
          // Proof: 2026-10-14, premature removal failed the held DELETE test:
          // the confirmed row disappeared before a typed 204 arrived.
          setLockout(null);
          setMessage('Connection removed.');
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
          setMessage(
            reply.body.error === 'not_found'
              ? 'That company connection no longer exists. The connection list has been refreshed.'
              : outcome.text,
          );
          // Proof: 2026-10-14, bypassing this withdrawal left edit/removal
          // and create controls available in all four authority-refusal cases.
          if (reply.body.error === 'forbidden' || reply.body.error === 'insufficient_scope') {
            selectedAction.current = null;
            setAction(null);
            setProof(null);
            setLockout(null);
            setView({ kind: 'failure', message: outcome.text });
            return;
          }
          if (reply.status === 409 || reply.body.error === 'not_found') await refresh();
          return;
        }
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      if (lifetime === lifetimeGeneration.current)
        setFault(new Error('Unexpected company sign-in removal failure', { cause }));
    } finally {
      if (lifetime === lifetimeGeneration.current) {
        pending.current = false;
        setSending(false);
      }
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
          if (
            pending.current ||
            proofPending.current ||
            readPending.current ||
            view.kind === 'loading'
          )
            return;
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
                  {connection.provenAt === null && !connection.enforced && (
                    <p className="m-0 text-sm">
                      Complete a proof sign-in before enabling enforcement.
                    </p>
                  )}
                  {connection.provenAt !== null && (
                    <p className="m-0 text-sm">
                      Enforcement requires members to sign in through this company connection to
                      access the organization. Changing it may require them to sign in again.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className={`self-start ${CONTROL_HEIGHT}`}
                    aria-label={`${connection.enforced ? 'Disable' : 'Enable'} enforcement for ${connection.domain}`}
                    disabled={
                      sending || proving || (!connection.enforced && connection.provenAt === null)
                    }
                    onClick={() => void enforce(connection)}
                  >
                    {connection.enforced ? 'Disable enforcement' : 'Enable enforcement'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={`self-start ${CONTROL_HEIGHT}`}
                    aria-label={`Edit connection for ${connection.domain}`}
                    disabled={sending || proving}
                    onClick={() => {
                      selectAction({
                        kind: 'edit',
                        connection,
                        auth0Connection: connection.auth0Connection,
                        strategy: connection.strategy,
                        loginSlug: connection.loginSlug,
                      });
                    }}
                  >
                    Edit connection
                  </Button>
                  {action?.kind === 'edit' && action.connection.id === connection.id && (
                    <form
                      aria-label={`Edit connection for ${connection.domain}`}
                      className="bg-muted flex min-w-0 flex-col gap-3 rounded-md p-3"
                      onSubmit={(event) => void saveConfiguration(event)}
                    >
                      <p className="m-0 text-sm">
                        Domain: <span>{connection.domain}</span>
                      </p>
                      <p className="m-0 text-sm">
                        Changing the Auth0 name or strategy clears proof and enforcement. Changing
                        only the login slug preserves them.
                      </p>
                      <span className={FIELD_CLASS}>
                        <label
                          htmlFor={`sso-edit-name-${connection.id}`}
                          className={FIELD_LABEL_CLASS}
                        >
                          Auth0 connection name
                        </label>
                        <Input
                          id={`sso-edit-name-${connection.id}`}
                          className={CONTROL_HEIGHT}
                          value={action.auth0Connection}
                          required
                          maxLength={128}
                          pattern="[A-Za-z0-9-]{1,128}"
                          disabled={sending || proving}
                          onChange={(event) => {
                            selectAction({ ...action, auth0Connection: event.target.value });
                          }}
                        />
                      </span>
                      <span className={FIELD_CLASS}>
                        <label
                          htmlFor={`sso-edit-strategy-${connection.id}`}
                          className={FIELD_LABEL_CLASS}
                        >
                          Strategy
                        </label>
                        <select
                          id={`sso-edit-strategy-${connection.id}`}
                          className={SELECT_CLASS}
                          value={action.strategy}
                          disabled={sending || proving}
                          onChange={(event) => {
                            const next = event.target.value;
                            // Proof: 2026-10-14, removing this check failed
                            // `throws on an impossible editor strategy selection`.
                            if (next !== 'samlp' && next !== 'oidc')
                              throw new Error('Unexpected enterprise strategy');
                            selectAction({ ...action, strategy: next });
                          }}
                        >
                          <option value="samlp">SAML (samlp)</option>
                          <option value="oidc">OpenID Connect (oidc)</option>
                        </select>
                      </span>
                      <span className={FIELD_CLASS}>
                        <label
                          htmlFor={`sso-edit-slug-${connection.id}`}
                          className={FIELD_LABEL_CLASS}
                        >
                          Login slug
                        </label>
                        <Input
                          id={`sso-edit-slug-${connection.id}`}
                          className={CONTROL_HEIGHT}
                          value={action.loginSlug}
                          required
                          minLength={3}
                          maxLength={63}
                          pattern="[a-z0-9-]{3,63}"
                          disabled={sending || proving}
                          onChange={(event) => {
                            selectAction({ ...action, loginSlug: event.target.value });
                          }}
                        />
                      </span>
                      <Button
                        type="submit"
                        className={`self-start ${CONTROL_HEIGHT}`}
                        disabled={sending || proving}
                        aria-label={`Save connection for ${connection.domain}`}
                      >
                        Save connection
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`self-start ${CONTROL_HEIGHT}`}
                        disabled={sending || proving}
                        onClick={() => {
                          selectAction(null);
                        }}
                        aria-label={`Cancel editing ${connection.domain}`}
                      >
                        Cancel
                      </Button>
                    </form>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className={`self-start ${CONTROL_HEIGHT}`}
                    disabled={sending || proving}
                    aria-label={`Remove connection for ${connection.domain}`}
                    onClick={() => {
                      selectAction({ kind: 'remove', connection });
                    }}
                  >
                    Remove connection
                  </Button>
                  {action?.kind === 'remove' && action.connection.id === connection.id && (
                    <div
                      role="group"
                      aria-label={`Remove connection for ${connection.domain}`}
                      className="bg-muted flex min-w-0 flex-col gap-3 rounded-md p-3 text-sm"
                    >
                      <p className="m-0">
                        Remove company sign-in for {connection.domain} through{' '}
                        {connection.auth0Connection}? This removes its proof, enforcement and login
                        routing. Live provisioning in this organization prevents removal.
                      </p>
                      <Button
                        type="button"
                        className={`self-start ${CONTROL_HEIGHT}`}
                        disabled={sending || proving}
                        aria-label={`Confirm removal of ${connection.domain}`}
                        onClick={() => void removeConnection(connection)}
                      >
                        Confirm removal
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`self-start ${CONTROL_HEIGHT}`}
                        disabled={sending || proving}
                        aria-label={`Cancel removal of ${connection.domain}`}
                        onClick={() => {
                          selectAction(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
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
                      if (pending.current || proofPending.current || readPending.current) return;
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
                // The child can submit before the disabled prop rerenders.
                // Proof: removing this admission failed both same-render
                // Enable→proof and Refresh→proof mounted tests (2026-10-13).
                canStart={() => !pending.current && !readPending.current && !proofPending.current}
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
      {lockout !== null && (
        <a href={`/api/auth/login?organization=${encodeURIComponent(lockout.slug)}`}>
          Sign in through {lockout.domain}
        </a>
      )}
    </OrganizationSection>
  );
}

type SetupRefusal = Extract<
  ClientReply<
    | typeof listSsoConnections
    | typeof createSsoConnection
    | typeof listOrganizationDomains
    | typeof updateSsoConnection
    | typeof removeSsoConnection
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
    case 'provisioning_active':
      // Proof: 2026-10-15, replacing this instruction with the former singular-token
      // refresh claim failed both mounted provisioning-conflict guidance cases.
      return said(
        'Removal was blocked by live provisioning tokens. Revoke all live tokens in Provisioning tokens, then try removing the connection again.',
      );
    case 'not_found':
      return said('That domain claim no longer exists.');
    case 'sso_connection_unproven':
      return said(
        'Complete a proof sign-in before enabling enforcement. The connection list has been refreshed.',
      );
    case 'enforcement_would_lock_out_actor':
      return said(
        'Your current sign-in cannot access this organization after enforcement. Sign in through this company connection first.',
      );
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
