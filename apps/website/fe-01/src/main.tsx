import './style.css';

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { ApiFailure, requestJson } from './api';
import { describeFailure, describeOperatorFailure, offersAi } from './app-flow';
import { type Draft, parseDraft } from './build-contract';
import { AppErrorBoundary, BuildPage } from './build-page';
import {
  HeroMedia,
  OperatorFooter,
  SiteFooter,
  SiteHeader,
  siteOrigin,
  useHeadingFocus,
  usePageTitle,
} from './chrome';
import { FunnelPanel } from './funnel-panel';
import { GuardrailsPanel } from './guardrails-panel';

interface Submission {
  id: string;
  description: string;
  brief: string;
  email: string;
  status: string;
  createdAt: string;
}
interface PendingProposal {
  email: string;
  brief: string;
  idempotencyKey: string;
  csrfToken: string;
  createdAt: number;
}
const pendingKey = 'puni_pending_proposal';

function readPendingProposal(): PendingProposal | null {
  const stored = sessionStorage.getItem(pendingKey);
  if (stored === null) return null;
  const parsed: unknown = JSON.parse(stored);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('email' in parsed) ||
    typeof parsed.email !== 'string' ||
    !('brief' in parsed) ||
    typeof parsed.brief !== 'string' ||
    !('idempotencyKey' in parsed) ||
    typeof parsed.idempotencyKey !== 'string' ||
    !('csrfToken' in parsed) ||
    typeof parsed.csrfToken !== 'string' ||
    !('createdAt' in parsed) ||
    typeof parsed.createdAt !== 'number'
  )
    throw new Error('Stored pending proposal is malformed');
  if (Date.now() - parsed.createdAt > 24 * 60 * 60 * 1000) {
    sessionStorage.removeItem(pendingKey);
    return null;
  }
  return {
    email: parsed.email,
    brief: parsed.brief,
    idempotencyKey: parsed.idempotencyKey,
    csrfToken: parsed.csrfToken,
    createdAt: parsed.createdAt,
  };
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; draft: Draft }
  | { kind: 'recover' }
  | { kind: 'error'; message: string };

/**
 * Manual brief length. The API accepts 8,000 characters, but concept generation reads only the
 * first 4,000, so the form stops there. Home's 2,000 limit applies to the shorter description
 * that this brief expands.
 */
const briefLimit = 4000;

