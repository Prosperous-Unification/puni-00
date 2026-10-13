import { type ClientReply, readSessionPolicy, setSessionPolicy } from '@wbs/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { failureMessage, unreachable } from '@/lib/http';
import { useResourceClient } from '@/runtime/organization-resources';

import { type AccessLoss, lostAccess, READ_ONLY, RELOAD } from './organization-access';
import {
  ALERT_CLASS,
  CONTROL_HEIGHT,
  FIELD_CLASS,
  FIELD_LABEL_CLASS,
  OrganizationSection,
  STATUS_CLASS,
} from './organization-section';

const POLICY_SHAPES = [readSessionPolicy, setSessionPolicy] as const;
type Policy = Extract<ClientReply<typeof readSessionPolicy>, { kind: 'success' }>['body']['policy'];
type Refusal = Extract<
  ClientReply<typeof readSessionPolicy | typeof setSessionPolicy>,
  { kind: 'refusal' }
>['body'];
type View =
  { kind: 'loading' } | { kind: 'failure'; message: string } | { kind: 'ready'; policy: Policy };
const MIN = 300;
const MAX = 2592000;

/** Parses a typed optional seconds bound before a mutation crosses the network. */
function parseBound(value: string): number | null | 'invalid' {
  if (value === '') return null;
  if (!/^[0-9]+$/.test(value)) return 'invalid';
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds >= MIN && seconds <= MAX ? seconds : 'invalid';
}

