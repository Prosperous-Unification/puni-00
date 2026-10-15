import {
  type ClientReply,
  issueProvisioningToken,
  listProvisioningTokens,
  revokeProvisioningToken,
  rotateProvisioningToken,
} from '@wbs/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient } from '@/runtime/organization-resources';

import { type AccessLoss, lostAccess, READ_ONLY, RELOAD } from './organization-access';
import {
  ALERT_CLASS,
  CONTROL_HEIGHT,
  LIST_CLASS,
  OrganizationSection,
  STATUS_CLASS,
} from './organization-section';

const TOKEN_SHAPES = [
  listProvisioningTokens,
  issueProvisioningToken,
  rotateProvisioningToken,
  revokeProvisioningToken,
] as const;
type Token = Extract<
  ClientReply<typeof listProvisioningTokens>,
  { kind: 'success' }
>['body']['tokens'][number];
type Refusal = Extract<ClientReply<(typeof TOKEN_SHAPES)[number]>, { kind: 'refusal' }>['body'];
type View =
  { kind: 'loading' } | { kind: 'failure'; message: string } | { kind: 'ready'; tokens: Token[] };
interface Secret {
  token: string;
  previousExpiresAt?: number;
}
type Mutation = { kind: 'issue' } | { kind: 'rotate' | 'revoke'; id: string };

/**
 * Administers provisioning tokens in the owning organization runtime. Secrets live
 * only in this component until dismissal, refresh, another mutation or unmount.
 * Server metadata is reread after every successful write; no local expiry grants authority.
 */
