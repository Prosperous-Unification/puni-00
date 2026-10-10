import { replyReplacePart } from '@website/contracts';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Conversation } from './build-contract';
import { LiveHarness, PausedHarness, SignOut } from './conversation-harness';

const reply = [
  'Here is the brief as I understand it:',
  '[brief]',
  '- Users: workshop volunteers',
  '[/brief]',
  'Is this right?',
].join('\n');

const briefed: Conversation = {
  stage: 'contact',
  turns: [
    { role: 'user', content: 'A booking tool' },
    { role: 'assistant', content: 'Who uses it?' },
    { role: 'user', content: 'Volunteers' },
    { role: 'assistant', content: 'What do they do today?' },
    { role: 'user', content: 'Paper' },
    { role: 'assistant', content: reply },
  ],
  visitorTurnsRemaining: 5,
  visitorTurnLimit: 8,
  provider: 'openrouter',
  brief: '- Users: workshop volunteers',
  description: 'A booking tool',
  csrfToken: 'a'.repeat(64),
  initialOperation: { state: 'completed', idempotencyKey: 'initial:draft-1', truncated: false },
  latestOperation: {
    state: 'completed',
    idempotencyKey: 'turn-3',
    truncated: false,
    message: 'Paper',
  },
  exhaustedReason: null,
  challenge: null,
};

test('the rendered thread never shows brief markers', () => {
  const markup = renderToStaticMarkup(
    <LiveHarness initial={briefed} onReload={() => undefined} onHandedOff={() => undefined} />,
  );
  expect(markup).toContain('- Users: workshop volunteers');
  expect(markup).toContain('Is this right?');
  // Proof: rendering `turn.content` unfiltered put both markers in this markup.
  expect(markup).not.toContain('[brief]');
  expect(markup).not.toContain('[/brief]');
});

test("the allowance line uses the server's turn limit", () => {
  const markup = renderToStaticMarkup(
    <LiveHarness
      initial={{ ...briefed, visitorTurnLimit: 5, visitorTurnsRemaining: 2 }}
      onReload={() => undefined}
      onHandedOff={() => undefined}
    />,
  );
  // Proof: rendering the limit from a FE constant of 8 made this markup read "2 of 8".
  expect(markup.replaceAll('<!-- -->', '')).toContain('2 of 5 messages left');
});

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:4201/',
});
const realFetch = globalThis.fetch;

beforeAll(() => {
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    sessionStorage: dom.window.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
});
afterAll(() => {
  globalThis.fetch = realFetch;
  dom.window.close();
});

const decline =
  "I can't help with that request. If there's a software problem you'd like PUNI to look at, describe it and I'll help shape it into a brief.";

/** Waits, inside act, until `isReady` holds or a bounded number of turns pass. */
async function settleUntil(isReady: () => boolean, describe: () => string): Promise<void> {
  for (let turn = 0; turn < 50 && !isReady(); turn += 1)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  if (!isReady()) throw new Error(`The harness never reached the expected state: ${describe()}`);
}

test('a reply replacement shows only the decline, never the partial text glued to it', async () => {
  const unsent: Conversation = {
    ...briefed,
    stage: 'clarify',
    turns: [],
    brief: '',
    visitorTurnsRemaining: 8,
    initialOperation: { state: 'not-started', idempotencyKey: 'initial:draft-1', truncated: false },
    latestOperation: null,
  };
  const encoder = new TextEncoder();
  const sse = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
  const refreshed = Promise.withResolvers<Response>();
  globalThis.fetch = Object.assign(
    (input: Parameters<typeof fetch>[0]) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/conversation/stream'))
        return Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                sse.resolve(controller);
              },
            }),
            { headers: { 'content-type': 'text/event-stream' } },
          ),
        );
      // The post-finish reread is held, so the live reply is what the visitor sees.
      if (url.endsWith('/conversation')) return refreshed.promise;
      throw new Error(`Unexpected request ${url}`);
    },
    { preconnect: realFetch.preconnect },
  );
  const container = dom.window.document.createElement('div');
  dom.window.document.body.replaceChildren(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <LiveHarness initial={unsent} onReload={() => undefined} onHandedOff={() => undefined} />,
    );
    await Promise.resolve();
  });
  const form = container.querySelector('form');
  if (!form) throw new Error('composer form missing');
  await act(async () => {
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  const controller = await sse.promise;
  const send = (chunk: unknown) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
  };
  const reply = () => container.querySelector('.build-message.assistant p')?.textContent ?? '';
  send({ type: 'start' });
  send({ type: 'text-start', id: 't1' });
  send({ type: 'text-delta', id: 't1', delta: 'I can’t help build' });
  await settleUntil(() => reply() === 'I can’t help build', reply);
  send({ type: 'text-end', id: 't1' });
  send({ type: replyReplacePart, data: { text: decline } });
  send({ type: 'finish', finishReason: 'stop' });
  controller.enqueue(encoder.encode('data: [DONE]\n\n'));
  controller.close();
  // Proof: dropping the replacement branch in conversation-harness.tsx left "I can’t help build"
  // here; appending the replacement as a delta showed the glued text.
  await settleUntil(() => reply() === decline, reply);
  expect(reply()).toBe(decline);
  expect(container.querySelectorAll('.build-message.assistant')).toHaveLength(1);
  refreshed.resolve(
    new Response(
      JSON.stringify({
        ...unsent,
        turns: [
          { role: 'user', content: unsent.description },
          { role: 'assistant', content: decline },
        ],
        visitorTurnsRemaining: 7,
        initialOperation: {
          state: 'completed',
          idempotencyKey: 'initial:draft-1',
          truncated: false,
        },
        latestOperation: {
          state: 'completed',
          idempotencyKey: 'initial:draft-1',
          truncated: false,
          message: unsent.description,
        },
      }),
      { headers: { 'content-type': 'application/json' } },
    ),
  );
  await settleUntil(
    () => container.querySelector('#build-message:not([readonly])') !== null,
    () => container.innerHTML,
  );
  expect(reply()).toBe(decline);
  act(() => {
    root.unmount();
  });
});

