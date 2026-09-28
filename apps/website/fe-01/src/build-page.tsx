import { useChat } from '@ai-sdk/react';
import { AssistantChatTransport, useAISDKRuntime } from '@assistant-ui/ai-sdk';
import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react';
import type { UIMessage } from 'ai';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { ApiFailure, apiOrigin, requestJson } from './api';
import {
  buildReturnUrl,
  chatRequestBody,
  countPriorTurns,
  parseEntry,
  parsePendingOperation,
  type PendingOperation,
  savedOperationCompleted,
  shouldRegeneratePending,
} from './build-contract';
import { type Concept, parseConcept } from './concept';
import { ConceptPreview } from './concept-preview';

const siteOrigin = import.meta.env['VITE_SITE_ORIGIN'] ?? 'http://localhost:4321';
const pendingChatKey = 'puni_build_pending_chat';

/** Renders corrupt local recovery state explicitly instead of treating it as a missing request. */
export class BuildErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { message: string | null }
> {
  override state: { message: string | null } = { message: null };

  static getDerivedStateFromError(error: Error): { message: string } {
    return { message: error.message };
  }

  override render(): React.ReactNode {
    if (this.state.message === null) return this.props.children;
    return (
      <main className="build-layout" role="alert">
        <div className="build-state">
          <h1>Build needs your attention.</h1>
          <p>{this.state.message}</p>
          <button
            type="button"
            className="button"
            onClick={() => {
              sessionStorage.removeItem(pendingChatKey);
              window.location.reload();
            }}
          >
            Clear local recovery and retry
          </button>
        </div>
      </main>
    );
  }
}

interface Session {
  mode: 'demo' | 'oidc';
  configured: boolean;
  account: { email: string } | null;
  csrfToken?: string;
  draft?: { description: string; brief: string } | null;
}

interface Draft {
  description: string;
  brief: string;
  csrfToken: string;
}

interface ChatHistory {
  turns: { role: 'user' | 'assistant'; content: string }[];
  remainingTurns: number;
  provider: 'demo' | 'openrouter';
  requestId: string | null;
  initialOperation: {
    state: 'not-started' | 'inflight' | 'completed' | 'unknown';
    idempotencyKey: string;
    truncated: boolean;
  } | null;
  latestOperation: {
    state: 'inflight' | 'completed' | 'unknown';
    idempotencyKey: string;
    message: string;
    truncated: boolean;
  } | null;
}

type BuildLoad =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      session: Session;
      draft: Draft;
      history: ChatHistory | null;
      concept: Concept | null;
    }
  | { kind: 'error'; message: string };

function failureMessage(error: unknown): string {
  if (error instanceof ApiFailure) {
    if (error.status === 429)
      return 'The current allowance is used. You can still request human follow-up.';
    if (error.code === 'chat_inflight')
      return 'PUNI is still working on that message. Refresh the conversation before retrying.';
    if (error.code === 'chat_unsettled')
      return 'Usage for the previous attempt is still being checked. New AI turns are paused.';
    if (error.status === 503) return 'AI or sign-in is not configured in this environment.';
    return error.code.replaceAll('_', ' ');
  }
  return error instanceof Error ? error.message : 'The service could not be reached.';
}

function storedMessages(history: ChatHistory): UIMessage[] {
  return history.turns.map((turn, index) => ({
    id: `${history.requestId ?? 'request'}-${String(index)}`,
    role: turn.role,
    parts: [{ type: 'text', text: turn.content }],
  }));
}

const chatFetch = Object.assign(
  async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const response = await fetch(input, init);
    if (!response.ok) {
      const payload: unknown = await response.json();
      const code =
        typeof payload === 'object' &&
        payload !== null &&
        'code' in payload &&
        typeof payload.code === 'string'
          ? payload.code
          : `HTTP ${String(response.status)}`;
      throw new ApiFailure(response.status, code);
    }
    return response;
  },
  { preconnect: fetch.preconnect },
);

