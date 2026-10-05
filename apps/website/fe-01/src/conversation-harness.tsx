import { DefaultChatTransport, type UIMessage } from 'ai';
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { ApiFailure, apiOrigin, requestJson, streamFetch } from './api';
import { describeFailure, unreachableMessage } from './app-flow';
import {
  type Conversation,
  type ConversationAttempt,
  describeExhaustion,
  offersProposal,
  parseConversation,
  selectComposerMode,
  selectStoppedAttempt,
} from './build-contract';

/** Characters a visitor may send after the Home request; the API refuses longer messages. */
const messageLimit = 1_500;
const turnLimit = 8;
const proposalKeyName = 'puni_build_proposal_key';
const interruptedText = 'The reply stopped before it was confirmed. You can retry.';

/** The reply being streamed, or the last one that ended without a confirmed finish. */
interface LiveReply {
  attempt: ConversationAttempt;
  text: string;
  phase: 'submitted' | 'streaming' | 'stopped' | 'failed';
  failure: string;
}

/**
 * Maps a refused or broken stream request to the line under the reply. A refusal that changes
 * the conversation (exhaustion, an unavailable provider, a lost claim) is refreshed by the caller.
 */
function describeStreamFailure(error: unknown): string {
  if (error instanceof ApiFailure) {
    if (error.code === 'rate_limited' || error.code === 'provider_busy')
      return 'PUNI is busy right now. Try again in a minute.';
    if (error.code === 'chat_inflight') return 'PUNI is still answering that message.';
    if (error.status === 429) return 'This conversation reached a limit.';
    if (error.status === 503) return 'AI chat is not available right now.';
  }
  if (error instanceof TypeError) return unreachableMessage;
  return describeFailure(error);
}

/** Whether a refusal changed what the server will offer, so the saved conversation is reread. */
function changesConversation(error: unknown): boolean {
  return (
    error instanceof ApiFailure &&
    ((error.status === 429 && !['rate_limited', 'provider_busy'].includes(error.code)) ||
      error.status === 503 ||
      error.status === 401 ||
      error.code === 'chat_inflight' ||
      error.code === 'initial_required')
  );
}

function readProposalKey(): string {
  const saved = sessionStorage.getItem(proposalKeyName);
  if (saved) return saved;
  const created = crypto.randomUUID();
  sessionStorage.setItem(proposalKeyName, created);
  return created;
}

/**
 * The live anonymous conversation: saved turns from `GET /conversation`, an explicit first Send
 * of the read-only Home request under the server identity, streamed replies with a typing
 * indicator, Stop (which posts the cancel), Retry under the same identity, the inline proposal
 * card and the exhausted line. `onReload` reruns the page load when the claim or provider changed.
 */