test('a proposal refused by a daily cap shows the cap copy in the card', async () => {
  globalThis.fetch = Object.assign(
    (input: Parameters<typeof fetch>[0]) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/proposals'))
        return Promise.resolve(
          new Response(JSON.stringify({ code: 'proposal_email_limit' }), {
            status: 429,
            headers: { 'content-type': 'application/json', 'retry-after': '3600' },
          }),
        );
      throw new Error(`Unexpected request ${url}`);
    },
    { preconnect: realFetch.preconnect },
  );
  const container = dom.window.document.createElement('div');
  dom.window.document.body.replaceChildren(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <LiveHarness initial={briefed} onReload={() => undefined} onHandedOff={() => undefined} />,
    );
    await Promise.resolve();
  });
  const card = container.querySelector('.proposal-card form');
  if (!card) throw new Error('proposal card missing');
  await act(async () => {
    card.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  const failure = () => container.querySelector('.proposal-failure')?.textContent ?? '';
  // Proof: dropping the limit branch in ProposalCard showed the generic failure copy here.
  await settleUntil(
    () => failure() === 'This email address sent several briefs today. Try again tomorrow.',
    failure,
  );
  act(() => {
    root.unmount();
  });
});

test('the paused harness shows the paused row, the manual path and the card, no composer', () => {
  const markup = renderToStaticMarkup(
    <PausedHarness
      conversation={{ ...briefed, provider: 'paused' }}
      onHandedOff={() => undefined}
    />,
  );
  // Proof: rendering the disabled copy here instead failed this assertion.
  expect(markup).toContain('AI chat is paused right now. A person still reads every brief.');
  expect(markup).toContain('Shape your brief');
  expect(markup).not.toContain('isn’t switched on yet');
  expect(markup).toContain('Request a proposal');
  expect(markup).not.toContain('harness-composer');
});

const freshChallenge = {
  salt: '0123456789abcdef.2026-10-07.1791370800000.200000.a1b2c3d4',
  challenge: 'b'.repeat(64),
  signature: 'c'.repeat(64),
  maxnumber: 200_000,
};

const unsentWithCheck: Conversation = {
  ...briefed,
  stage: 'clarify',
  turns: [],
  brief: '',
  visitorTurnsRemaining: 8,
  initialOperation: { state: 'not-started', idempotencyKey: 'initial:draft-1', truncated: false },
  latestOperation: null,
  challenge: { ...freshChallenge, expiresAt: Date.now() + 30 * 60_000 },
};

