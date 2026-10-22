import { Button, Input } from '@ui/saas-01';
import {
  type ClientReply,
  listSsoConnections,
  listTrustedIssuers,
  registerTrustedIssuer,
  removeTrustedIssuer,
} from '@wbs/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient, useResourceScope } from '@/runtime/organization-resources';

import { type TrustedIssuerRefusal, trustedIssuerRefusal } from './machine-credential-refusal';
import { type AccessLoss } from './organization-access';
import {
  ALERT_CLASS,
  CONTROL_HEIGHT,
  FIELD_CLASS,
  FIELD_LABEL_CLASS,
  LIST_CLASS,
  ROW_ACTIONS_CLASS,
  SELECT_CLASS,
  STATUS_CLASS,
} from './organization-section';

const ISSUER_SHAPES = [
  listTrustedIssuers,
  registerTrustedIssuer,
  removeTrustedIssuer,
  listSsoConnections,
] as const;

type TrustedIssuer = Extract<
  ClientReply<typeof listTrustedIssuers>,
  { kind: 'success' }
>['body']['trustedIssuers'][number];
type Connection = Extract<
  ClientReply<typeof listSsoConnections>,
  { kind: 'success' }
>['body']['connections'][number];

/**
 * The proven `oidc` connections an issuer may be gated by, or why none are
 * offered: the connection list is a super-admin's read, so an admin's refused
 * read leaves the optional picker out, said in place.
 */
type Connections =
  | { readonly kind: 'ready'; readonly connections: readonly Connection[] }
  | { readonly kind: 'unavailable'; readonly message: string };

type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; issuers: readonly TrustedIssuer[]; connections: Connections };

/**
 * The organization's trusted OIDC issuers (`wbs-machine-credentials` A16), for
 * admins only: list, register by URL with an optional proven company sign-in
 * connection and default audience, and remove, which be-01 refuses `in_use`
 * with the count of live credentials naming the issuer. `onChanged` tells the
 * credentials panel its issuer choices moved.
 */