export function ProvisioningTokensPanel({
  onAccessLost,
}: {
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element {
  // Proof: dropping the captured scope in useResourceClient failed `uses the captured organization` (2026-10-15).
  // Removing its late-currentness fences published withdrawn-secret in the held-reply test.
  const tokens = useResourceClient(TOKEN_SHAPES);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [secret, setSecret] = useState<Secret | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [fault, setFault] = useState<Error | null>(null);
  const pending = useRef(false);
  const generation = useRef(0);
  const [sending, setSending] = useState(false);

  const processRefusal = useCallback(
    (refusal: Refusal) => {
      setSecret(null);
      switch (refusal.error) {
        case 'unauthenticated':
        case 'organization_context_changed':
        case 'no_active_organization':
        case 'not_a_member': {
          setView({ kind: 'loading' });
          const outcome = lostAccess(refusal.error);
          if (outcome.kind !== 'lost') throw new Error('Unexpected access outcome');
          onAccessLost(outcome.loss);
          return;
        }
        case 'sso_required':
        case 'reauthentication_required': {
          setView({ kind: 'loading' });
          const outcome = lostAccess(refusal);
          if (outcome.kind !== 'lost') throw new Error('Unexpected credential outcome');
          onAccessLost(outcome.loss);
          return;
        }
        case 'forbidden':
          setView({
            kind: 'failure',
            message: 'Only a super-admin can manage provisioning tokens.',
          });
          return;
        case 'insufficient_scope':
          setView({ kind: 'failure', message: READ_ONLY });
          return;
        case 'sso_connection_unproven':
          setMessage('Prove a company sign-in connection before issuing provisioning tokens.');
          return;
        case 'token_limit':
          setMessage(
            'Two provisioning tokens are already live. Revoke one before issuing another.',
          );
          return;
        case 'not_found':
          setMessage('This provisioning token is no longer live. Refresh the token list.');
          return;
        case 'invalid_origin':
        case 'invalid_params':
        case 'invalid_query':
        case 'invalid_body':
          setView({ kind: 'failure', message: RELOAD });
          return;
        default:
          return unreachable(refusal);
      }
    },
    [onAccessLost],
  );

  const read = useCallback(
    async (version: number) => {
      const reply = await tokens.getApiOrganizationProvisioningTokens({});
      // Proof: removing this read fence let the held StrictMode GET restore token-a after issue (2026-10-15).
      if (version !== generation.current) return;
      switch (reply.kind) {
        case 'success':
          setView({ kind: 'ready', tokens: reply.body.tokens });
          return;
        case 'failure':
          if (reply.failure.code !== 'cancelled') {
            setSecret(null);
            setView({ kind: 'failure', message: failureMessage(reply.failure) });
          }
          return;
        case 'refusal':
          processRefusal(reply.body);
          return;
        default:
          return unreachable(reply);
      }
    },
    [tokens, processRefusal],
  );
  const refresh = useCallback(async () => {
    if (pending.current) return;
    // Proof: omitting secret clearing failed `discards an issued secret on refresh` (2026-10-15).
    setSecret(null);
    setMessage('');
    setConfirmation('');
    setView({ kind: 'loading' });
    // Proof: removing this admission allowed the same-render Refresh→Issue test to post (2026-10-15).
    pending.current = true;
    const version = ++generation.current;
    try {
      await read(version);
    } finally {
      if (version === generation.current) pending.current = false;
    }
  }, [read]);
  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      setFault(new Error('Unexpected provisioning token read failure', { cause }));
    });
    const version = generation;
    return () => {
      version.current++;
      pending.current = false;
    };
  }, [refresh]);
  if (fault !== null) throw fault;

  async function mutate(mutation: Mutation) {
    // Proof: removing pending admission here and in the form sent two held DELETEs in the forced-submit test (2026-10-15).
    if (pending.current || view.kind !== 'ready') return;
    pending.current = true;
    const version = ++generation.current;
    setSending(true);
    // Proof: retaining the old secret failed the held-write withdrawal test before its reply (2026-10-15).
    setSecret(null);
    setMessage('');
    try {
      if (mutation.kind === 'revoke') {
        const reply = await tokens.deleteApiOrganizationProvisioningTokensById({
          params: { id: mutation.id },
        });
        if (version !== generation.current) return;
        switch (reply.kind) {
          case 'success':
            setConfirmation('');
            await read(version);
            return;
          case 'failure':
            if (reply.failure.code !== 'cancelled') setMessage(failureMessage(reply.failure));
            return;
          case 'refusal':
            processRefusal(reply.body);
            return;
          default:
            return unreachable(reply);
        }
      }
      const reply =
        mutation.kind === 'issue'
          ? await tokens.postApiOrganizationProvisioningTokens({})
          : await tokens.postApiOrganizationProvisioningTokensByIdRotate({
              params: { id: mutation.id },
            });
      if (version !== generation.current) return;
      switch (reply.kind) {
        case 'success':
          // Proof: replacing previousExpiresAt with zero failed the server-overlap rotation test (2026-10-15).
          setSecret(reply.body);
          await read(version);
          return;
        case 'failure':
          if (reply.failure.code !== 'cancelled') setMessage(failureMessage(reply.failure));
          return;
        case 'refusal':
          processRefusal(reply.body);
          return;
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      if (version === generation.current)
        setFault(new Error('Unexpected provisioning token mutation failure', { cause }));
    } finally {
      if (version === generation.current) {
        pending.current = false;
        setSending(false);
      }
    }
  }
  return (
    <OrganizationSection id="provisioning-tokens-heading" title="Provisioning tokens">
      <Button
        type="button"
        variant="outline"
        className={`self-start ${CONTROL_HEIGHT}`}
        disabled={sending || view.kind === 'loading'}
        onClick={() => {
          void refresh().catch((cause: unknown) => {
            setFault(new Error('Unexpected provisioning token refresh failure', { cause }));
          });
        }}
      >
        Refresh provisioning tokens
      </Button>
      {view.kind === 'loading' && <p className={STATUS_CLASS}>Loading provisioning tokens…</p>}
      {view.kind === 'failure' && (
        <p role="alert" className={ALERT_CLASS}>
          {view.message}
        </p>
      )}
      {view.kind === 'ready' && (
        <>
          <p className={STATUS_CLASS}>
            Provisioning tokens let your directory manage organization members through SCIM. Revoke
            live tokens before deleting a company sign-in connection.
          </p>
          <Button
            type="button"
            className={`self-start ${CONTROL_HEIGHT}`}
            disabled={sending}
            onClick={() => void mutate({ kind: 'issue' })}
          >
            Issue provisioning token
          </Button>
          {view.tokens.length === 0 ? (
            <p className={STATUS_CLASS}>No provisioning tokens.</p>
          ) : (
            <ul className={`${LIST_CLASS} gap-4`}>
              {view.tokens.map((token) => (
                <li key={token.id} className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
                  <code className="break-all">{token.id}</code>
                  <p className={STATUS_CLASS}>Created: {new Date(token.createdAt).toISOString()}</p>
                  <p className={STATUS_CLASS}>
                    {token.expiresAt === null
                      ? 'No expiry'
                      : `Expires: ${new Date(token.expiresAt).toISOString()}`}
                  </p>
                  {token.revokedAt !== null ? (
                    <p className={STATUS_CLASS}>Revoked</p>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className={`self-start ${CONTROL_HEIGHT}`}
                        disabled={sending}
                        aria-label={`Rotate ${token.id}`}
                        onClick={() => void mutate({ kind: 'rotate', id: token.id })}
                      >
                        Rotate token
                      </Button>
                      <form
                        className="flex flex-col gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (pending.current) return;
                          // Proof: bypassing the exact comparison sent the wrong-confirmation DELETE instead of showing its error (2026-10-15).
                          if (confirmation !== token.id) {
                            setMessage('Enter the exact token ID to revoke it.');
                            return;
                          }
                          void mutate({ kind: 'revoke', id: token.id });
                        }}
                      >
                        <label htmlFor={`revoke-${token.id}`}>Token ID to revoke</label>
                        <Input
                          id={`revoke-${token.id}`}
                          value={confirmation}
                          disabled={sending}
                          onChange={(event) => {
                            setConfirmation(event.target.value);
                          }}
                        />
                        <Button
                          type="submit"
                          aria-label={`Revoke ${token.id}`}
                          variant="destructive"
                          className={`self-start ${CONTROL_HEIGHT}`}
                          disabled={sending}
                        >
                          Revoke token
                        </Button>
                      </form>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {secret !== null && (
        <div role="status" className="flex min-w-0 flex-col gap-2 rounded-md border p-3">
          <p>Copy this secret now. It will not be shown again.</p>
          <code className="break-all">{secret.token}</code>
          {secret.previousExpiresAt !== undefined && (
            <p>Previous token expires: {new Date(secret.previousExpiresAt).toISOString()}</p>
          )}
          <Button
            type="button"
            variant="outline"
            className={`self-start ${CONTROL_HEIGHT}`}
            onClick={() => {
              setSecret(null);
            }}
          >
            Dismiss secret
          </Button>
        </div>
      )}
      {message !== '' && (
        <p role="alert" className={ALERT_CLASS}>
          {message}
        </p>
      )}
    </OrganizationSection>
  );
}