export function LiveHarness({
  initial,
  onReload,
  onHandedOff,
}: {
  initial: Conversation;
  onReload: () => void;
  onHandedOff: () => void;
}) {
  const [conversation, setConversation] = useState(initial);
  const [live, setLive] = useState<LiveReply | null>(null);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  const reading = useRef<AbortController | null>(null);
  const stopping = useRef<string | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const isSimulated = conversation.provider === 'demo';
  const mode = selectComposerMode(conversation);
  const stopped = live === null ? selectStoppedAttempt(conversation) : null;
  const isBusy = live?.phase === 'submitted' || live?.phase === 'streaming';

  useLayoutEffect(() => {
    const viewport = thread.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [conversation.turns.length, live?.text, live?.phase, receipt, stopped?.idempotencyKey]);

  async function refresh(): Promise<void> {
    try {
      setConversation(parseConversation(await requestJson<unknown>('/conversation')));
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) onReload();
      else setNotice(`The conversation could not be refreshed. ${describeFailure(error)}`);
    }
  }

  async function send(attempt: ConversationAttempt): Promise<void> {
    if (isBusy) return;
    const controller = new AbortController();
    reading.current = controller;
    stopping.current = null;
    // A function, not an inline comparison: stop() sets the ref while this send awaits.
    const isStopRequested = () => stopping.current === attempt.idempotencyKey;
    setNotice('');
    setLive({ attempt, text: '', phase: 'submitted', failure: '' });
    let text = '';
    let errorText = '';
    let isFinished = false;
    try {
      const transport = new DefaultChatTransport<UIMessage>({
        api: `${apiOrigin}/conversation/stream`,
        credentials: 'include',
        headers: { 'X-Puni-CSRF': conversation.csrfToken },
        fetch: streamFetch,
        prepareSendMessagesRequest: () => ({
          body: attempt.initial
            ? { idempotencyKey: attempt.idempotencyKey, initial: true }
            : { idempotencyKey: attempt.idempotencyKey, message: attempt.message },
        }),
      });
      const stream = await transport.sendMessages({
        trigger: 'submit-message',
        chatId: 'conversation',
        messageId: undefined,
        messages: [],
        abortSignal: controller.signal,
      });
      const reader = stream.getReader();
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        const chunk = next.value;
        // After Stop the remaining chunks are drained, not shown; stop() owns the state.
        if (isStopRequested()) continue;
        if (chunk.type === 'text-delta') {
          text += chunk.delta;
          setLive({ attempt, text, phase: 'streaming', failure: '' });
        } else if (chunk.type === 'error') errorText = chunk.errorText;
        else if (chunk.type === 'finish') isFinished = true;
      }
    } catch (error) {
      // Stop already rendered the stopped state and posts the cancel itself.
      if (controller.signal.aborted || isStopRequested()) return;
      setLive({ attempt, text, phase: 'failed', failure: describeStreamFailure(error) });
      if (error instanceof ApiFailure && error.status === 503) onReload();
      else if (changesConversation(error)) {
        await refresh();
        if (error instanceof ApiFailure && error.status === 429 && error.code !== 'provider_busy')
          setLive(null);
      }
      return;
    } finally {
      if (reading.current === controller) reading.current = null;
    }
    if (isStopRequested()) return;
    if (isFinished) {
      await refresh();
      setLive(null);
      return;
    }
    // A stream that ends without `finish` was settled at its reservation by the server.
    setLive({ attempt, text, phase: 'failed', failure: errorText || interruptedText });
    await refresh();
  }

  async function stop(): Promise<void> {
    if (!live || !isBusy) return;
    const attempt = live.attempt;
    const controller = reading.current;
    stopping.current = attempt.idempotencyKey;
    setLive({ ...live, phase: 'stopped' });
    try {
      await requestJson('/conversation/cancel', {
        method: 'POST',
        headers: { 'X-Puni-CSRF': conversation.csrfToken },
        body: JSON.stringify({ idempotencyKey: attempt.idempotencyKey }),
      });
    } catch (error) {
      // The disconnect already stopped the reply, or the request never reached the API.
      const isSettled =
        error instanceof ApiFailure &&
        (error.code === 'chat_not_running' || error.code === 'chat_unavailable');
      if (!isSettled) setNotice(`The stop request needs attention. ${describeFailure(error)}`);
    } finally {
      // Disconnecting also settles the reply on the server if the cancel did not arrive.
      controller?.abort();
    }
    await refresh();
  }

  function sendDraft(): void {
    const message = draft.trim();
    if (!message || isBusy || mode.kind !== 'open') return;
    // The message moves into the thread; a failed reply keeps it there with Retry.
    setDraft('');
    void send({ idempotencyKey: crypto.randomUUID(), message, initial: false });
  }

  function handleKeys(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    // Proof: disabling this branch so Enter falls through to the textarea made conversation.mjs
    // fail with "Keyboard check: Enter inserted a newline instead of sending".
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendDraft();
    }
  }

  const retryable = live?.phase === 'stopped' || live?.phase === 'failed' ? live.attempt : stopped;
  const pendingMessage = live?.attempt.message ?? stopped?.message ?? null;
  const assistantLabel = isSimulated ? 'PUNI · SIMULATED' : 'PUNI';
  // Once the Home request is in the thread (sending, stopped or failed), the composer stops
  // repeating it; Retry in the thread resends it under the same identity.
  const isHomeInThread = mode.kind === 'initial' && pendingMessage !== null;
  const offersInitialSend = mode.kind === 'initial' && !isBusy && !isHomeInThread;
  const remaining = conversation.visitorTurnsRemaining;

  return (
    <div className="harness-root">
      <div
        className="harness-thread"
        ref={thread}
        role="region"
        aria-label="Conversation with PUNI"
        tabIndex={-1}
      >
        <div className="harness-column">
          <p className="harness-eyebrow">[ AI can do everything. It doesn’t want anything. ]</p>
          {isSimulated && (
            <p className="harness-simulated">
              <span className="simulated-chip">Simulated</span>
              Local demo replies. No AI model is involved.
            </p>
          )}
          {conversation.turns.length === 0 && pendingMessage === null && (
            <p className="harness-empty">
              Your Home request is ready below. Press Send when you want to start the conversation.
            </p>
          )}
          {conversation.turns.map((turn, index) => (
            <div key={index} className={`build-message ${turn.role}`}>
              <span className="message-label">{turn.role === 'user' ? 'YOU' : assistantLabel}</span>
              <p>{turn.content}</p>
            </div>
          ))}
          {conversation.latestOperation?.truncated && live === null && (
            <p className="harness-aside">This reply reached its length limit.</p>
          )}
          {pendingMessage !== null && (
            <div className="build-message user">
              <span className="message-label">YOU</span>
              <p>{pendingMessage}</p>
            </div>
          )}
          {live !== null && (
            <div
              className={
                live.phase === 'stopped' || live.phase === 'failed'
                  ? 'build-message assistant interrupted'
                  : 'build-message assistant'
              }
              aria-busy={isBusy}
            >
              <span className="message-label">{assistantLabel}</span>
              {live.phase === 'submitted' ? (
                <span className="typing" role="img" aria-label="PUNI is thinking">
                  <span />
                  <span />
                  <span />
                </span>
              ) : (
                live.text && (
                  <p>
                    {live.text}
                    {live.phase === 'streaming' && <span className="caret" aria-hidden="true" />}
                  </p>
                )
              )}
            </div>
          )}
          {retryable !== null && (
            <div className="harness-interrupted" role="status">
              <span className="interrupted-label">
                {live?.phase === 'failed' ? live.failure : 'Stopped'}
              </span>
              <button
                type="button"
                className="harness-text-button"
                onClick={() => void send(retryable)}
              >
                [ Retry ]
              </button>
            </div>
          )}
          {(offersProposal(conversation) || receipt !== null) && (
            <ProposalCard
              conversation={conversation}
              receipt={receipt}
              onSubmitted={(reference) => {
                sessionStorage.removeItem(proposalKeyName);
                setReceipt(reference);
                onHandedOff();
              }}
            />
          )}
        </div>
      </div>
      <div className="harness-dock">
        <div className="harness-column">
          {notice && (
            <p className="harness-status" role="status">
              {notice}
            </p>
          )}
          {receipt !== null ? (
            <p className="harness-closed">Your request is with a person at PUNI.</p>
          ) : mode.kind === 'closed' ? (
            <p className="harness-closed">{describeExhaustion(mode.reason)}</p>
          ) : mode.kind === 'answering' ? (
            <p className="harness-closed">
              PUNI is still answering your last message.
              <button type="button" className="harness-text-button" onClick={() => void refresh()}>
                [ Refresh ]
              </button>
            </p>
          ) : (
            <form
              className="harness-composer"
              onSubmit={(event) => {
                event.preventDefault();
                if (mode.kind === 'initial') void send(mode.attempt);
                else sendDraft();
              }}
            >
              <div className={offersInitialSend ? 'glass-field has-pill' : 'glass-field'}>
                <label className="visually-hidden" htmlFor="build-message">
                  {mode.kind === 'initial' ? 'Your request' : 'Your message'}
                </label>
                {mode.kind === 'initial' ? (
                  <textarea
                    id="build-message"
                    value={isHomeInThread ? '' : mode.attempt.message}
                    placeholder={
                      isBusy ? 'PUNI is answering your request…' : 'Retry above to send it again.'
                    }
                    readOnly
                    rows={1}
                  />
                ) : (
                  <textarea
                    id="build-message"
                    value={draft}
                    placeholder="Reply to PUNI…"
                    maxLength={messageLimit}
                    rows={1}
                    onChange={(event) => {
                      setDraft(event.target.value);
                    }}
                    onKeyDown={handleKeys}
                  />
                )}
                {/* Distinct keys: a reused node would turn the clicked Stop into a submit button
                    before the click's default action runs, sending the draft again. */}
                {isBusy ? (
                  <button
                    key="stop"
                    type="button"
                    className="composer-round composer-stop"
                    aria-label="Stop response"
                    onClick={() => void stop()}
                  >
                    <span className="stop-glyph" aria-hidden="true" />
                  </button>
                ) : offersInitialSend ? (
                  <button key="send-initial" className="composer-send-pill" type="submit">
                    Send <span aria-hidden="true">↗</span>
                  </button>
                ) : mode.kind === 'initial' ? null : (
                  <button
                    key="send"
                    className="composer-round composer-send"
                    type="submit"
                    aria-label="Send message"
                    disabled={!draft.trim()}
                  >
                    <SendArrow />
                  </button>
                )}
              </div>
              <p className="harness-meta">
                <span>
                  {remaining} of {turnLimit} messages left
                  {isSimulated ? ' · Simulated' : ''}
                </span>
                <span className="harness-shortcut">
                  Enter to send · Shift + Enter for a new line
                </span>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
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

/**
 * The inline conversion card: the editable brief (the server-stored brief, else the Home
 * request), an email field and `Request a proposal` through the existing `POST /proposals` with
 * the draft claim and CSRF. Success replaces the form with the opaque receipt. There is never a
 * price, date or contract field.
 */
function ProposalCard({
  conversation,
  receipt,
  onSubmitted,
}: {
  conversation: Conversation;
  receipt: string | null;
  onSubmitted: (receipt: string) => void;
}) {
  const [brief, setBrief] = useState(conversation.brief || conversation.description);
  const [email, setEmail] = useState('');
  const [isPending, setPending] = useState(false);
  const [failure, setFailure] = useState('');
  const thanks = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  useEffect(() => {
    if (receipt !== null) thanks.current?.focus();
  }, [receipt]);

  async function submit(event: React.SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setFailure('');
    try {
      const answer = await requestJson<{ receipt: string }>('/proposals', {
        method: 'POST',
        headers: { 'X-Puni-CSRF': conversation.csrfToken },
        body: JSON.stringify({ email, brief, idempotencyKey: readProposalKey() }),
      });
      onSubmitted(answer.receipt);
    } catch (error) {
      setFailure(
        error instanceof ApiFailure && error.code === 'invalid_proposal'
          ? 'Check the email address and the brief.'
          : describeFailure(error),
      );
    } finally {
      setPending(false);
    }
  }

  if (receipt !== null)
    return (
      <section className="proposal-card" aria-labelledby={headingId}>
        <h2 id={headingId} ref={thanks} tabIndex={-1} className="proposal-thanks">
          Thank you.
        </h2>
        <p>A person at PUNI reads your brief and replies by email.</p>
        <p className="proposal-receipt">
          Your reference <strong className="reference">{receipt}</strong>
        </p>
      </section>
    );
  return (
    <section className="proposal-card" aria-labelledby={headingId}>
      <h2 id={headingId} className="message-label">
        [ YOUR BRIEF ]
      </h2>
      <p className="proposal-lead">
        A person at PUNI reads every brief. Edit it if anything is off, then leave your email.
      </p>
      <form onSubmit={(event) => void submit(event)}>
        <label className="visually-hidden" htmlFor="proposal-brief">
          Your brief
        </label>
        <textarea
          id="proposal-brief"
          className="proposal-brief"
          value={brief}
          maxLength={4_000}
          rows={6}
          required
          onChange={(event) => {
            setBrief(event.target.value);
          }}
        />
        <label htmlFor="proposal-email" className="proposal-label">
          Email
        </label>
        <div className="proposal-actions">
          <div className="glass-field">
            <input
              id="proposal-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </div>
          <button className="composer-send-pill" type="submit" disabled={isPending}>
            Request a proposal <span aria-hidden="true">↗</span>
          </button>
        </div>
        {failure && (
          <p className="proposal-failure" role="alert">
            {failure}
          </p>
        )}
      </form>
    </section>
  );
}
