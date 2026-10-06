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

import { ApiFailure, apiOrigin, requestJson, sendCommand, streamFetch } from './api';
import { describeFailure, signInRoute } from './app-flow';
import {
  buildReturnUrl,
  chatRequestBody,
  type Conversation,
  countPriorTurns,
  parseEntry,
  parsePendingOperation,
  type PendingOperation,
  resolveAnonymousHarness,
  savedOperationCompleted,
  shouldRegeneratePending,
  startOverUrl,
} from './build-contract';
import { HeroMedia, SiteHeader, siteOrigin, useHeadingFocus, usePageTitle } from './chrome';
import { LiveHarness } from './conversation-harness';
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
      <main className="build-layout boundary" role="alert" id="main">
        <div className="build-state">
          <p className="eyebrow">Build</p>
          <h1>Build needs your attention.</h1>
          <p className="lead">{this.state.message}</p>
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
  | { kind: 'account'; session: Session; draft: Draft; history: ChatHistory }
  | {
      kind: 'anonymous';
      session: Session;
      harness: 'disabled' | 'live';
      conversation: Conversation;
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
  }
  return describeFailure(error);
}

function storedMessages(history: ChatHistory): UIMessage[] {
  return history.turns.map((turn, index) => ({
    id: `${history.requestId ?? 'request'}-${String(index)}`,
    role: turn.role,
    parts: [{ type: 'text', text: turn.content }],
  }));
}

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
  const [initialCompleted, setInitialCompleted] = useState(false);
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
        fetch: streamFetch,
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
          if (saved.initialOperation?.state === 'completed') setInitialCompleted(true);
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
      initialSent.current = false;
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
  // Proof: the browser test failed on the old mount effect with one stream POST before Send.
  // Its dropped-POST fault also failed when reload exposed the ordinary composer before the first turn.
  const awaitingInitialCompletion =
    initialOperation !== null && initialOperation.state !== 'completed' && !initialCompleted;

  useEffect(() => {
    if (recoverable && savedOperationCompleted(recoverable, history.turns)) {
      sessionStorage.removeItem(pendingChatKey);
      setRecoverable(null);
    }
  }, [history.turns.length]);

  function sendInitial(): void {
    if (initialSent.current) return;
    initialSent.current = true;
    setMessage('');
    // Proof: the failed browser pending-state write duplicated the Home row when retry sent a second optimistic user message.
    const initialAttempt = chat.messages.some((turn) => turn.role === 'user')
      ? chat.regenerate({ body: { initial: true } })
      : chat.sendMessage({ text: draft.description }, { body: { initial: true } });
    void initialAttempt.catch((error: unknown) => {
      // Proof: the browser's failed pending-write case requires the initial Send button to recover without reload.
      initialSent.current = false;
      setMessage(failureMessage(error));
    });
  }

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

  const status =
    chat.status === 'submitted' ? 'Thinking…' : chat.status === 'streaming' ? 'Writing…' : message;
  const isBusy = pendingIdentity !== null || chat.status === 'submitted';

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="harness-root">
        <ThreadPrimitive.Viewport className="harness-thread" aria-label="Conversation with PUNI">
          <div className="harness-column">
            <HarnessEyebrow />
            {history.provider === 'demo' && (
              <p className="harness-notice">
                Local demo replies are simulated. They are not OpenRouter.
              </p>
            )}
            {initialOperation?.state === 'inflight' && (
              <div className="harness-notice">
                <p>Your opening request is still being processed.</p>
                <button
                  className="harness-text-button"
                  type="button"
                  onClick={() =>
                    void chat.sendMessage({ text: draft.description }, { body: { initial: true } })
                  }
                >
                  [ Check the same attempt ]
                </button>
              </div>
            )}
            {initialOperation?.state === 'unknown' && (
              <p className="harness-notice">
                The first AI call has unconfirmed usage. New paid turns are paused while it is
                reviewed.
              </p>
            )}
            {history.latestOperation?.state === 'unknown' &&
              history.latestOperation.idempotencyKey !== initialOperation?.idempotencyKey && (
                <p className="harness-notice">
                  The last AI call has unconfirmed usage. New paid turns are paused while it is
                  reviewed.
                </p>
              )}
            {history.latestOperation?.truncated && (
              <p className="harness-notice">
                The last response stopped at the provider’s output limit.
              </p>
            )}
            <AuiIf condition={(state) => state.thread.isEmpty}>
              <p className="harness-empty">
                {initialOperation?.state === 'not-started' && !recoverable
                  ? 'Your Home request is ready below. Press Send when you want to start the conversation.'
                  : 'Your opening request is shown below. Check its status before sending another message.'}
              </p>
            </AuiIf>
            <ThreadPrimitive.Messages>
              {({ message: turn }) => (
                <MessagePrimitive.Root
                  className={`build-message ${turn.role === 'user' ? 'user' : 'assistant'}`}
                >
                  <span className="message-label">{turn.role === 'user' ? 'YOU' : 'PUNI'}</span>
                  <MessagePrimitive.Parts />
                </MessagePrimitive.Root>
              )}
            </ThreadPrimitive.Messages>
          </div>
        </ThreadPrimitive.Viewport>
        <div className="harness-dock">
          <div className="harness-column">
            <p className="harness-status" role="status">
              {status}
            </p>
            {recoverable && !pendingIdentity && chat.status !== 'streaming' && (
              <button className="harness-text-button" type="button" onClick={retryPending}>
                Retry the same message
              </button>
            )}
            <ComposerPrimitive.Root className="harness-composer">
              <div
                className={
                  awaitingInitialCompletion && !pendingIdentity
                    ? 'glass-field has-pill'
                    : 'glass-field'
                }
              >
                {awaitingInitialCompletion ? (
                  <>
                    <label className="visually-hidden" htmlFor="build-message">
                      Your request
                    </label>
                    <textarea id="build-message" value={draft.description} readOnly rows={3} />
                  </>
                ) : (
                  <>
                    <label className="visually-hidden" htmlFor="build-message">
                      Your message
                    </label>
                    <ComposerPrimitive.Input
                      id="build-message"
                      placeholder="Reply to PUNI…"
                      maxLength={4000}
                      minRows={1}
                      maxRows={3}
                    />
                  </>
                )}
                {pendingIdentity ? (
                  <button
                    type="button"
                    className="composer-round composer-stop"
                    aria-label="Stop response"
                    onClick={() => void cancel()}
                  >
                    <span className="stop-glyph" aria-hidden="true"></span>
                  </button>
                ) : awaitingInitialCompletion ? (
                  <button
                    className="composer-send-pill"
                    type="button"
                    disabled={
                      initialOperation.state !== 'not-started' ||
                      remainingTurns === 0 ||
                      isBusy ||
                      recoverable !== null
                    }
                    onClick={sendInitial}
                  >
                    Send <span aria-hidden="true">↗</span>
                  </button>
                ) : (
                  <ComposerPrimitive.Send
                    className="composer-round"
                    aria-label="Send message"
                    disabled={
                      remainingTurns === 0 ||
                      initialOperation?.state === 'unknown' ||
                      history.latestOperation?.state === 'unknown'
                    }
                  >
                    <SendArrow />
                  </ComposerPrimitive.Send>
                )}
              </div>
              <p className="harness-meta">
                <span>{remainingTurns} turns available</span>
                <span className="harness-shortcut">
                  Enter to send · Shift + Enter for a new line
                </span>
              </p>
            </ComposerPrimitive.Root>
          </div>
        </div>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function SendArrow() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M12 19V5m-6 6 6-6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HarnessEyebrow() {
  return <p className="harness-eyebrow">[ AI can do everything. It doesn’t want anything. ]</p>;
}

