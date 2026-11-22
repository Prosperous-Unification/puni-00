import { expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import type { Conversation } from './build-contract';
import { LiveHarness, PausedHarness } from './conversation-harness';
import { RequestEditor } from './request-editor';

const configuredApi = process.env['VITE_API_ORIGIN'] ?? 'http://localhost:3101';
const proposalDestination = `${configuredApi}/proposals`;
const streamDestination = `${configuredApi}/conversation/stream`;
const csrfToken = 'a'.repeat(64);
const conversation: Conversation = {
  scoping: { version: 'legacy' },
  stage: 'contact',
  turns: [{ role: 'assistant', content: 'Your brief is ready.' }],
  visitorTurnsRemaining: 5,
  visitorTurnLimit: 8,
  provider: 'openrouter',
  brief: 'A booking tool',
  description: 'A booking tool',
  csrfToken,
  initialOperation: { state: 'completed', idempotencyKey: 'initial:draft-1', truncated: false },
  latestOperation: null,
  exhaustedReason: null,
  challenge: null,
};

/** Mounts actual public forms on a URL whose query and fragment must never become destinations. */
async function withPage(run: (dom: JSDOM, container: HTMLDivElement) => Promise<void>) {
  const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', {
    url: 'https://request.puni.dev/manual?q=PRIVATE_QUERY&utm_campaign=PRIVATE_CAMPAIGN#PRIVATE_HASH',
  });
  const network = globalThis.fetch;
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    sessionStorage: globalThis.sessionStorage,
  };
  Object.assign(dom.window, {
    matchMedia: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
  Object.assign(dom.window.HTMLElement.prototype, { scrollIntoView: () => undefined });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    sessionStorage: dom.window.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = dom.window.document.querySelector<HTMLDivElement>('#root');
  if (!container) throw new Error('Missing test root');
  try {
    await run(dom, container);
  } finally {
    globalThis.fetch = network;
    Object.assign(globalThis, previous);
    dom.window.close();
  }
}

/** Exercises the mounted form's DOM destination and its original credentialed JSON handler. */
async function checkForm(
  dom: JSDOM,
  container: HTMLDivElement,
  selector: string,
  destination: string,
  payload: Record<string, unknown>,
) {
  const form = container.querySelector<HTMLFormElement>(selector);
  if (!form) throw new Error(`Missing public form: ${selector}`);
  expect(form.action).toBe(destination);
  expect(form.method).toBe('post');
  const requests: { url: string; init: RequestInit }[] = [];
  const network = globalThis.fetch;
  globalThis.fetch = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (!init) throw new Error('Missing submission options');
      requests.push({ url: input instanceof Request ? input.url : String(input), init });
      return Promise.resolve(
        destination === streamDestination
          ? Response.json({ code: 'provider_busy' }, { status: 409 })
          : Response.json({ receipt: 'PUBLIC-REFERENCE' }, { status: 201 }),
      );
    },
    { preconnect: network.preconnect },
  );
  const submission = new dom.window.Event('submit', { bubbles: true, cancelable: true });
  await act(async () => {
    form.dispatchEvent(submission);
    await Bun.sleep(10);
  });
  expect(submission.defaultPrevented).toBe(true);
  expect(requests).toHaveLength(1);
  const request = requests[0];
  expect(request.url).toBe(destination);
  expect(request.init.method).toBe('POST');
  expect(request.init.credentials).toBe('include');
  const headers = new Headers(request.init.headers);
  expect(headers.get('content-type')).toBe('application/json');
  expect(headers.get('x-puni-csrf')).toBe(csrfToken);
  if (typeof request.init.body !== 'string') throw new Error('Missing JSON body');
  expect(JSON.parse(request.init.body)).toMatchObject(payload);
}

/** Unmounts after each actual component, including failed destination assertions. */
async function checkComponent(
  component: ReactNode,
  selector: string,
  destination: string,
  payload: Record<string, unknown>,
) {
  await withPage(async (dom, container) => {
    const root = createRoot(container);
    try {
      act(() => {
        root.render(component);
      });
      await checkForm(dom, container, selector, destination, payload);
    } finally {
      act(() => {
        root.unmount();
      });
    }
  });
}

for (const route of ['manual', 'default'] as const)
  test(`versioned ${route} request form excludes the visitor URL and preserves JSON submission`, async () => {
    await checkComponent(
      <RequestEditor
        draft={{
          ...conversation,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
          scoping: {
            version: 1,
            startConversation: route === 'default',
            startingChoice: 'improve',
            questionId: null,
            revision: 0,
            references: null,
            candidateBrief: null,
            emailInvitationDeclined: false,
          },
        }}
        route={route}
        open
        contact
        onOpen={() => undefined}
        onClose={() => undefined}
        onSubmitted={() => undefined}
      />,
      'form',
      proposalDestination,
      { version: 1, email: '', brief: 'A booking tool', idempotencyKey: expect.any(String) },
    );
  });

for (const provider of ['openrouter', 'paused'] as const)
  test(`legacy ${provider} proposal form excludes the visitor URL and preserves JSON submission`, async () => {
    await checkComponent(
      provider === 'paused' ? (
        <PausedHarness conversation={{ ...conversation, provider }} onHandedOff={() => undefined} />
      ) : (
        <LiveHarness
          initial={conversation}
          onReload={() => undefined}
          onHandedOff={() => undefined}
        />
      ),
      '.proposal-card form',
      proposalDestination,
      { email: '', brief: 'A booking tool', idempotencyKey: expect.any(String) },
    );
  });

for (const version of ['legacy', 1] as const)
  test(`${String(version)} composer excludes the visitor URL and preserves its stream POST`, async () => {
    await checkComponent(
      <LiveHarness
        initial={{
          ...conversation,
          stage: 'clarify',
          turns: [],
          brief: '',
          scoping:
            version === 'legacy'
              ? { version: 'legacy' }
              : {
                  version: 1,
                  startConversation: true,
                  startingChoice: 'improve',
                  questionId: null,
                  revision: 0,
                  references: null,
                  candidateBrief: null,
                  emailInvitationDeclined: false,
                },
          initialOperation: {
            state: 'unknown',
            idempotencyKey: 'initial:draft-1',
            truncated: false,
          },
        }}
        onReload={() => undefined}
        onHandedOff={() => undefined}
      />,
      '.harness-composer',
      streamDestination,
      { initial: true, idempotencyKey: 'initial:draft-1' },
    );
  });

test('mounted legacy manual form excludes the visitor URL and preserves JSON submission', async () => {
  await withPage(async (dom, container) => {
    const network = globalThis.fetch;
    globalThis.fetch = Object.assign(
      (input: Parameters<typeof fetch>[0]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url !== `${configuredApi}/draft`) throw new Error(`Unexpected load: ${url}`);
        return Promise.resolve(
          Response.json({
            ...conversation,
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          }),
        );
      },
      { preconnect: network.preconnect },
    );
    await act(async () => {
      await import('./main');
      await Bun.sleep(10);
    });
    await checkForm(dom, container, 'form.field', proposalDestination, {
      email: '',
      brief: 'A booking tool',
      idempotencyKey: expect.any(String),
    });
  });
});
