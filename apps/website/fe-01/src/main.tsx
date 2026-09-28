import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { ApiFailure, requestJson } from './api';
import { BuildErrorBoundary, BuildPage } from './build-page';
const siteOrigin = import.meta.env['VITE_SITE_ORIGIN'] ?? 'http://localhost:4321';
import './style.css';

interface Draft {
  description: string;
  brief: string;
  csrfToken: string;
  expiresAt: string;
}
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

function failureMessage(error: unknown): string {
  if (error instanceof ApiFailure) {
    if (error.status === 429) return 'Too many attempts. Please wait and try again.';
    if (error.status === 503) return 'This feature is not configured in this environment.';
    return error.code.replaceAll('_', ' ');
  }
  return 'The service could not be reached. Check that the API is running and try again.';
}

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
    requestJson<Draft>('/draft')
      .then((draft) => {
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
              message: `Your previous submission needs confirmation. ${failureMessage(replayError)}`,
            });
          }
          return;
        }
        setLoad(
          error instanceof ApiFailure && error.status === 401
            ? { kind: 'recover' }
            : { kind: 'error', message: failureMessage(error) },
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
      setMessage(failureMessage(error));
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
      setMessage(failureMessage(error));
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
      setMessage(failureMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-shell">
      <Header />
      <main className="manual-layout" id="main">
        <aside className="context-panel">
          <p className="eyebrow">01 / REQUEST</p>
          <h1>
            Shape the work.
            <br />
            <em>We’ll take it from here.</em>
          </h1>
          <p>
            Tell us what you need. A person reviews every proposal request; this page does not
            promise a price or delivery date.
          </p>
          <div className="steps">
            <span className="step active">Describe</span>
            <span className="step active">Review</span>
            <span className="step">Human follow-up</span>
          </div>
          <p className="privacy-note">
            Your draft is available in this browser for 24 hours. Read our{' '}
            <a href={`${siteOrigin}/privacy/`}>privacy information</a> for how request details are
            handled.
          </p>
        </aside>
        <section className="form-panel" aria-live="polite">
          {!receipt && load.kind === 'loading' && (
            <div className="state">
              <div className="spinner" />
              Retrieving your request…
            </div>
          )}
          {!receipt && load.kind === 'recover' && (
            <div className="state">
              <p className="eyebrow">DRAFT UNAVAILABLE</p>
              <h2>Let’s start with your request.</h2>
              <p>The draft expired or belongs to another browser.</p>
              <a className="button" href={`${siteOrigin}/#request`}>
                Start again
              </a>
            </div>
          )}
          {!receipt && load.kind === 'error' && (
            <div className="state">
              <h2>We couldn’t load your request.</h2>
              <p>{load.message}</p>
              <button
                className="button"
                onClick={() => {
                  window.location.reload();
                }}
              >
                Try again
              </button>
            </div>
          )}
          {load.kind === 'ready' && !receipt && (
            <>
              <p className="eyebrow">YOUR REQUEST</p>
              <h2>Make the brief yours.</h2>
              {pendingProposal && (
                <div className="previous-proposal">
                  <p>A previous submission may need confirmation. Your current draft is safe.</p>
                  <button
                    type="button"
                    className="text-button"
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
              <div className="route-choice">
                <div>
                  <span className="tag">Optional AI exploration</span>
                  <h3>Think it through first.</h3>
                  <p>
                    Sign in to scope the request and try a concept when this environment is
                    configured. Your description comes with you.
                  </p>
                </div>
                <a className="button" href="/studio">
                  Explore with AI <span aria-hidden>→</span>
                </a>
              </div>
              <label htmlFor="original">Your original description</label>
              <div className="original" id="original">
                {load.draft.description}
              </div>
              <label htmlFor="brief">What should we understand?</label>
              <textarea
                id="brief"
                rows={8}
                maxLength={4000}
                value={brief}
                onChange={(event) => {
                  setBrief(event.target.value);
                }}
                required
              />
              <div className="form-meta">
                <span>Include who it helps, what should change, and any existing systems.</span>
                <span>{brief.length}/4000</span>
              </div>
              <button
                className="text-button"
                type="button"
                disabled={pending}
                onClick={() => void saveBrief()}
              >
                Save draft
              </button>
              <form onSubmit={(event) => void submitProposal(event)}>
                <label htmlFor="email">Where can we reply?</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                  }}
                  required
                />
                <p className="small">
                  We’ll use this address to discuss your request. Submitting sends your brief to our
                  private operator inbox.
                </p>
                <button className="button full" disabled={pending || !brief.trim()}>
                  {pending ? 'Working…' : 'Request a human proposal'} <span aria-hidden>↗</span>
                </button>
              </form>
              {message && (
                <p className="feedback" role="status">
                  {message}
                </p>
              )}
              <div className="future-panel">
                <span className="tag">Optional exploration</span>
                <h3>Want to think it through first?</h3>
                <p>
                  AI scoping and concept preview appear here when the private account and provider
                  are configured. You can request a proposal now.
                </p>
                <a href="/studio">
                  Explore available tools <span aria-hidden>→</span>
                </a>
              </div>
            </>
          )}
          {receipt && (
            <div className="state">
              <p className="eyebrow">REQUEST RECEIVED</p>
              <h2>A person will review your brief.</h2>
              <p>
                Your reference is <strong>{receipt}</strong>
                <span>Keep it for your records. It does not unlock your submitted details.</span>
              </p>
              <a className="button" href={`${siteOrigin}/`}>
                Back to PUNI
              </a>
            </div>
          )}
        </section>
      </main>
      <Footer />
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
          setMessage(failureMessage(error));
      });
  }, []);

  async function loadInbox(): Promise<void> {
    try {
      const answer = await requestJson<{ submissions: Submission[] }>('/operator/submissions');
      setSubmissions(answer.submissions);
      setCsrf((token) => token ?? '');
    } catch (error) {
      setMessage(failureMessage(error));
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
      setMessage(failureMessage(error));
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
      setMessage(failureMessage(error));
    }
  }

  return (
    <div className="page-shell">
      <Header />
      <main className="operator-layout" id="main">
        <p className="eyebrow">PRIVATE WORKSPACE / OPERATOR</p>
        <h1>Proposal inbox.</h1>
        <p>Only a configured PUNI operator can see submitted requests.</p>
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
            <button className="text-button" onClick={() => void loadInbox()}>
              Refresh inbox
            </button>
            {submissions.length === 0 && <p>No proposals have been submitted yet.</p>}
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
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="site-header">
      <a className="brand" href={`${siteOrigin}/`} aria-label="PUNI home">
        <span>
          PUNI
          <span className="brand-dot" aria-hidden="true">
            ●
          </span>
        </span>
      </a>
      <nav aria-label="Primary">
        <a href={`${siteOrigin}/`}>[1] Home</a>
        <a href="/">[2] Build</a>
        <a href={`${siteOrigin}/services/`}>[3] Services</a>
        <a href={`${siteOrigin}/blog/`}>[4] Blog</a>
      </nav>
    </header>
  );
}
function Footer() {
  return (
    <footer className="site-footer">
      <span>© PUNI</span>
      <span>Software shaped around real work.</span>
    </footer>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing app root');
createRoot(root).render(
  window.location.pathname.startsWith('/operator') ? (
    <OperatorPage />
  ) : window.location.pathname.startsWith('/manual') ? (
    <ManualPage />
  ) : (
    <BuildErrorBoundary>
      <BuildPage Header={Header} Footer={Footer} />
    </BuildErrorBoundary>
  ),
);