/**
 * Discards the browser's saved request after an inline confirmation, then lands on the site's
 * empty Home prompt. Only an anonymous draft can be discarded; the API refuses a consumed one.
 */
function StartOver({ csrfToken }: { csrfToken: string }) {
  const [isConfirming, setConfirming] = useState(false);
  const [isPending, setPending] = useState(false);
  const [failure, setFailure] = useState('');
  const keep = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const hasOpened = useRef(false);

  useEffect(() => {
    if (isConfirming) {
      hasOpened.current = true;
      keep.current?.focus();
    } else if (hasOpened.current) trigger.current?.focus();
  }, [isConfirming]);

  async function discard(): Promise<void> {
    setPending(true);
    setFailure('');
    try {
      await sendCommand('/draft/discard', {
        method: 'POST',
        headers: { 'X-Puni-CSRF': csrfToken },
        body: JSON.stringify({}),
      });
      window.location.assign(startOverUrl(siteOrigin));
    } catch (error) {
      setFailure(describeFailure(error));
      setPending(false);
    }
  }

  if (!isConfirming)
    return (
      <button
        ref={trigger}
        type="button"
        className="harness-text-button"
        onClick={() => {
          setConfirming(true);
        }}
      >
        [ Start over ]
      </button>
    );
  return (
    <div className="start-over-confirm" role="group" aria-label="Start over">
      <span>Discard this request?</span>
      <button
        ref={keep}
        type="button"
        className="harness-text-button"
        disabled={isPending}
        onClick={() => {
          setConfirming(false);
        }}
      >
        [ Keep ]
      </button>
      <button
        type="button"
        className="harness-text-button danger"
        disabled={isPending}
        onClick={() => void discard()}
      >
        [ Discard ]
      </button>
      {failure && (
        <span className="start-over-failure" role="alert">
          {failure}
        </span>
      )}
    </div>
  );
}