export function TrustedIssuersSection({
  onAccessLost,
  onChanged,
}: {
  onAccessLost: (loss: AccessLoss) => void;
  onChanged: () => void;
}): React.JSX.Element {
  const client = useResourceClient(ISSUER_SHAPES);
  const scope = useResourceScope();
  const suggestedAudience =
    scope.organization.kind === 'active' ? `wbs:org:${scope.organization.organizationId}` : null;
  const [audience, setAudience] = useState(suggestedAudience ?? '');
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [issuerUrl, setIssuerUrl] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [fault, setFault] = useState<Error | null>(null);
  const [isSending, setIsSending] = useState(false);
  const isPending = useRef(false);
  const generation = useRef(0);

  const processRefusal = useCallback(
    (refusal: TrustedIssuerRefusal, isRead: boolean) => {
      const outcome = trustedIssuerRefusal(refusal);
      if (outcome.kind === 'lost') {
        setView({ kind: 'loading' });
        onAccessLost(outcome.loss);
        return;
      }
      if (isRead) setView({ kind: 'failure', message: outcome.text });
      else setMessage(outcome.text);
    },
    [onAccessLost],
  );

  const read = useCallback(
    async (version: number) => {
      const [listed, connections] = await Promise.all([
        client['getApiOrganizationTrusted-issuers']({}),
        client['getApiOrganizationSso-connections']({}),
      ]);
      if (version !== generation.current) return;
      switch (listed.kind) {
        case 'success':
          break;
        case 'failure':
          if (listed.failure.code !== 'cancelled')
            setView({ kind: 'failure', message: failureMessage(listed.failure) });
          return;
        case 'refusal':
          processRefusal(listed.body, true);
          return;
        default:
          return unreachable(listed);
      }
      let offered: Connections;
      switch (connections.kind) {
        case 'success':
          offered = {
            kind: 'ready',
            connections: connections.body.connections.filter(
              (connection) => connection.strategy === 'oidc' && connection.provenAt !== null,
            ),
          };
          break;
        case 'failure':
          if (connections.failure.code === 'cancelled') return;
          offered = { kind: 'unavailable', message: failureMessage(connections.failure) };
          break;
        case 'refusal':
          // The page-level losses withdraw through the runtime scope; any other
          // refusal (a non-super-admin's `forbidden` above all) leaves the
          // optional gate out.
          offered = {
            kind: 'unavailable',
            message: 'Company sign-in connections are listed for super-admins only.',
          };
          break;
        default:
          return unreachable(connections);
      }
      setView({ kind: 'ready', issuers: listed.body.trustedIssuers, connections: offered });
    },
    [client, processRefusal],
  );

  const refresh = useCallback(async () => {
    if (isPending.current) return;
    setMessage('');
    setRemoving(null);
    setView({ kind: 'loading' });
    isPending.current = true;
    const version = ++generation.current;
    try {
      await read(version);
    } finally {
      if (version === generation.current) isPending.current = false;
    }
  }, [read]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      setFault(new Error('Unexpected trusted issuer read failure', { cause }));
    });
    const version = generation;
    return () => {
      version.current++;
      isPending.current = false;
    };
  }, [refresh]);
  if (fault !== null) throw fault;

  async function write(
    send: () => Promise<
      ClientReply<typeof registerTrustedIssuer> | ClientReply<typeof removeTrustedIssuer>
    >,
    done: () => void,
  ) {
    if (isPending.current || view.kind !== 'ready') return;
    isPending.current = true;
    const version = ++generation.current;
    setIsSending(true);
    setMessage('');
    try {
      const reply = await send();
      if (version !== generation.current) return;
      switch (reply.kind) {
        case 'success':
          done();
          await read(version);
          onChanged();
          return;
        case 'failure':
          if (reply.failure.code !== 'cancelled') setMessage(failureMessage(reply.failure));
          return;
        case 'refusal':
          processRefusal(reply.body, false);
          return;
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      if (version === generation.current)
        setFault(new Error('Unexpected trusted issuer write failure', { cause }));
    } finally {
      if (version === generation.current) {
        isPending.current = false;
        setIsSending(false);
      }
    }
  }

  return (
    <section
      aria-labelledby="trusted-issuers-heading"
      className="border-border flex min-w-0 flex-col gap-3 border-t pt-4"
    >
      <h3 id="trusted-issuers-heading" className="text-base font-semibold">
        Trusted issuers
      </h3>
      <p className={STATUS_CLASS}>
        An OIDC credential admits tokens of a trusted issuer for one exact subject, such as a GitHub
        Actions workflow. Only admins trust an issuer.
      </p>
      {view.kind === 'loading' && <p className={STATUS_CLASS}>Loading trusted issuers…</p>}
      {view.kind === 'failure' && (
        <div className="flex flex-col gap-2">
          <p role="alert" className={ALERT_CLASS}>
            {view.message}
          </p>
          <Button
            type="button"
            variant="outline"
            className={`self-start ${CONTROL_HEIGHT}`}
            onClick={() => {
              void refresh().catch((cause: unknown) => {
                setFault(new Error('Unexpected trusted issuer read failure', { cause }));
              });
            }}
          >
            Retry trusted issuers
          </Button>
        </div>
      )}
      {view.kind === 'ready' && (
        <>
          {view.issuers.length === 0 ? (
            <p className={STATUS_CLASS}>No trusted issuers yet.</p>
          ) : (
            <ul className={`${LIST_CLASS} gap-2`} aria-label="Trusted issuers list">
              {view.issuers.map((issuer) => (
                <li
                  key={issuer.id}
                  className="border-border flex min-w-0 flex-col gap-2 rounded-md border p-3"
                >
                  <span className="font-semibold [overflow-wrap:anywhere]">{issuer.issuer}</span>
                  <span className={`${STATUS_CLASS} [overflow-wrap:anywhere]`}>
                    Audience: {issuer.audience} · Live credentials: {issuer.machineCredentials}
                  </span>
                  {removing === issuer.id ? (
                    <div className={ROW_ACTIONS_CLASS}>
                      <Button
                        type="button"
                        variant="destructive"
                        className={CONTROL_HEIGHT}
                        disabled={isSending}
                        aria-label={`Confirm removing ${issuer.issuer}`}
                        onClick={() =>
                          void write(
                            () =>
                              client['deleteApiOrganizationTrusted-issuersById']({
                                params: { id: issuer.id },
                              }),
                            () => {
                              setRemoving(null);
                            },
                          )
                        }
                      >
                        Remove issuer
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={CONTROL_HEIGHT}
                        disabled={isSending}
                        onClick={() => {
                          setRemoving(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className={`self-start ${CONTROL_HEIGHT}`}
                      disabled={isSending}
                      aria-label={`Remove ${issuer.issuer}`}
                      onClick={() => {
                        setMessage('');
                        setRemoving(issuer.id);
                      }}
                    >
                      Remove…
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form
            aria-labelledby="trusted-issuer-register-heading"
            className="bg-muted/30 border-border flex flex-col gap-3 rounded-md border border-dashed p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void write(
                () =>
                  client['postApiOrganizationTrusted-issuers']({
                    body: {
                      issuer: issuerUrl,
                      audience,
                      ...(connectionId === '' ? {} : { ssoConnectionId: connectionId }),
                    },
                  }),
                () => {
                  setIssuerUrl('');
                  setAudience(suggestedAudience ?? '');
                  setConnectionId('');
                },
              );
            }}
          >
            <h4 id="trusted-issuer-register-heading" className="m-0 text-sm font-semibold">
              Register a trusted issuer
            </h4>
            <span className={FIELD_CLASS}>
              <label htmlFor="trusted-issuer-url" className={FIELD_LABEL_CLASS}>
                Issuer URL
              </label>
              <Input
                id="trusted-issuer-url"
                type="url"
                className={CONTROL_HEIGHT}
                value={issuerUrl}
                disabled={isSending}
                required
                maxLength={2048}
                placeholder="https://token.actions.githubusercontent.com"
                onChange={(event) => {
                  setIssuerUrl(event.target.value);
                }}
              />
            </span>
            <span className={FIELD_CLASS}>
              <label htmlFor="trusted-issuer-audience" className={FIELD_LABEL_CLASS}>
                Audience
              </label>
              <Input
                id="trusted-issuer-audience"
                className={CONTROL_HEIGHT}
                value={audience}
                disabled={isSending}
                required
                maxLength={512}
                aria-describedby="trusted-issuer-audience-hint"
                onChange={(event) => {
                  setAudience(event.target.value);
                }}
              />
              <span id="trusted-issuer-audience-hint" className="text-muted-foreground text-xs">
                Tokens must carry this audience. Configure the same value at your identity provider
                {suggestedAudience === null
                  ? '.'
                  : `; the suggested value is ${suggestedAudience}.`}
              </span>
            </span>
            {view.connections.kind === 'ready' ? (
              <span className={FIELD_CLASS}>
                <label htmlFor="trusted-issuer-connection" className={FIELD_LABEL_CLASS}>
                  Company sign-in connection (optional)
                </label>
                <select
                  id="trusted-issuer-connection"
                  className={SELECT_CLASS}
                  value={connectionId}
                  disabled={isSending}
                  onChange={(event) => {
                    setConnectionId(event.target.value);
                  }}
                >
                  <option value="">None</option>
                  {view.connections.connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.domain} ({connection.loginSlug})
                    </option>
                  ))}
                </select>
              </span>
            ) : (
              <p className={STATUS_CLASS}>{view.connections.message}</p>
            )}
            <Button type="submit" className={`self-start ${CONTROL_HEIGHT}`} disabled={isSending}>
              Register issuer
            </Button>
          </form>
        </>
      )}
      {message !== '' && (
        <p role="alert" className={ALERT_CLASS}>
          {message}
        </p>
      )}
    </section>
  );
}