/** Renders only the current organization's server-confirmed session policy. */
export function SessionPolicyPanel({
  onAccessLost,
}: {
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element {
  // Proof: 2026-10-13, changing the captured header to wrong-org failed the mounted scoped read/write test; removing the client late-reply fence published withdrawn A policy.
  const settings = useResourceClient(POLICY_SHAPES);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [maxSession, setMaxSession] = useState('');
  const [reauthenticateAfter, setReauthenticateAfter] = useState('');
  const [message, setMessage] = useState('');
  const [fault, setFault] = useState<Error | null>(null);
  const pending = useRef(false);
  const [sending, setSending] = useState(false);

  const applyPolicy = useCallback((policy: Policy) => {
    setView({ kind: 'ready', policy });
    setMaxSession(policy?.maxSessionSeconds?.toString() ?? '');
    setReauthenticateAfter(policy?.reauthenticateAfterSeconds?.toString() ?? '');
  }, []);
  const processRefusal = useCallback(
    (refusal: Refusal): 'lost' | 'message' => {
      switch (refusal.error) {
        // Proof: removing page withdrawal failed mounted read-refusal cases for membership, context and reauthentication.
        case 'unauthenticated':
        case 'organization_context_changed':
        case 'no_active_organization':
        case 'not_a_member': {
          const outcome = lostAccess(refusal.error);
          if (outcome.kind !== 'lost') throw new Error('Unexpected access outcome');
          onAccessLost(outcome.loss);
          return 'lost';
        }
        case 'sso_required':
        case 'reauthentication_required': {
          const outcome = lostAccess(refusal);
          if (outcome.kind !== 'lost') throw new Error('Unexpected access outcome');
          onAccessLost(outcome.loss);
          return 'lost';
        }
        case 'forbidden':
          setView({ kind: 'failure', message: 'Only a super-admin can manage session policy.' });
          return 'message';
        case 'insufficient_scope':
          setView({ kind: 'failure', message: READ_ONLY });
          return 'message';
        case 'invalid_query':
        case 'invalid_body':
        case 'invalid_json':
        case 'invalid_origin':
          setView({ kind: 'failure', message: RELOAD });
          return 'message';
        default:
          return unreachable(refusal);
      }
    },
    [onAccessLost],
  );
  const refresh = useCallback(async () => {
    setView({ kind: 'loading' });
    setMessage('');
    const reply = await settings['getApiOrganizationSession-policy']({});
    switch (reply.kind) {
      case 'success':
        applyPolicy(reply.body.policy);
        return;
      case 'failure':
        if (reply.failure.code !== 'cancelled')
          setView({ kind: 'failure', message: failureMessage(reply.failure) });
        return;
      case 'refusal':
        processRefusal(reply.body);
        return;
      default:
        return unreachable(reply);
    }
  }, [settings, applyPolicy, processRefusal]);
  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      setFault(new Error('Unexpected session policy read failure', { cause }));
    });
  }, [refresh]);
  if (fault !== null) throw fault;

  async function save(policy: Exclude<Policy, null> | null) {
    // Proof: removing pending admission together with the submit guard failed the forced held-form test with two PUT requests.
    if (pending.current || view.kind !== 'ready') return;
    pending.current = true;
    setSending(true);
    setMessage('');
    try {
      const reply = await settings['putApiOrganizationSession-policy']({
        body: policy ?? { maxSessionSeconds: null, reauthenticateAfterSeconds: null },
      });
      switch (reply.kind) {
        case 'success':
          // Proof: trusting the submitted values failed the save reconciliation test when the server returned 7200 seconds.
          applyPolicy(reply.body.policy);
          setMessage(policy === null ? 'Session policy cleared.' : 'Session policy saved.');
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
      setFault(new Error('Unexpected session policy mutation failure', { cause }));
    } finally {
      pending.current = false;
      setSending(false);
    }
  }
  function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || view.kind !== 'ready') return;
    const max = parseBound(maxSession);
    const reauth = parseBound(reauthenticateAfter);
    // Proof: removing local bound validation failed the invalid-value mounted test with a PUT request.
    if (max === 'invalid' || reauth === 'invalid') {
      setMessage('Enter whole seconds from 300 to 2592000, or leave a bound empty.');
      return;
    }
    // Proof: reversing the comparison failed the relation test by posting a reauthentication bound above the maximum.
    if (max !== null && reauth !== null && reauth > max) {
      setMessage('Reauthentication cannot exceed the maximum session length.');
      return;
    }
    void save({ maxSessionSeconds: max, reauthenticateAfterSeconds: reauth });
  }
  return (
    <OrganizationSection id="session-policy-heading" title="Session policy">
      <Button
        type="button"
        variant="outline"
        className={`self-start ${CONTROL_HEIGHT}`}
        disabled={sending || view.kind === 'loading'}
        onClick={() => {
          if (!pending.current)
            void refresh().catch((cause: unknown) => {
              setFault(new Error('Unexpected session policy refresh failure', { cause }));
            });
        }}
      >
        Refresh session policy
      </Button>
      {view.kind === 'loading' && <p className={STATUS_CLASS}>Loading session policy…</p>}
      {view.kind === 'failure' && (
        <p role="alert" className={ALERT_CLASS}>
          {view.message}
        </p>
      )}
      {view.kind === 'ready' && (
        <>
          {view.policy === null ? (
            <p className={STATUS_CLASS}>No session policy is set.</p>
          ) : (
            <p className={STATUS_CLASS}>Session policy is configured.</p>
          )}
          <p className={STATUS_CLASS}>
            Leave either bound empty for no limit. Changes to these bounds can require members to
            sign in again.
          </p>
          <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
            <span className={FIELD_CLASS}>
              <label htmlFor="policy-max" className={FIELD_LABEL_CLASS}>
                Maximum session length (seconds)
              </label>
              <Input
                id="policy-max"
                className={CONTROL_HEIGHT}
                inputMode="numeric"
                value={maxSession}
                disabled={sending}
                onChange={(event) => {
                  setMaxSession(event.target.value);
                }}
              />
            </span>
            <span className={FIELD_CLASS}>
              <label htmlFor="policy-reauth" className={FIELD_LABEL_CLASS}>
                Reauthenticate after (seconds)
              </label>
              <Input
                id="policy-reauth"
                className={CONTROL_HEIGHT}
                inputMode="numeric"
                value={reauthenticateAfter}
                disabled={sending}
                onChange={(event) => {
                  setReauthenticateAfter(event.target.value);
                }}
              />
            </span>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className={CONTROL_HEIGHT} disabled={sending}>
                Save session policy
              </Button>
              <Button
                type="button"
                variant="outline"
                className={CONTROL_HEIGHT}
                disabled={sending || view.policy === null}
                onClick={() => void save(null)}
              >
                Clear session policy
              </Button>
            </div>
          </form>
        </>
      )}
      {message !== '' && (
        <p
          role={
            message.includes('Enter whole') || message.includes('cannot exceed')
              ? 'alert'
              : 'status'
          }
          className={STATUS_CLASS}
        >
          {message}
        </p>
      )}
    </OrganizationSection>
  );
}