/**
 * The anonymous harness while the provider is disabled: the Home request as the first message,
 * one labelled system row and the manual path. There is no composer, so nothing can be sent.
 * A configured optional sign-in still opens the account conversation.
 */
function DisabledHarness({
  conversation,
  route,
  signIn,
}: {
  conversation: Conversation;
  route: 'google' | 'demo' | 'unavailable';
  signIn: React.ReactNode;
}) {
  return (
    <div className="harness-root">
      <section className="harness-thread" aria-label="Conversation with PUNI">
        <div className="harness-column">
          <HarnessEyebrow />
          <div className="build-message user">
            <span className="message-label">YOU</span>
            <p>{conversation.description}</p>
          </div>
          <div className="build-message system build-disabled-row">
            <span className="message-label">PUNI · NOTICE</span>
            <p>AI chat isn’t switched on yet. A person still reads every brief.</p>
            <a className="harness-link" href="/manual">
              Shape your brief <span aria-hidden="true">→</span>
            </a>
          </div>
          {route !== 'unavailable' && signIn}
        </div>
      </section>
    </div>
  );
}

/**
 * Keeps the composer above an on-screen keyboard where the browser shrinks only the visual
 * viewport (iOS Safari): the uncovered height becomes `--keyboard-inset` on the root. Browsers
 * without `visualViewport` resize the layout viewport instead, so the inset stays zero there.
 */
function useKeyboardInset(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    function update(): void {
      if (!viewport) return;
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      root.style.setProperty('--keyboard-inset', `${String(Math.round(inset))}px`);
    }
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      root.style.removeProperty('--keyboard-inset');
    };
  }, []);
}

