import React, { useEffect, useRef, useState } from 'react';

import { requestJson, sendCommand } from './api';
import { describeFailure } from './app-flow';
import {
  buildReturnUrl,
  type Conversation,
  parseEntry,
  resolveHarness,
  startOverUrl,
} from './build-contract';
import { HeroMedia, SiteHeader, siteOrigin, useHeadingFocus, usePageTitle } from './chrome';
import { LiveHarness, PausedHarness } from './conversation-harness';

/** Renders an impossible app state explicitly instead of a blank page. */
export class AppErrorBoundary extends React.Component<
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
          <p className="eyebrow">PUNI</p>
          <h1>This page needs your attention.</h1>
          <p className="lead">{this.state.message}</p>
          <button
            type="button"
            className="button"
            onClick={() => {
              window.location.reload();
            }}
          >
            Reload
          </button>
        </div>
      </main>
    );
  }
}

type BuildLoad =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      harness: 'disabled' | 'paused' | 'live';
      conversation: Conversation;
    }
  | { kind: 'error'; message: string };

function HarnessEyebrow() {
  return <p className="harness-eyebrow">[ AI can do everything. It doesn’t want anything. ]</p>;
}

/**
 * Discards the browser's saved request after an inline confirmation, then lands on the site's
 * empty Home prompt. Only an unsubmitted draft can be discarded; the API refuses a consumed one.
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
 * The harness while the provider is disabled: the Home request as the first message,
 * one labelled system row and the manual path. There is no composer, so nothing can be sent.
 */
function DisabledHarness({ conversation }: { conversation: Conversation }) {
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
  const [isHandedOff, setHandedOff] = useState(false);
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
      const harness = resolveHarness(
        siteOrigin,
        entry,
        await requestJson<unknown>('/conversation', { signal: controller.signal }),
      );
      if (harness.kind !== 'disabled' && harness.kind !== 'paused' && harness.kind !== 'live')
        throw new Error(`Unexpected harness state ${harness.kind}`);
      setLoad({
        kind: 'ready',
        harness: harness.kind,
        conversation: harness.conversation,
      });
    } catch (error) {
      setLoad({
        kind: 'error',
        message: controller.signal.aborted
          ? 'Build did not respond within 10 seconds. Try again.'
          : describeFailure(error),
      });
    } finally {
      window.clearTimeout(deadline);
    }
  }

  useEffect(() => {
    void loadBuild();
  }, []);

  const heading = useHeadingFocus(load.kind);
  usePageTitle(load.kind === 'error' ? 'Build unavailable' : 'Build');

  return (
    <div className="page-shell build-page night-shell">
      <HeroMedia />
      <SiteHeader buildCurrent="page" tone="night" rail="overlay" />
      <main className="harness" id="main">
        <h1 ref={heading} tabIndex={-1} className="visually-hidden">
          {load.kind === 'ready' ? 'Shape the work together.' : 'Build'}
        </h1>
        {load.kind === 'ready' && !isHandedOff && (
          <div className="harness-bar">
            <StartOver csrfToken={load.conversation.csrfToken} />
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
        {load.kind === 'ready' && load.harness === 'disabled' && (
          <DisabledHarness conversation={load.conversation} />
        )}
        {load.kind === 'ready' && load.harness === 'paused' && (
          <PausedHarness
            conversation={load.conversation}
            onHandedOff={() => {
              setHandedOff(true);
            }}
          />
        )}
        {load.kind === 'ready' && load.harness === 'live' && (
          <LiveHarness
            initial={load.conversation}
            onReload={() => void loadBuild()}
            onHandedOff={() => {
              setHandedOff(true);
            }}
          />
        )}
      </main>
    </div>
  );
}