/** Stubs fetch: records stream POST bodies and answers them with `streamStatus`. */
function stubApi(options: { streamStatus?: number; streamCode?: string; reread?: unknown }) {
  const posts: unknown[] = [];
  const reads: string[] = [];
  globalThis.fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/conversation/stream')) {
        const body =
          input instanceof Request
            ? await input.text()
            : typeof init?.body === 'string'
              ? init.body
              : '';
        posts.push(JSON.parse(body));
        if (options.streamStatus)
          return new Response(JSON.stringify({ code: options.streamCode }), {
            status: options.streamStatus,
            headers: { 'content-type': 'application/json' },
          });
        return new Response(
          'data: {"type":"start"}\n\ndata: {"type":"finish"}\n\ndata: [DONE]\n\n',
          {
            headers: { 'content-type': 'text/event-stream' },
          },
        );
      }
      if (url.endsWith('/conversation')) {
        reads.push(url);
        return new Response(JSON.stringify(options.reread), {
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request ${url}`);
    },
    { preconnect: realFetch.preconnect },
  );
  return { posts, reads };
}

async function mountHarness(
  conversation: Conversation,
  solveCheck: (challenge: unknown) => Promise<number | null>,
) {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.replaceChildren(container);
  const root = createRoot(container);
  const seenChecking: boolean[] = [];
  const observer = new dom.window.MutationObserver(() => {
    if (container.querySelector('.harness-checking')) seenChecking.push(true);
  });
  observer.observe(container, { childList: true, subtree: true });
  await act(async () => {
    root.render(
      <LiveHarness
        initial={conversation}
        onReload={() => undefined}
        onHandedOff={() => undefined}
        solveCheck={solveCheck}
      />,
    );
    await Promise.resolve();
  });
  const submit = async () => {
    const form = container.querySelector('form.harness-composer');
    if (!form) throw new Error('composer form missing');
    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
  };
  return {
    container,
    submit,
    seenChecking,
    unmount: () => {
      observer.disconnect();
      act(() => {
        root.unmount();
      });
    },
  };
}

test('a pre-solved check is sent with the one initial POST and no checking status', async () => {
  const api = stubApi({ reread: { ...unsentWithCheck, challenge: null } });
  const solved: unknown[] = [];
  const harness = await mountHarness(unsentWithCheck, (challenge) => {
    solved.push(challenge);
    return Promise.resolve(4_242);
  });
  await settleUntil(
    () => solved.length === 1,
    () => String(solved.length),
  );
  await harness.submit();
  await settleUntil(
    () => api.posts.length === 1,
    () => JSON.stringify(api.posts),
  );
  // Proof: posting before the solution resolved sent the initial POST without `check`.
  expect(api.posts[0]).toEqual({
    idempotencyKey: 'initial:draft-1',
    initial: true,
    check: {
      salt: freshChallenge.salt,
      challenge: freshChallenge.challenge,
      signature: freshChallenge.signature,
      number: 4_242,
    },
  });
  expect(harness.seenChecking).toEqual([]);
  harness.unmount();
});

test('an expired check is re-read and solved again behind the checking status', async () => {
  const renewed = { ...freshChallenge, challenge: 'd'.repeat(64) };
  const api = stubApi({
    reread: {
      ...unsentWithCheck,
      challenge: { ...renewed, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() },
    },
  });
  const pendingSolve = Promise.withResolvers<number | null>();
  const solved: { challenge: string }[] = [];
  const harness = await mountHarness(
    { ...unsentWithCheck, challenge: { ...freshChallenge, expiresAt: Date.now() - 1 } },
    (challenge) => {
      solved.push(challenge as { challenge: string });
      return solved.length === 1 ? Promise.resolve(1) : pendingSolve.promise;
    },
  );
  await harness.submit();
  await settleUntil(
    () => harness.container.querySelector('.harness-checking') !== null,
    () => harness.container.innerHTML,
  );
  expect(harness.container.querySelector('.harness-checking')?.getAttribute('aria-live')).toBe(
    'polite',
  );
  expect(api.reads).toHaveLength(1);
  expect(api.posts).toHaveLength(0);
  pendingSolve.resolve(77);
  await settleUntil(
    () => api.posts.length === 1,
    () => JSON.stringify(api.posts),
  );
  expect(api.posts[0]).toMatchObject({ check: { challenge: 'd'.repeat(64), number: 77 } });
  harness.unmount();
});

test('a solver that cannot run shows the manual path and sends nothing', async () => {
  const api = stubApi({});
  const harness = await mountHarness(unsentWithCheck, () =>
    Promise.reject(new Error('Worker and main-thread solve unavailable')),
  );
  await harness.submit();
  await settleUntil(
    () => harness.container.querySelector('.harness-check-failed') !== null,
    () => harness.container.innerHTML,
  );
  expect(harness.container.querySelector('.harness-check-failed a')?.getAttribute('href')).toBe(
    '/manual',
  );
  expect(api.posts).toHaveLength(0);
  harness.unmount();
});

test('a refused check from the API shows the manual path', async () => {
  const api = stubApi({ streamStatus: 403, streamCode: 'challenge_invalid' });
  const harness = await mountHarness(unsentWithCheck, () => Promise.resolve(5));
  await harness.submit();
  await settleUntil(
    () => harness.container.querySelector('.harness-check-failed') !== null,
    () => harness.container.innerHTML,
  );
  expect(api.posts).toHaveLength(1);
  expect(harness.container.querySelector('.harness-interrupted')).toBeNull();
  harness.unmount();
});

test('a session shows Sign out, which ends it with the session CSRF token', async () => {
  const deletes: { method: string; csrf: string | null }[] = [];
  globalThis.fetch = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.endsWith('/session')) throw new Error(`Unexpected request ${url}`);
      deletes.push({
        method: init?.method ?? 'GET',
        csrf: new Headers(init?.headers).get('x-puni-csrf'),
      });
      return Promise.resolve(new Response(null, { status: 204 }));
    },
    { preconnect: realFetch.preconnect },
  );
  const container = dom.window.document.createElement('div');
  dom.window.document.body.replaceChildren(container);
  const root = createRoot(container);
  let signedOut = 0;
  await act(async () => {
    root.render(
      <SignOut
        csrfToken="session-csrf"
        onSignedOut={() => {
          signedOut += 1;
        }}
      />,
    );
    await Promise.resolve();
  });
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === '[ Sign out ]',
  );
  if (!button) throw new Error('Sign out is missing');
  await act(async () => {
    button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
  await settleUntil(
    () => signedOut === 1,
    () => JSON.stringify(deletes),
  );
  expect(deletes).toEqual([{ method: 'DELETE', csrf: 'session-csrf' }]);
  act(() => {
    root.unmount();
  });
});