export function BuildPage() {
  const [load, setLoad] = useState<BuildLoad>({ kind: 'loading' });
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [remainingTurns, setRemainingTurns] = useState(0);
  const [isHandedOff, setHandedOff] = useState(false);
  const [isSignInOpen, setSignInOpen] = useState(false);
  useKeyboardInset();

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
      if (session.account) {
        if (!session.csrfToken) throw new Error('Account session lacks a CSRF token');
        const draft: Draft = session.draft
          ? { ...session.draft, csrfToken: session.csrfToken }
          : await requestJson<Draft>('/draft', { signal: controller.signal });
        const history = await requestJson<ChatHistory>('/chat', { signal: controller.signal });
        setRemainingTurns(history.remainingTurns);
        setLoad({ kind: 'account', session, draft, history });
        return;
      }
      const harness = resolveAnonymousHarness(
        siteOrigin,
        entry,
        await requestJson<unknown>('/conversation', { signal: controller.signal }),
      );
      if (harness.kind !== 'disabled' && harness.kind !== 'live')
        throw new Error(`Unexpected harness state ${harness.kind}`);
      setLoad({
        kind: 'anonymous',
        session,
        harness: harness.kind,
        conversation: harness.conversation,
      });
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

  const route =
    load.kind === 'anonymous'
      ? signInRoute({
          mode: load.session.mode,
          configured: load.session.configured,
          signedIn: false,
        })
      : 'unavailable';
  const heading = useHeadingFocus(load.kind);
  usePageTitle(load.kind === 'error' ? 'Build unavailable' : 'Build');

  const signIn = (
    <section className="harness-signin" aria-labelledby="signin-heading">
      <h2 id="signin-heading" className="message-label">
        Optional · explore with AI
      </h2>
      {route === 'google' ? (
        <>
          <p>Sign in with Google to keep this request with your account before any AI call.</p>
          <a className="glass-button" href={`${apiOrigin}/session/oidc/start`}>
            Continue with Google <span aria-hidden="true">→</span>
          </a>
        </>
      ) : (
        <>
          <p>This local test sign-in does not verify your identity.</p>
          <form onSubmit={(event) => void signInDemo(event)}>
            <label htmlFor="demo-email">Demo email</label>
            <div className="glass-field has-pill">
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
              <button className="composer-send-pill" disabled={pending}>
                Enter local demo
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );

  return (
    <div className="page-shell build-page night-shell">
      <HeroMedia />
      <SiteHeader buildCurrent="page" tone="night" rail="overlay" />
      <main className="harness" id="main">
        <h1 ref={heading} tabIndex={-1} className="visually-hidden">
          {load.kind === 'anonymous' || load.kind === 'account'
            ? 'Shape the work together.'
            : 'Build'}
        </h1>
        {load.kind === 'anonymous' && !isHandedOff && (
          <div className="harness-bar">
            {load.harness === 'live' && route !== 'unavailable' && (
              <button
                type="button"
                className="harness-text-button"
                aria-expanded={isSignInOpen}
                aria-controls="harness-signin"
                onClick={() => {
                  setSignInOpen(!isSignInOpen);
                }}
              >
                [ Sign in ]
              </button>
            )}
            <StartOver csrfToken={load.conversation.csrfToken} />
          </div>
        )}
        {load.kind === 'anonymous' && load.harness === 'live' && isSignInOpen && (
          <div className="harness-column harness-signin-panel" id="harness-signin">
            {signIn}
          </div>
        )}
        {load.kind === 'loading' && (
          <div className="harness-state" role="status">
            <div className="spinner" aria-hidden="true" />
            <p>Checking your request…</p>
          </div>
        )}
        {load.kind === 'error' && (
          <div className="harness-state" role="alert">
            <h2>We couldn’t load Build.</h2>
            <p>{load.message}</p>
            <div className="harness-actions">
              <button type="button" className="glass-button" onClick={() => void loadBuild()}>
                Try again
              </button>
              <a className="glass-button quiet" href={`${siteOrigin}/`}>
                Back to Home
              </a>
            </div>
          </div>
        )}
        {load.kind === 'anonymous' && load.harness === 'disabled' && (
          <DisabledHarness conversation={load.conversation} route={route} signIn={signIn} />
        )}
        {load.kind === 'anonymous' && load.harness === 'live' && (
          <LiveHarness
            initial={load.conversation}
            onReload={() => void loadBuild()}
            onHandedOff={() => {
              setHandedOff(true);
            }}
          />
        )}
        {load.kind === 'account' && (
          <Conversation
            key={load.history.requestId ?? 'current'}
            session={load.session}
            draft={load.draft}
            history={load.history}
            remainingTurns={remainingTurns}
            onAllowance={setRemainingTurns}
          />
        )}
        {message && (
          <p className="harness-status" role="status">
            {message}
          </p>
        )}
      </main>
    </div>
  );
}