function Conversation({
  session,
  draft,
  history,
  remainingTurns,
  onAllowance,
}: {
  session: Session;
  draft: Draft;
  history: ChatHistory;
  remainingTurns: number;
  onAllowance: (remaining: number) => void;
}) {
  const [message, setMessage] = useState('');
  const [pendingIdentity, setPendingIdentity] = useState<string | null>(null);
  const [recoverable, setRecoverable] = useState<PendingOperation | null>(() =>
    history.requestId === null
      ? null
      : parsePendingOperation(
          sessionStorage.getItem(pendingChatKey),
          history.requestId,
          Date.now(),
        ),
  );
  const operations = useRef(new Map<string, string>());
  const activeOperation = useRef<string | null>(null);
  const initialSent = useRef(false);
  const initialOperation = history.initialOperation;
  const transport = useMemo(
    () =>
      new AssistantChatTransport<UIMessage>({
        api: `${apiOrigin}/chat/stream`,
        credentials: 'include',
        headers: { 'X-Puni-CSRF': session.csrfToken ?? '' },
        prepareSendMessagesRequest: ({ messages, body }) => {
          const initial = body?.['initial'] === true;
          const latest = messages.findLast((candidate) => candidate.role === 'user');
          const stored =
            history.requestId === null
              ? null
              : parsePendingOperation(
                  sessionStorage.getItem(pendingChatKey),
                  history.requestId,
                  Date.now(),
                );
          const retryKey: unknown = body?.['retryKey'];
          const identity = initial
            ? initialOperation?.idempotencyKey
            : typeof retryKey === 'string' && stored?.idempotencyKey === retryKey
              ? retryKey
              : latest === undefined
                ? undefined
                : (operations.current.get(latest.id) ?? crypto.randomUUID());
          if (identity === undefined) throw new Error('Chat operation identity is missing');
          if (!initial && latest !== undefined) operations.current.set(latest.id, identity);
          const requestBody = chatRequestBody(messages, identity, initial);
          if (history.requestId === null) throw new Error('Active request identity is missing');
          const pending: PendingOperation = {
            requestId: history.requestId,
            message: initial ? draft.description : requestBody.message,
            idempotencyKey: identity,
            initial,
            turnCount:
              stored?.idempotencyKey === identity
                ? stored.turnCount
                : countPriorTurns(messages, initial, history.turns.length),
            createdAt: stored?.idempotencyKey === identity ? stored.createdAt : Date.now(),
          };
          sessionStorage.setItem(pendingChatKey, JSON.stringify(pending));
          setRecoverable(pending);
          activeOperation.current = identity;
          setPendingIdentity(identity);
          return { body: requestBody };
        },
        fetch: chatFetch,
      }),
    [
      session.csrfToken,
      initialOperation?.idempotencyKey,
      history.requestId,
      history.turns.length,
      draft.description,
    ],
  );
  const chat = useChat({
    id: history.requestId ?? undefined,
    messages: storedMessages(history),
    transport,
    onFinish: () => {
      const finishedIdentity = activeOperation.current;
      activeOperation.current = null;
      setPendingIdentity(null);
      void requestJson<ChatHistory>('/chat')
        .then((saved) => {
          onAllowance(saved.remainingTurns);
          const pending =
            history.requestId === null
              ? null
              : parsePendingOperation(
                  sessionStorage.getItem(pendingChatKey),
                  history.requestId,
                  Date.now(),
                );
          if (
            pending?.idempotencyKey === finishedIdentity &&
            savedOperationCompleted(pending, saved.turns)
          ) {
            sessionStorage.removeItem(pendingChatKey);
            setRecoverable(null);
          }
        })
        .catch((error: unknown) => {
          setMessage(failureMessage(error));
        });
    },
    onError: (error) => {
      activeOperation.current = null;
      setPendingIdentity(null);
      setMessage(failureMessage(error));
      void requestJson<ChatHistory>('/chat')
        .then((saved) => {
          onAllowance(saved.remainingTurns);
        })
        .catch((refreshError: unknown) => {
          setMessage(`Conversation status could not be refreshed: ${failureMessage(refreshError)}`);
        });
    },
  });
  const runtime = useAISDKRuntime(chat);

  useEffect(() => {
    if (recoverable && savedOperationCompleted(recoverable, history.turns)) {
      sessionStorage.removeItem(pendingChatKey);
      setRecoverable(null);
    }
  }, [history.turns.length]);

  useEffect(() => {
    if (initialOperation?.state !== 'not-started' || initialSent.current) return;
    initialSent.current = true;
    void chat.sendMessage({ text: draft.description }, { body: { initial: true } });
  }, [initialOperation?.state, draft.description]);

  async function cancel(): Promise<void> {
    const identity = activeOperation.current;
    if (identity === null) return;
    await chat.stop();
    try {
      await requestJson('/chat/cancel', {
        method: 'POST',
        headers: { 'X-Puni-CSRF': session.csrfToken ?? '' },
        body: JSON.stringify({ idempotencyKey: identity }),
      });
      setMessage('Response stopped. Usage for an interrupted call stays reserved until checked.');
    } catch (error) {
      setMessage(`The stop request needs attention: ${failureMessage(error)}`);
    } finally {
      activeOperation.current = null;
      setPendingIdentity(null);
      void requestJson<ChatHistory>('/chat')
        .then((saved) => {
          onAllowance(saved.remainingTurns);
        })
        .catch((error: unknown) => {
          setMessage(failureMessage(error));
        });
    }
  }

  function retryPending(): void {
    if (!recoverable) return;
    setMessage('');
    const body = recoverable.initial ? { initial: true } : { retryKey: recoverable.idempotencyKey };
    if (shouldRegeneratePending(chat.messages, recoverable)) {
      void chat.regenerate({ body });
    } else {
      void chat.sendMessage({ text: recoverable.message }, { body });
    }
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section className="build-chat" aria-label="Conversation with PUNI">
        <div className="build-section-head">
          <span className="eyebrow">01 / CONVERSATION</span>
          <h2>Shape the work together.</h2>
          <p>
            Ask about the people, workflow and useful first release. PUNI cannot agree to a price or
            delivery date.
          </p>
        </div>
        {history.provider === 'demo' && (
          <p className="build-notice">Local demo replies are simulated. They are not OpenRouter.</p>
        )}
        {initialOperation?.state === 'inflight' && (
          <p className="build-notice">
            Your opening request is still being processed.{' '}
            <button
              className="text-button"
              type="button"
              onClick={() =>
                void chat.sendMessage({ text: draft.description }, { body: { initial: true } })
              }
            >
              Check the same attempt
            </button>
          </p>
        )}
        {initialOperation?.state === 'unknown' && (
          <p className="build-notice">
            The first AI call has unconfirmed usage. New paid turns are paused while it is reviewed.
          </p>
        )}
        {history.latestOperation?.state === 'unknown' &&
          history.latestOperation.idempotencyKey !== initialOperation?.idempotencyKey && (
            <p className="build-notice">
              The last AI call has unconfirmed usage. New paid turns are paused while it is
              reviewed.
            </p>
          )}
        {history.latestOperation?.truncated && (
          <p className="build-notice">The last response stopped at the provider’s output limit.</p>
        )}
        <ThreadPrimitive.Root className="build-thread">
          <ThreadPrimitive.Viewport className="build-messages">
            <AuiIf condition={(state) => state.thread.isEmpty}>
              <p className="chat-empty">
                Your Home request will appear as the first conversation turn after sign-in.
              </p>
            </AuiIf>
            <ThreadPrimitive.Messages>
              {({ message: turn }) => (
                <MessagePrimitive.Root
                  className={`build-message ${turn.role === 'user' ? 'user' : 'assistant'}`}
                >
                  <span>{turn.role === 'user' ? 'YOU' : 'PUNI'}</span>
                  <MessagePrimitive.Parts />
                </MessagePrimitive.Root>
              )}
            </ThreadPrimitive.Messages>
          </ThreadPrimitive.Viewport>
          <div className="build-compose">
            <ComposerPrimitive.Root>
              <label htmlFor="build-message">Your message</label>
              <ComposerPrimitive.Input
                id="build-message"
                placeholder="What should the first version help people do?"
                maxLength={4000}
              />
              <div className="build-compose-actions">
                <span>{remainingTurns} turns available</span>
                <ComposerPrimitive.Send
                  className="button"
                  disabled={
                    remainingTurns === 0 ||
                    initialOperation?.state === 'unknown' ||
                    history.latestOperation?.state === 'unknown'
                  }
                >
                  Send <span aria-hidden="true">↗</span>
                </ComposerPrimitive.Send>
                {pendingIdentity && (
                  <button type="button" className="text-button" onClick={() => void cancel()}>
                    Stop response
                  </button>
                )}
              </div>
            </ComposerPrimitive.Root>
          </div>
        </ThreadPrimitive.Root>
        {recoverable && !pendingIdentity && chat.status !== 'streaming' && (
          <button className="text-button" type="button" onClick={retryPending}>
            Retry the same message
          </button>
        )}
        {message && (
          <p className="feedback" role="status">
            {message}
          </p>
        )}
      </section>
    </AssistantRuntimeProvider>
  );
}

