import {
  approveJoinRequest,
  type ClientReply,
  denyJoinRequest,
  listJoinRequests,
} from '@wbs/contracts';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { browserClient, failureMessage, unreachable } from '@/lib/http';

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
  LIST_CLASS,
  OrganizationSection,
  ROW_ACTIONS_CLASS,
  ROW_CLASS,
  ROW_SELECT_CLASS,
  STATUS_CLASS,
} from './organization-section';

const joinRequests = browserClient([listJoinRequests, approveJoinRequest, denyJoinRequest]);

type JoinRequest = Extract<
  ClientReply<typeof listJoinRequests>,
  { kind: 'success' }
>['body']['requests'][number];
type ApprovalRole = 'viewer' | 'member';
type View =
  | { kind: 'loading' }
  | { kind: 'failure'; message: string }
  | { kind: 'ready'; requests: readonly JoinRequest[] };

/**
 * Join requests to the active organization. Approval issues an invitation at
 * the chosen viewer or member role and never grants membership by itself;
 * denial only resolves the request. Every decision re-reads the list.
 */
export function JoinRequestsPanel({
  onAccessLost,
}: {
  onAccessLost: (loss: AccessLoss) => void;
}): React.JSX.Element {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [roles, setRoles] = useState<Readonly<Record<string, ApprovalRole>>>({});
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [fault, setFault] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    const reply = await joinRequests.getApiOrganizationJoinRequests({});
    switch (reply.kind) {
      case 'success':
        setView({ kind: 'ready', requests: reply.body.requests });
        return;
      case 'failure':
        setView({ kind: 'failure', message: failureMessage(reply.failure) });
        return;
      case 'refusal': {
        const outcome = decisionRefusal(reply.body, 'view join requests');
        if (outcome.kind === 'lost') onAccessLost(outcome.loss);
        else setView({ kind: 'failure', message: outcome.text });
        return;
      }
      default:
        return unreachable(reply);
    }
  }, [onAccessLost]);

  useEffect(() => {
    void refresh().catch((cause: unknown) => {
      setFault(new Error('Unexpected join request list failure', { cause }));
    });
  }, [refresh]);

  if (fault !== null) throw fault;

  async function decide(request: JoinRequest, decision: 'approve' | 'deny') {
    setSending(true);
    setMessage('');
    try {
      const reply =
        decision === 'approve'
          ? // Proof: 2026-09-29, sending a fixed `member` role failed `approves at
            // the chosen role, then re-reads the list` with { role: 'member' }.
            await joinRequests.postApiOrganizationJoinRequestsByIdApprove({
              params: { id: request.id },
              body: { role: roles[request.id] ?? 'member' },
            })
          : await joinRequests.postApiOrganizationJoinRequestsByIdDeny({
              params: { id: request.id },
            });
      switch (reply.kind) {
        case 'success':
          setMessage(
            decision === 'approve'
              ? `Invitation sent to ${request.email}.`
              : `Request from ${request.email} denied.`,
          );
          await refresh();
          return;
        case 'failure':
          setMessage(failureMessage(reply.failure));
          return;
        case 'refusal': {
          const outcome = decisionRefusal(reply.body, 'decide join requests');
          if (outcome.kind === 'lost') {
            onAccessLost(outcome.loss);
            return;
          }
          setMessage(outcome.text);
          await refresh();
          return;
        }
        default:
          return unreachable(reply);
      }
    } catch (cause) {
      setFault(new Error('Unexpected join request failure', { cause }));
    } finally {
      setSending(false);
    }
  }

  const pending =
    view.kind === 'ready' ? view.requests.filter((request) => request.status === 'pending') : [];
  const resolved =
    view.kind === 'ready' ? view.requests.filter((request) => request.status !== 'pending') : [];
  return (
    <OrganizationSection id="join-requests-heading" title="Join requests">
      {view.kind === 'loading' && <p className={STATUS_CLASS}>Loading join requests…</p>}
      {view.kind === 'failure' && (
        <p role="alert" className={ALERT_CLASS}>
          {view.message}
        </p>
      )}
      {view.kind === 'ready' && pending.length === 0 && (
        <p className="text-muted-foreground text-sm">No pending join requests.</p>
      )}
      {pending.length > 0 && (
        <ul
          aria-label="Pending join requests"
          className={`${LIST_CLASS} divide-border -my-3 divide-y`}
        >
          {pending.map((request) => (
            <li key={request.id} className={ROW_CLASS}>
              <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{request.email}</span>
              <span className={ROW_ACTIONS_CLASS}>
                <label htmlFor={`join-role-${request.id}`} className="sr-only">
                  Role for {request.email}
                </label>
                <select
                  id={`join-role-${request.id}`}
                  className={ROW_SELECT_CLASS}
                  value={roles[request.id] ?? 'member'}
                  onChange={(event) => {
                    const role = approvalRoleOf(event.target.value);
                    setRoles((current) => ({ ...current, [request.id]: role }));
                  }}
                >
                  <option value="viewer">Viewer</option>
                  <option value="member">Member</option>
                </select>
                <Button
                  type="button"
                  className={CONTROL_HEIGHT}
                  disabled={sending}
                  aria-label={`Approve ${request.email}`}
                  onClick={() => {
                    void decide(request, 'approve');
                  }}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={CONTROL_HEIGHT}
                  disabled={sending}
                  aria-label={`Deny ${request.email}`}
                  onClick={() => {
                    void decide(request, 'deny');
                  }}
                >
                  Deny
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {resolved.length > 0 && (
        <ul
          aria-label="Resolved join requests"
          className={`${LIST_CLASS} flex flex-col gap-1 text-sm`}
        >
          {resolved.map((request) => (
            <li key={request.id} className="flex flex-wrap gap-x-3">
              <span className="min-w-0 [overflow-wrap:anywhere]">{request.email}</span>{' '}
              <span className="text-muted-foreground">{STATUS_NAMES[request.status]}</span>
            </li>
          ))}
        </ul>
      )}
      {message !== '' && (
        <p role="status" className={STATUS_CLASS}>
          {message}
        </p>
      )}
    </OrganizationSection>
  );
}

const STATUS_NAMES: Record<JoinRequest['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Denied',
};

/** The select offers only the two approval roles; anything else is a programming error. */
function approvalRoleOf(value: string): ApprovalRole {
  if (value === 'viewer' || value === 'member') return value;
  throw new Error(`Unexpected approval role option: ${value}`);
}

/**
 * The join-request routes share one refusal set; approval adds lost delivery.
 *
 * Proof: 2026-09-29, answering `domain_changed` with the resolved copy failed
 * `renders the domain_changed approval refusal`.
 */
function decisionRefusal(
  refusal:
    | Extract<ClientReply<typeof approveJoinRequest>, { kind: 'refusal' }>['body']
    | Extract<ClientReply<typeof listJoinRequests>, { kind: 'refusal' }>['body'],
  action: string,
): RefusalOutcome {
  switch (refusal.error) {
    case 'onboarding_inactive':
    case 'unauthenticated':
    case 'no_active_organization':
    case 'not_a_member':
      return lostAccess(refusal.error);
    case 'sso_required':
    case 'reauthentication_required':
      return lostAccess(refusal);
    case 'forbidden':
      return said(`Your role cannot ${action}.`);
    case 'request_resolved':
      return said('That request was already approved or denied.');
    case 'domain_changed':
      return said(
        "The requester's email or the organization's verified domain changed, so the request can no longer be approved.",
      );
    case 'not_found':
      return said('That request no longer exists.');
    case 'delivery_failed':
      return said('The invitation email could not be sent, so the request stays pending.');
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