function ManualPage() {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [brief, setBrief] = useState('');
  const [email, setEmail] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [previousReceipt, setPreviousReceipt] = useState<string | null>(null);
  const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(() =>
    readPendingProposal(),
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [requestKey, setRequestKey] = useState(() => {
    const saved = sessionStorage.getItem('puni_proposal_key');
    if (saved) return saved;
    const created = crypto.randomUUID();
    sessionStorage.setItem('puni_proposal_key', created);
    return created;
  });

  useEffect(() => {
    requestJson<unknown>('/draft')
      .then((value) => {
        // A malformed draft throws InvalidDraft into the catch below: the load-error state.
        const draft = parseDraft(value);
        if (pendingProposal) {
          const nextKey = crypto.randomUUID();
          sessionStorage.setItem('puni_proposal_key', nextKey);
          setRequestKey(nextKey);
        }
        setBrief(draft.brief || draft.description);
        setLoad({ kind: 'ready', draft });
      })
      .catch(async (error: unknown) => {
        if (error instanceof ApiFailure && error.status === 401 && pendingProposal) {
          try {
            setReceipt(await replayProposal(pendingProposal));
          } catch (replayError) {
            setLoad({
              kind: 'error',
              message: `Your previous submission needs confirmation. ${describeFailure(replayError)}`,
            });
          }
          return;
        }
        setLoad(
          error instanceof ApiFailure && error.status === 401
            ? { kind: 'recover' }
            : { kind: 'error', message: describeFailure(error) },
        );
      });
  }, []);

  async function replayProposal(pending: PendingProposal): Promise<string> {
    const answer = await requestJson<{ receipt: string }>('/proposals', {
      method: 'POST',
      headers: { 'X-Puni-CSRF': pending.csrfToken },
      body: JSON.stringify({
        email: pending.email,
        brief: pending.brief,
        idempotencyKey: pending.idempotencyKey,
      }),
    });
    sessionStorage.removeItem(pendingKey);
    sessionStorage.removeItem('puni_proposal_key');
    setPendingProposal(null);
    return answer.receipt;
  }

  async function recoverPreviousReceipt(): Promise<void> {
    if (!pendingProposal) return;
    setPending(true);
    setMessage('');
    try {
      setPreviousReceipt(await replayProposal(pendingProposal));
    } catch (error) {
      setMessage(describeFailure(error));
    } finally {
      setPending(false);
    }
  }

  async function saveBrief(): Promise<void> {
    if (load.kind !== 'ready') return;
    setPending(true);
    setMessage('');
    try {
      await requestJson<{ brief: string }>('/brief', {
        method: 'PATCH',
        headers: { 'X-Puni-CSRF': load.draft.csrfToken },
        body: JSON.stringify({ brief }),
      });
      setMessage(
        'Brief saved. You can return to this page in the same browser until the draft expires.',
      );
    } catch (error) {
      setMessage(describeFailure(error));
    } finally {
      setPending(false);
    }
  }

  async function submitProposal(event: React.SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (load.kind !== 'ready') return;
    setPending(true);
    setMessage('');
    try {
      const pending: PendingProposal = {
        email,
        brief,
        idempotencyKey: requestKey,
        csrfToken: load.draft.csrfToken,
        createdAt: Date.now(),
      };
      sessionStorage.setItem(pendingKey, JSON.stringify(pending));
      setPendingProposal(pending);
      const answer = await requestJson<{ receipt: string }>('/proposals', {
        method: 'POST',
        headers: { 'X-Puni-CSRF': pending.csrfToken },
        body: JSON.stringify({
          email: pending.email,
          brief: pending.brief,
          idempotencyKey: pending.idempotencyKey,
        }),
      });
      sessionStorage.removeItem(pendingKey);
      sessionStorage.removeItem('puni_proposal_key');
      setPendingProposal(null);
      setReceipt(answer.receipt);
    } catch (error) {
      setMessage(describeFailure(error));
    } finally {
      setPending(false);
    }
  }

  const view = receipt !== null ? 'receipt' : load.kind;
  usePageTitle(
    view === 'receipt'
      ? 'Request received'
      : view === 'recover'
        ? 'Start your request'
        : view === 'error'
          ? 'Request unavailable'
          : 'Your brief',
  );
  const heading = useHeadingFocus(view);
  // Loading, recover and error show every step as upcoming: same height, no claimed progress.
  const stepIndex = view === 'receipt' ? 2 : view === 'ready' ? 1 : -1;

  return (
    <div className="page-shell night-band">
      <HeroMedia />
      <SiteHeader buildCurrent="true" tone="night" />
      <main className="manual-layout" id="main">
        <aside className="context-panel" aria-label="About this step">
          <p className="eyebrow">01 / Request</p>
          <p className="context-statement">
            Shape the work. <span>We’ll take it from here.</span>
          </p>
          <p className="context-copy">
            A person reviews every proposal request. This page does not promise a price or delivery
            date.
          </p>
          <ol className="stepper" aria-label="Progress">
            {['Describe', 'Review', 'Human follow-up'].map((label, index) => {
              const status =
                stepIndex < 0
                  ? 'next'
                  : index < stepIndex
                    ? 'done'
                    : index === stepIndex
                      ? 'current'
                      : 'next';
              return (
                <li
                  key={label}
                  className={`stepper-step ${status}`}
                  aria-current={status === 'current' ? 'step' : undefined}
                >
                  <span className="stepper-mark" aria-hidden="true"></span>
                  <span>
                    {label}
                    <span className="visually-hidden">
                      {status === 'done' ? ', done' : status === 'next' ? ', next' : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="privacy-note">
            Read our <a href={`${siteOrigin}/privacy/`}>privacy information</a> for how request
            details are handled.
          </p>
        </aside>
        <section className="form-panel" aria-live="polite">
          <div className="form-panel-inner">
            {view === 'loading' && (
              <div className="state" role="status">
                <h1 ref={heading} tabIndex={-1} className="visually-hidden">
                  Your brief
                </h1>
                <div className="spinner" aria-hidden="true" />
                <p>Retrieving your request…</p>
              </div>
            )}
            {view === 'recover' && (
              <div className="state">
                <p className="eyebrow">Draft unavailable</p>
                <h1 ref={heading} tabIndex={-1}>
                  Let’s start with your request.
                </h1>
                <p className="lead">
                  This draft has expired or was saved in another browser. Describe what you need and
                  we’ll keep it ready for you here.
                </p>
                <div className="actions">
                  <a className="button" href={`${siteOrigin}/#request`}>
                    Start a new request <span aria-hidden="true">→</span>
                  </a>
                </div>
              </div>
            )}
            {view === 'error' && load.kind === 'error' && (
              <div className="state" role="alert">
                <p className="eyebrow">Request</p>
                <h1 ref={heading} tabIndex={-1}>
                  We couldn’t load your request.
                </h1>
                <p className="lead">{load.message}</p>
                <div className="actions">
                  <button
                    type="button"
                    className="button"
                    onClick={() => {
                      window.location.reload();
                    }}
                  >
                    Try again
                  </button>
                  <a className="button secondary" href={`${siteOrigin}/`}>
                    Back to Home
                  </a>
                </div>
              </div>
            )}
            {view === 'ready' && load.kind === 'ready' && (
              <>
                <p className="eyebrow">Your request</p>
                <h1 ref={heading} tabIndex={-1}>
                  Make the brief yours.
                </h1>
                <p className="lead">
                  Add who it helps, what should change and any systems it touches. A person reads it
                  and replies by email.
                </p>
                {pendingProposal && (
                  <div className="notice">
                    <p>A previous submission may need confirmation. Your current draft is safe.</p>
                    <button
                      type="button"
                      className="button secondary compact"
                      disabled={pending}
                      onClick={() => void recoverPreviousReceipt()}
                    >
                      Recover previous receipt
                    </button>
                  </div>
                )}
                {previousReceipt && (
                  <p className="feedback" role="status">
                    Previous reference: <strong>{previousReceipt}</strong>
                  </p>
                )}
                {offersAi(load.draft, Date.now()) && (
                  <div className="route-choice">
                    <div>
                      <p className="route-choice-title">Prefer to think it through first?</p>
                      <p>Explore your request with PUNI's AI. Your description comes with you.</p>
                    </div>
                    <a className="button secondary" href="/">
                      Explore with AI <span aria-hidden="true">→</span>
                    </a>
                  </div>
                )}
                <div className="field">
                  <label htmlFor="brief">What should we understand?</label>
                  <textarea
                    id="brief"
                    rows={8}
                    maxLength={briefLimit}
                    aria-describedby="brief-help"
                    value={brief}
                    onChange={(event) => {
                      setBrief(event.target.value);
                    }}
                    required
                  />
                  <div className="form-meta" id="brief-help">
                    <span>Your draft stays in this browser for 24 hours.</span>
                    <span>
                      {brief.length.toLocaleString('en')} / {briefLimit.toLocaleString('en')}
                    </span>
                  </div>
                  {brief !== load.draft.description && (
                    <details className="original">
                      <summary>Original</summary>
                      <p>{load.draft.description}</p>
                    </details>
                  )}
                  <button
                    className="button secondary compact"
                    type="button"
                    disabled={pending}
                    onClick={() => void saveBrief()}
                  >
                    Save draft
                  </button>
                </div>
                <form className="field" onSubmit={(event) => void submitProposal(event)}>
                  <label htmlFor="email">Where can we reply?</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    aria-describedby="email-help"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                    }}
                    required
                  />
                  <p className="small" id="email-help">
                    We’ll use this address to discuss your request. Submitting sends your brief to
                    our private operator inbox.
                  </p>
                  <button className="button full" disabled={pending || !brief.trim()}>
                    {pending ? 'Working…' : 'Request a human proposal'}{' '}
                    <span aria-hidden="true">↗</span>
                  </button>
                </form>
                {message && (
                  <p className="feedback" role="status">
                    {message}
                  </p>
                )}
              </>
            )}
            {view === 'receipt' && (
              <div className="state">
                <p className="eyebrow">Request received</p>
                <h1 ref={heading} tabIndex={-1}>
                  A person will review your brief.
                </h1>
                <p className="lead">
                  Your reference is <strong className="reference">{receipt}</strong>
                  Keep it for your records. It does not unlock your submitted details.
                </p>
                <div className="actions">
                  <a className="button" href={`${siteOrigin}/`}>
                    Back to PUNI <span aria-hidden="true">→</span>
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function OperatorPage() {
  const [password, setPassword] = useState('');
  const [csrf, setCsrf] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    requestJson<{ csrfToken: string }>('/operator/session')
      .then((session) => {
        setCsrf(session.csrfToken);
        void loadInbox();
      })
      .catch((error: unknown) => {
        if (!(error instanceof ApiFailure && error.status === 401))
          setMessage(describeOperatorFailure(error));
      });
  }, []);

  async function loadInbox(): Promise<void> {
    try {
      const answer = await requestJson<{ submissions: Submission[] }>('/operator/submissions');
      setSubmissions(answer.submissions);
      setCsrf((token) => token ?? '');
    } catch (error) {
      setMessage(describeOperatorFailure(error));
    }
  }

  async function signIn(event: React.SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage('');
    try {
      const answer = await requestJson<{ csrfToken: string }>('/operator/session', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setPassword('');
      setCsrf(answer.csrfToken);
      await loadInbox();
    } catch (error) {
      setMessage(describeOperatorFailure(error));
    } finally {
      setPending(false);
    }
  }

  async function advance(
    submission: Submission,
    status: 'reviewing' | 'contacted' | 'closed',
  ): Promise<void> {
    if (!csrf) return;
    try {
      await requestJson(`/operator/submissions/${submission.id}`, {
        method: 'PATCH',
        headers: { 'X-Puni-CSRF': csrf },
        body: JSON.stringify({ status }),
      });
      await loadInbox();
    } catch (error) {
      setMessage(describeOperatorFailure(error));
    }
  }

  const heading = useHeadingFocus(csrf === null ? 'signed-out' : 'inbox');
  usePageTitle(csrf === null ? 'Operator sign-in' : 'Operator inbox');

  return (
    <div className="page-shell operator-page">
      <SiteHeader tone="light" />
      <main className="operator-layout" id="main">
        <p className="eyebrow">Private workspace</p>
        <h1 ref={heading} tabIndex={-1}>
          Proposal inbox.
        </h1>
        <p className="lead">Only a configured PUNI operator can see submitted requests.</p>
        {csrf === null ? (
          <form className="operator-login" onSubmit={(event) => void signIn(event)}>
            <label htmlFor="operator-password">Operator password</label>
            <input
              id="operator-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              required
            />
            <button className="button" disabled={pending}>
              Sign in
            </button>
          </form>
        ) : (
          <>
            <GuardrailsPanel csrf={csrf} />
            <FunnelPanel />
            <div className="actions">
              <button className="button secondary compact" onClick={() => void loadInbox()}>
                Refresh inbox
              </button>
            </div>
            {submissions.length === 0 && (
              <p className="empty-state">No proposals have been submitted yet.</p>
            )}
            <div className="inbox">
              {submissions.map((submission) => (
                <article className="submission" key={submission.id}>
                  <div className="submission-head">
                    <span className="tag">{submission.status}</span>
                    <time>{new Date(submission.createdAt).toLocaleString()}</time>
                  </div>
                  <h2>{submission.email}</h2>
                  <p className="small">Original request</p>
                  <p>{submission.description}</p>
                  <p className="small">Submitted brief</p>
                  <p>{submission.brief}</p>
                  <div className="status-actions">
                    {(['reviewing', 'contacted', 'closed'] as const).map((status) => (
                      <button
                        type="button"
                        key={status}
                        className="button secondary compact"
                        disabled={submission.status === status}
                        onClick={() => void advance(submission, status)}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        {message && (
          <p className="feedback" role="status">
            {message}
          </p>
        )}
      </main>
      <OperatorFooter />
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing app root');
createRoot(root).render(
  window.location.pathname.startsWith('/operator') ? (
    <OperatorPage />
  ) : window.location.pathname.startsWith('/manual') ? (
    <AppErrorBoundary>
      <ManualPage />
    </AppErrorBoundary>
  ) : (
    <AppErrorBoundary>
      <BuildPage />
    </AppErrorBoundary>
  ),
);