export function BuildPage({
  Header,
  Footer,
}: {
  Header: () => React.JSX.Element;
  Footer: () => React.JSX.Element;
}) {
  const [load, setLoad] = useState<BuildLoad>({ kind: 'loading' });
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [remainingTurns, setRemainingTurns] = useState(0);
  const [revisionFeedback, setRevisionFeedback] = useState('');
  const [panel, setPanel] = useState<'chat' | 'brief'>('chat');

  async function loadBuild(): Promise<void> {
    setLoad({ kind: 'loading' });
    const controller = new AbortController();
    // Proof: a held /entry request left Checking visible past 13 seconds; the timeout browser fault now requires a retryable error.
    const deadline = window.setTimeout(() => {
      controller.abort();
    }, 10_000);
    try {
      const entry = parseEntry(await requestJson<unknown>('/entry', { signal: controller.signal }));
      if (!entry.available) {
        window.location.replace(buildReturnUrl(siteOrigin, entry.reason));
        return;
      }
      const session = await requestJson<Session>('/session', { signal: controller.signal });
      if (session.account && !session.csrfToken)
        throw new Error('Account session lacks a CSRF token');
      const draft: Draft = session.draft
        ? { ...session.draft, csrfToken: session.csrfToken ?? '' }
        : await requestJson<Draft>('/draft', { signal: controller.signal });
      const history = session.account
        ? await requestJson<ChatHistory>('/chat', { signal: controller.signal })
        : null;
      const concept = session.account
        ? await requestJson<unknown>('/concept', { signal: controller.signal })
            .then(parseConcept)
            .catch((error: unknown) => {
              if (error instanceof ApiFailure && error.status === 404) return null;
              throw error;
            })
        : null;
      setRemainingTurns(history?.remainingTurns ?? 0);
      setLoad({ kind: 'ready', session, draft, history, concept });
    } catch (error) {
      setLoad({
        kind: 'error',
        message: controller.signal.aborted
          ? 'Build did not respond within 10 seconds. Try again.'
          : failureMessage(error),
      });
    } finally {
      window.clearTimeout(deadline);
    }
  }

  useEffect(() => {
    void loadBuild();
  }, []);

  async function signInDemo(event: React.SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    try {
      await requestJson('/session/demo', { method: 'POST', body: JSON.stringify({ email }) });
      await loadBuild();
    } catch (error) {
      setMessage(failureMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function generateConcept(session: Session): Promise<void> {
    setPending(true);
    setMessage('');
    try {
      const concept = parseConcept(
        await requestJson<unknown>('/concept', {
          method: 'POST',
          headers: { 'X-Puni-CSRF': session.csrfToken ?? '' },
          body: JSON.stringify({}),
        }),
      );
      setLoad((current) => (current.kind === 'ready' ? { ...current, concept } : current));
    } catch (error) {
      setMessage(failureMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function reviseConcept(
    event: React.SubmitEvent<HTMLFormElement>,
    session: Session,
  ): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage('');
    try {
      const concept = parseConcept(
        await requestJson<unknown>('/concept/revision', {
          method: 'POST',
          headers: { 'X-Puni-CSRF': session.csrfToken ?? '' },
          body: JSON.stringify({ feedback: revisionFeedback }),
        }),
      );
      setLoad((current) => (current.kind === 'ready' ? { ...current, concept } : current));
      setRevisionFeedback('');
    } catch (error) {
      setMessage(failureMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-shell build-page">
      <Header />
      <main
        className={
          load.kind === 'ready' && load.session.account
            ? 'build-layout workspace-active'
            : 'build-layout'
        }
        id="main"
      >
        <div className="build-intro">
          <p className="eyebrow">PUNI / BUILD</p>
          <h1>Let’s build what matters.</h1>
          <p>
            Your request stays with you. Explore it with PUNI, preview an interface, or ask a person
            to take it forward.
          </p>
        </div>
        {load.kind === 'loading' && (
          <p className="build-state" role="status">
            Checking your request…
          </p>
        )}
        {load.kind === 'error' && (
          <div className="build-state" role="alert">
            <h2>We couldn’t load Build.</h2>
            <p>{load.message}</p>
            <button className="button" onClick={() => void loadBuild()}>
              Try again
            </button>
          </div>
        )}
        {load.kind === 'ready' && !load.session.account && (
          <div className="build-entry-grid">
            <section className="build-request-card">
              <span className="eyebrow">YOUR REQUEST</span>
              <h2>It’s here when you’re ready.</h2>
              <p>{load.draft.description}</p>
              <a className="text-button" href="/manual">
                Continue a manual brief →
              </a>
            </section>
            <section className="build-signin-card">
              <span className="eyebrow">NEXT STEP</span>
              <h2>Make it yours.</h2>
              {load.session.mode === 'oidc' && load.session.configured ? (
                <>
                  <p>
                    Sign in with Google to keep this request with your account before any AI call.
                  </p>
                  <a className="button" href={`${apiOrigin}/session/oidc/start`}>
                    Continue with Google →
                  </a>
                </>
              ) : load.session.mode === 'demo' ? (
                <>
                  <p>
                    This local test sign-in does not verify your identity. The provider is shown in
                    the conversation after sign-in.
                  </p>
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
                </>
              ) : (
                <>
                  <p>
                    Google sign-in is not configured in this environment. Your request can still go
                    to a person.
                  </p>
                  <a className="button" href="/manual">
                    Continue your brief →
                  </a>
                </>
              )}
            </section>
          </div>
        )}
        {load.kind === 'ready' && load.session.account && load.history && (
          <>
            <div className="build-mobile-switch" role="group" aria-label="Build panels">
              <button
                type="button"
                aria-pressed={panel === 'chat'}
                onClick={() => {
                  setPanel('chat');
                }}
              >
                Conversation
              </button>
              <button
                type="button"
                aria-pressed={panel === 'brief'}
                onClick={() => {
                  setPanel('brief');
                }}
              >
                Brief & preview
              </button>
            </div>
            <div className="build-workspace">
              <div className={panel === 'chat' ? 'build-panel active' : 'build-panel'}>
                <Conversation
                  key={load.history.requestId ?? 'current'}
                  session={load.session}
                  draft={load.draft}
                  history={load.history}
                  remainingTurns={remainingTurns}
                  onAllowance={setRemainingTurns}
                />
              </div>
              <aside
                className={
                  panel === 'brief' ? 'build-panel active build-side' : 'build-panel build-side'
                }
              >
                <div className="build-section-head">
                  <span className="eyebrow">02 / YOUR BRIEF</span>
                  <h2>What we heard.</h2>
                  <p>{load.draft.description}</p>
                  {load.draft.brief && load.draft.brief !== load.draft.description && (
                    <p>{load.draft.brief}</p>
                  )}
                </div>
                <div className="build-allowance">
                  <span>{remainingTurns} AI turns left</span>
                  <span>
                    {load.history.provider === 'demo' ? 'Local demo reply' : 'AI assisted'}
                  </span>
                </div>
                <section className="build-concept">
                  <span className="eyebrow">03 / CONCEPT</span>
                  <h2>See a possible shape.</h2>
                  <p>Illustrative preview. Actions here do not create real bookings or accounts.</p>
                  {!load.concept && (
                    <button
                      className="text-button"
                      disabled={pending}
                      onClick={() => void generateConcept(load.session)}
                    >
                      Create concept preview →
                    </button>
                  )}
                  {load.concept && (
                    <>
                      <ConceptPreview concept={load.concept} />
                      {load.concept.revision === 0 && (
                        <form
                          className="revision-form"
                          onSubmit={(event) => void reviseConcept(event, load.session)}
                        >
                          <label htmlFor="revision-feedback">What would you change?</label>
                          <input
                            id="revision-feedback"
                            maxLength={300}
                            value={revisionFeedback}
                            onChange={(event) => {
                              setRevisionFeedback(event.target.value);
                            }}
                            required
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
                </section>
                <div className="build-followup">
                  <h2>Ready to talk?</h2>
                  <p>Human follow-up is available even if you don’t use the AI allowance.</p>
                  <a className="button" href="/manual">
                    Discuss this project with PUNI →
                  </a>
                </div>
              </aside>
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
