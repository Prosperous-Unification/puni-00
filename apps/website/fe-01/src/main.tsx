import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { ApiFailure, apiOrigin, requestJson } from './api';
import { type Concept, parseConcept } from './concept';
import { ConceptPreview } from './concept-preview';
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

interface Session {
  mode: 'demo' | 'oidc';
  configured: boolean;
  account: { email: string } | null;
  csrfToken?: string;
  draft?: { description: string; brief: string } | null;
}
interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}
interface ChatHistory {
  turns: ChatTurn[];
  remainingTurns: number;
}

function StudioPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [composer, setComposer] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [remainingTurns, setRemainingTurns] = useState(0);
  const [concept, setConcept] = useState<Concept | null>(null);
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      requestJson<Session>('/session'),
      requestJson<Draft>('/draft').catch((error: unknown) => {
        if (error instanceof ApiFailure && error.status === 401) return null;
        throw error;
      }),
    ])
      .then(([account, draft]) => {
        setSession(account);
        if (draft) setComposer(draft.description);
        if (account.draft?.description) setComposer(account.draft.description);
        if (account.account) {
          void loadChat();
          void loadConcept();
        }
      })
      .catch((error: unknown) => {
        setMessage(failureMessage(error));
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function loadChat(): Promise<void> {
    try {
      const history = await requestJson<ChatHistory>('/chat');
      setTurns(history.turns);
      if (history.turns.length > 0) setComposer('');
      setRemainingTurns(history.remainingTurns);
    } catch (error) {
      setMessage(failureMessage(error));
    }
  }

  async function loadConcept(): Promise<void> {
    try {
      setConcept(parseConcept(await requestJson<unknown>('/concept')));
    } catch (error) {
      if (!(error instanceof ApiFailure && error.status === 404)) setMessage(failureMessage(error));
    }
  }

  async function signInDemo(event: React.SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage('');
    try {
      const account = await requestJson<Session>('/session/demo', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSession(account);
      if (account.draft?.description) setComposer(account.draft.description);
      await loadChat();
      await loadConcept();
    } catch (error) {
      setMessage(failureMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function sendMessage(event: React.SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const outgoing = composer.trim();
    if (!outgoing || pending) return;
    setPending(true);
    setMessage('');
    try {
      const answer = await requestJson<{
        reply: string;
        remainingTurns: number;
        provider: 'demo' | 'openrouter';
      }>('/chat', {
        method: 'POST',
        headers: { 'X-Puni-CSRF': session?.csrfToken ?? '' },
        body: JSON.stringify({ message: outgoing }),
      });
      setTurns((existing) => [
        ...existing,
        { role: 'user', content: outgoing },
        { role: 'assistant', content: answer.reply },
      ]);
      setRemainingTurns(answer.remainingTurns);
      setComposer('');
      if (answer.provider === 'demo')
        setMessage('This response came from the local demo provider. It is not OpenRouter.');
    } catch (error) {
      setMessage(failureMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function generateConcept(): Promise<void> {
    setPending(true);
    setMessage('');
    try {
      const preview = await requestJson<unknown>('/concept', {
        method: 'POST',
        headers: { 'X-Puni-CSRF': session?.csrfToken ?? '' },
        body: JSON.stringify({}),
      });
      setConcept(parseConcept(preview));
    } catch (error) {
      setMessage(failureMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function reviseConcept(event: React.SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage('');
    try {
      const revised = await requestJson<unknown>('/concept/revision', {
        method: 'POST',
        headers: { 'X-Puni-CSRF': session?.csrfToken ?? '' },
        body: JSON.stringify({ feedback: revisionFeedback }),
      });
      setConcept(parseConcept(revised));
      setRevisionFeedback('');
    } catch (error) {
      setMessage(failureMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-shell">
      <Header />
      <main className="studio-layout" id="main">
        <p className="eyebrow">PRIVATE EXPLORATION</p>
        <h1>Explore your idea.</h1>
        <p>
          Clarify the work, then ask a person for a proposal. Your original description is ready in
          the composer and is sent only when you press Send.
        </p>
        {loading && <p role="status">Checking account and provider availability…</p>}
        {!loading && session && !session.configured && (
          <div className="future-panel">
            <span className="tag">Unavailable here</span>
            <h2>AI scoping needs setup.</h2>
            <p>
              Identity or inference has not been configured. Your manual brief remains available.
            </p>
            <a className="button" href="/manual">
              Continue your brief <span aria-hidden>→</span>
            </a>
          </div>
        )}
        {!loading && session?.configured && !session.account && session.mode === 'demo' && (
          <div className="future-panel">
            <span className="tag">Local demonstration</span>
            <h2>Try a demo account.</h2>
            <p>This local account is for testing the journey. It does not verify your identity.</p>
            <form onSubmit={(event) => void signInDemo(event)}>
              <label htmlFor="demo-email">Demo email</label>
              <input
                id="demo-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                required
              />
              <button className="button" disabled={pending}>
                Enter local demo
              </button>
            </form>
          </div>
        )}
        {!loading && session?.configured && !session.account && session.mode === 'oidc' && (
          <div className="future-panel">
            <span className="tag">Account required</span>
            <h2>Sign in to continue.</h2>
            <p>Your manual brief is still available while account sign-in is configured.</p>
            <a className="button" href={`${apiOrigin}/session/oidc/start`}>
              Sign in with PUNI <span aria-hidden>→</span>
            </a>
            <p className="small">
              <a href="/manual">Continue your manual brief</a>
            </p>
          </div>
        )}
        {session?.account && (
          <div className="studio-workspace">
            <div className="studio-head">
              <div>
                <span className="tag">
                  {session.mode === 'demo' ? 'Local demo identity' : 'PUNI account'}
                </span>
                <p className="small">{session.account.email}</p>
              </div>
              <span className="allowance">{remainingTurns} turns left</span>
            </div>
            <div className="chat-log" aria-live="polite">
              {turns.length === 0 && (
                <p className="chat-empty">
                  Start with the request you brought over, or ask about users, workflows and a
                  useful first release.
                </p>
              )}
              {turns.map((turn, index) => (
                <div className={`chat-turn ${turn.role}`} key={`${String(index)}-${turn.role}`}>
                  <span>{turn.role === 'user' ? 'YOU' : 'PUNI EXPLORATION'}</span>
                  <p>{turn.content}</p>
                </div>
              ))}
            </div>
            <form onSubmit={(event) => void sendMessage(event)}>
              <label htmlFor="chat-message">Your message</label>
              <textarea
                id="chat-message"
                rows={5}
                maxLength={4000}
                value={composer}
                onChange={(event) => {
                  setComposer(event.target.value);
                }}
                placeholder="Describe the people, workflow, or first feature you have in mind."
                required
              />
              <div className="form-meta">
                <span>Press Send to begin. AI cannot agree to price or delivery.</span>
                <span>{composer.length}/4000</span>
              </div>
              <button
                className="button"
                disabled={pending || remainingTurns === 0 || !composer.trim()}
              >
                {pending ? 'Working…' : 'Send message'} <span aria-hidden>↗</span>
              </button>
            </form>
            <div className="concept-tools">
              <h2>Interface concept</h2>
              <p>
                Generate a bounded interactive concept from your request. It is illustrative and any
                sign-in shown is simulated.
              </p>
              {!concept && (
                <button
                  className="text-button"
                  disabled={pending}
                  onClick={() => void generateConcept()}
                >
                  Create concept preview
                </button>
              )}
              {concept && (
                <>
                  <ConceptPreview concept={concept} />
                  {concept.revision === 0 && (
                    <form className="revision-form" onSubmit={(event) => void reviseConcept(event)}>
                      <label htmlFor="revision-feedback">What would you change?</label>
                      <input
                        id="revision-feedback"
                        maxLength={300}
                        value={revisionFeedback}
                        onChange={(event) => {
                          setRevisionFeedback(event.target.value);
                        }}
                        required
                        placeholder="For example, make the staff view more prominent"
                      />
                      <button
                        className="text-button"
                        disabled={pending || !revisionFeedback.trim()}
                      >
                        Request one revision
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
            <div className="future-panel">
              <h2>Ready for human review?</h2>
              <p>You can submit your brief now, whether or not you use every turn or a preview.</p>
              <a className="button" href="/manual">
                Request a proposal <span aria-hidden>→</span>
              </a>
            </div>
          </div>
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
      <a className="brand" href={`${siteOrigin}/`} aria-label="Prosperous Unification home">
        <span className="brand-mark">
          P<span>U</span>
        </span>
        <span>
          PROSPEROUS
          <br />
          UNIFICATION
        </span>
      </a>
      <nav aria-label="Primary">
        <a href={`${siteOrigin}/services/`}>Services</a>
        <a href={`${siteOrigin}/blog/`}>Journal</a>
        <a href="/manual">Your request</a>
      </nav>
    </header>
  );
}
function Footer() {
  return (
    <footer className="site-footer">
      <span>© Prosperous Unification</span>
      <span>Software shaped around real work.</span>
    </footer>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing app root');
createRoot(root).render(
  window.location.pathname.startsWith('/operator') ? (
    <OperatorPage />
  ) : window.location.pathname.startsWith('/studio') ? (
    <StudioPage />
  ) : (
    <ManualPage />
  ),
);
